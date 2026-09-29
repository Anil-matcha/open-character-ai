import { prisma } from "../prisma.js";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const MAX_POLL_TIMEOUT_MS = 60000; // 60 seconds maximum generation polling deadline
const POLL_INTERVAL_MS = 1500;

/**
 * Service to manage model generations with durable lifecycle,
 * idempotent credit ledger entries, and bounded polling.
 */
export class GenerationService {
  /**
   * Executes a generation request.
   */
  static async run({
    chatId,
    userId,
    action = "generate", // "generate" | "regenerate" | "swipe" | "continue"
    targetMessageId = null,
    model = "google/gemini-2.5-flash",
    temperature = 1.0,
    maxTokens = 2048,
    reasoning = false,
    systemPrompt,
    prompt,
    imageUrl = null,
    cost = 2,
    customApiKey = null,
  }) {
    const isUsingCustomKey = Boolean(customApiKey && customApiKey.trim().length > 0);
    const effectiveCost = isUsingCustomKey ? 0 : cost;
    const idempotencyKey = `gen_${chatId}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // 1. Check user credit balance if using site credits
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error("User account not found");
    }

    if (!isUsingCustomKey && user.credits < effectiveCost) {
      const err = new Error(`Insufficient credits. Required: ${effectiveCost}, Available: ${user.credits}`);
      err.statusCode = 402;
      throw err;
    }

    // 2. Create durable GenerationRun and CreditLedgerEntry transaction
    let ledgerEntry = null;
    let generationRun = null;

    if (!isUsingCustomKey && effectiveCost > 0) {
      // Deduct credits and record ledger entry
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: { credits: { decrement: effectiveCost } },
        });

        ledgerEntry = await tx.creditLedgerEntry.create({
          data: {
            userId,
            amount: -effectiveCost,
            type: "generation_charge",
            status: "reserved",
            idempotencyKey,
            description: `Model generation (${model}) for chat ${chatId}`,
          },
        });

        generationRun = await tx.generationRun.create({
          data: {
            chatId,
            targetMessageId,
            action,
            status: "submitted",
            provider: "muapi",
            model,
            cost: effectiveCost,
            settingsSnapshot: JSON.stringify({ temperature, maxTokens, reasoning, isUsingCustomKey }),
            promptSnapshot: prompt,
          },
        });
      });
    } else {
      generationRun = await prisma.generationRun.create({
        data: {
          chatId,
          targetMessageId,
          action,
          status: "submitted",
          provider: "muapi",
          model,
          cost: 0,
          settingsSnapshot: JSON.stringify({ temperature, maxTokens, reasoning, isUsingCustomKey }),
          promptSnapshot: prompt,
        },
      });
    }

    const apiKey = isUsingCustomKey ? customApiKey.trim() : process.env.MU_API_KEY;
    if (!apiKey) {
      await this._handleFailure(generationRun.id, ledgerEntry, userId, effectiveCost, "API key configuration missing");
      throw new Error("API key is not configured");
    }

    try {
      // 3. Submit upstream prediction request to MuAPI
      const isVision = Boolean(imageUrl);
      const apiUrl = isVision
        ? "https://api.muapi.ai/api/v1/openrouter-vision"
        : "https://api.muapi.ai/api/v1/any-llm-models";

      const payload = {
        prompt,
        system_prompt: systemPrompt,
        model,
        temperature: parseFloat(temperature),
        max_tokens: parseInt(maxTokens),
        reasoning: Boolean(reasoning),
      };

      if (isVision) {
        payload.images_list = [imageUrl];
      }

      let activeApiKey = apiKey;
      let usingCustomKeyForCall = isUsingCustomKey;
      let effectiveCharge = effectiveCost;

      let response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": activeApiKey,
        },
        body: JSON.stringify(payload),
      });

      // If custom key was rejected with 401/403 and platform key is available with user credits, automatically fall back
      if (!response.ok && (response.status === 401 || response.status === 403) && usingCustomKeyForCall) {
        const platformApiKey = process.env.MU_API_KEY;
        if (platformApiKey && user.credits >= 2) {
          console.warn("[CUSTOM_KEY_REJECTED] Custom key failed with 403. Automatically falling back to server MU_API_KEY and platform credits.");
          activeApiKey = platformApiKey;
          usingCustomKeyForCall = false;
          effectiveCharge = 2;

          // Deduct 2 site credits for fallback
          await prisma.user.update({
            where: { id: userId },
            data: { credits: { decrement: 2 } },
          });

          ledgerEntry = await prisma.creditLedgerEntry.create({
            data: {
              userId,
              generationRunId: generationRun.id,
              amount: -2,
              type: "generation_charge_fallback",
              status: "reserved",
              idempotencyKey: `fb_${idempotencyKey}`,
              description: `Fallback generation charge (custom key ${response.status})`,
            },
          });

          // Retry with platform key
          response = await fetch(apiUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": activeApiKey,
            },
            body: JSON.stringify(payload),
          });
        }
      }

      if (!response.ok) {
        let errMessage = response.statusText;
        try {
          const errData = await response.json();
          errMessage = errData.detail || errData.error?.message || errData.message || response.statusText;
        } catch {
          try {
            errMessage = await response.text();
          } catch {}
        }

        const contextHint = usingCustomKeyForCall
          ? `Custom MuAPI Key rejected (${response.status}: ${errMessage}). Check or remove your custom API key in Navbar settings to use account credits.`
          : `AI Provider returned error (${response.status}: ${errMessage})`;

        await this._handleFailure(generationRun.id, ledgerEntry, userId, effectiveCharge, contextHint);
        throw new Error(contextHint);
      }

      const data = await response.json();
      const requestId = data.request_id;
      if (!requestId) {
        await this._handleFailure(generationRun.id, ledgerEntry, userId, effectiveCost, "No request_id returned");
        throw new Error("Failed to initialize upstream generation task");
      }

      // Update generation run with upstream request ID
      await prisma.generationRun.update({
        where: { id: generationRun.id },
        data: { requestId, status: "running" },
      });

      // 4. Bounded polling with deadline safeguard
      let completedText = "";
      const startTime = Date.now();

      while (Date.now() - startTime < MAX_POLL_TIMEOUT_MS) {
        await delay(POLL_INTERVAL_MS);

        const checkRes = await fetch(`https://api.muapi.ai/api/v1/predictions/${requestId}/result`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": activeApiKey,
          },
        });

        if (checkRes.ok) {
          const checkData = await checkRes.json();
          const state = (checkData.status || checkData.state || "processing").toLowerCase();

          if (state === "completed" || state === "succeeded") {
            completedText =
              checkData.outputs?.[0] ||
              (typeof checkData.output === "string" ? checkData.output : "") ||
              checkData.output?.text ||
              checkData.output?.choices?.[0]?.message?.content ||
              checkData.response ||
              "";
            break;
          } else if (state === "failed") {
            await this._handleFailure(generationRun.id, ledgerEntry, userId, effectiveCharge, "Upstream prediction failed");
            throw new Error("Generation task failed upstream");
          } else if (state === "cancelled") {
            await this._handleFailure(generationRun.id, ledgerEntry, userId, effectiveCharge, "Generation was cancelled");
            throw new Error("Generation was cancelled");
          }
        }
      }

      if (!completedText && Date.now() - startTime >= MAX_POLL_TIMEOUT_MS) {
        await this._handleFailure(generationRun.id, ledgerEntry, userId, effectiveCharge, "Generation timed out after 60s");
        throw new Error("Generation timed out. Credits have been refunded.");
      }

      // 5. Successful completion: update GenerationRun and settle ledger
      await prisma.generationRun.update({
        where: { id: generationRun.id },
        data: {
          status: "succeeded",
          completedAt: new Date(),
        },
      });

      if (ledgerEntry) {
        await prisma.creditLedgerEntry.update({
          where: { id: ledgerEntry.id },
          data: { status: "settled" },
        });
      }

      // Refresh remaining credits
      const updatedUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { credits: true },
      });

      return {
        text: completedText || "(Empty response)",
        generationRunId: generationRun.id,
        remainingCredits: isUsingCustomKey ? "∞" : updatedUser?.credits ?? 0,
      };
    } catch (err) {
      if (err.message && !err.message.includes("Credits have been refunded")) {
        await this._handleFailure(generationRun.id, ledgerEntry, userId, effectiveCost, err.message);
      }
      throw err;
    }
  }

  /**
   * Internal failure and refund recovery helper
   */
  static async _handleFailure(generationRunId, ledgerEntry, userId, cost, reason) {
    try {
      if (generationRunId) {
        await prisma.generationRun.update({
          where: { id: generationRunId },
          data: {
            status: "failed",
            error: reason,
            completedAt: new Date(),
          },
        });
      }

      if (ledgerEntry && cost > 0 && userId) {
        // Refund credits once
        await prisma.$transaction([
          prisma.user.update({
            where: { id: userId },
            data: { credits: { increment: cost } },
          }),
          prisma.creditLedgerEntry.update({
            where: { id: ledgerEntry.id },
            data: { status: "refunded" },
          }),
          prisma.creditLedgerEntry.create({
            data: {
              userId,
              generationRunId,
              amount: cost,
              type: "generation_refund",
              status: "settled",
              idempotencyKey: `ref_${ledgerEntry.idempotencyKey}`,
              description: `Refund for failed generation (${reason})`,
            },
          }),
        ]);
      }
    } catch (refundError) {
      console.error("[CRITICAL_REFUND_ERROR]", refundError.message);
    }
  }
}
