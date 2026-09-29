import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, getOwnedChat } from "@/lib/auth-helpers";
import { assemblePrompt, findMatchingLoreEntries } from "@/lib/prompt-builder";
import { getActiveLoreEntriesForChat } from "@/lib/lorebook";
import { GenerationService } from "@/lib/services/generation";

export async function GET(req, { params }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Secure owner authorization check
    const chat = await getOwnedChat(user.id, id);
    if (!chat) {
      return NextResponse.json({ error: "Chat thread not found or access denied" }, { status: 404 });
    }

    let messages = await prisma.message.findMany({
      where: { chatId: id },
      orderBy: { createdAt: "asc" },
      include: {
        swipes: {
          orderBy: { index: "asc" },
        },
      },
    });

    // If chat thread is blank, seed the character greeting and initial swipe
    if (messages.length === 0) {
      const greetingContent = chat.character.greeting || "Hello!";

      const greetingMessage = await prisma.message.create({
        data: {
          chatId: id,
          role: "assistant",
          speaker: chat.character.name,
          content: greetingContent,
          swipes: {
            create: {
              index: 0,
              content: greetingContent,
              selected: true,
            },
          },
        },
        include: {
          swipes: true,
        },
      });

      messages = [greetingMessage];
    }

    // Parse persisted settings if any
    let settings = null;
    if (chat.settings) {
      try {
        settings = JSON.parse(chat.settings);
      } catch {}
    }

    return NextResponse.json({
      messages,
      chat: {
        id: chat.id,
        title: chat.title,
        settings,
        scenarioOverride: chat.scenarioOverride,
        character: chat.character,
      },
    });
  } catch (error) {
    console.error("[MESSAGES_GET_ERROR]", error.message);
    return NextResponse.json({ error: "Failed to load chat messages" }, { status: 500 });
  }
}

export async function POST(req, { params }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const chat = await getOwnedChat(user.id, id);
    if (!chat) {
      return NextResponse.json({ error: "Chat thread not found or access denied" }, { status: 404 });
    }

    const body = await req.json();
    const {
      content,
      imageUrl,
      action = "generate", // "generate" | "regenerate" | "swipe" | "continue"
      targetMessageId = null,
      model = "google/gemini-2.5-flash",
      temperature = 1.0,
      maxTokens = 2048,
      reasoning = false,
      scenarioOverride,
    } = body;

    // Optional scenario override update
    if (scenarioOverride !== undefined && scenarioOverride !== chat.scenarioOverride) {
      await prisma.chat.update({
        where: { id },
        data: { scenarioOverride },
      });
      chat.scenarioOverride = scenarioOverride;
    }

    // Persist chat generation settings
    const settingsObj = { model, temperature, maxTokens, reasoning };
    await prisma.chat.update({
      where: { id },
      data: {
        settings: JSON.stringify(settingsObj),
        updatedAt: new Date(),
      },
    });

    // Check custom API key if present
    const headerApiKey = req.headers.get("x-custom-api-key");
    const customApiKey = headerApiKey || body.customApiKey || user.customApiKey || null;
    const isUsingCustomKey = Boolean(customApiKey && customApiKey.trim().length > 0);
    const cost = isUsingCustomKey ? 0 : 2;

    let userMessage = null;

    // Handle normal "generate" turn
    if (action === "generate") {
      if (!content || !content.trim()) {
        return NextResponse.json({ error: "Message content is required" }, { status: 400 });
      }

      // Persist the user turn
      userMessage = await prisma.message.create({
        data: {
          chatId: id,
          role: "user",
          speaker: user.name || "User",
          content: content.trim(),
          imageUrl: imageUrl || null,
        },
      });
    }

    // Load recent history for prompt assembly
    const previousMessages = await prisma.message.findMany({
      where: { chatId: id },
      orderBy: { createdAt: "asc" },
    });

    // Separate recent conversation history from the active turn prompt
    let historyMessages = previousMessages;
    let inputPrompt = content;

    if (action === "generate") {
      // Exclude current user turn from system prompt history (it is passed directly as prompt)
      historyMessages = previousMessages.filter((m) => m.id !== userMessage?.id);
      inputPrompt = content;
    } else if (action === "continue") {
      // Continue continues the last assistant response
      historyMessages = previousMessages;
      inputPrompt = "[Please continue your previous response seamlessly.]";
    } else if (action === "regenerate" || action === "swipe") {
      // Target assistant message is being replaced / given a new swipe
      const targetId = targetMessageId || [...previousMessages].reverse().find((m) => m.role === "assistant")?.id;
      const targetIndex = targetId ? previousMessages.findIndex((m) => m.id === targetId) : -1;
      const effectiveMessages = targetIndex >= 0 ? previousMessages.slice(0, targetIndex) : previousMessages;

      // Find the preceding user turn to serve as the prompt
      const lastUserTurn = [...effectiveMessages].reverse().find((m) => m.role === "user");
      inputPrompt = lastUserTurn ? lastUserTurn.content : "Continue the roleplay.";

      // History includes prior messages up to the user turn
      historyMessages = lastUserTurn ? effectiveMessages.filter((m) => m.id !== lastUserTurn.id) : effectiveMessages;
    }

    // Resolve lorebook entries
    const availableLore = await getActiveLoreEntriesForChat(user.id, chat.characterId);
    const recentText = previousMessages.slice(-5).map((m) => m.content).join(" ");
    const activeLoreEntries = findMatchingLoreEntries(recentText, availableLore);

    // Assemble modular prompt with last 10 messages of conversation history in system prompt
    const { systemPrompt } = assemblePrompt({
      character: chat.character,
      chat,
      messages: historyMessages,
      activeLoreEntries,
      storySummary: chat.storySummary,
      historyCount: 10,
    });

    // Execute generation via durable GenerationService
    const generationResult = await GenerationService.run({
      chatId: id,
      userId: user.id,
      action,
      targetMessageId,
      model,
      temperature,
      maxTokens,
      reasoning,
      systemPrompt,
      prompt: inputPrompt,
      imageUrl: action === "generate" ? imageUrl : null,
      cost,
      customApiKey,
    });

    let assistantMessage = null;

    if (action === "swipe" && targetMessageId) {
      // Add a new swipe alternative to existing assistant message
      const existingMessage = await prisma.message.findUnique({
        where: { id: targetMessageId },
        include: { swipes: true },
      });

      if (!existingMessage) {
        return NextResponse.json({ error: "Target message for swipe not found" }, { status: 404 });
      }

      const nextIndex = existingMessage.swipes.length;
      // Mark earlier swipes as unselected
      await prisma.messageSwipe.updateMany({
        where: { messageId: targetMessageId },
        data: { selected: false },
      });

      const newSwipe = await prisma.messageSwipe.create({
        data: {
          messageId: targetMessageId,
          index: nextIndex,
          content: generationResult.text,
          generationRunId: generationResult.generationRunId,
          selected: true,
        },
      });

      // Update message content to match newly selected swipe
      assistantMessage = await prisma.message.update({
        where: { id: targetMessageId },
        data: {
          content: generationResult.text,
          editedAt: new Date(),
        },
        include: {
          swipes: { orderBy: { index: "asc" } },
        },
      });
    } else if (action === "regenerate") {
      // Find the latest assistant message
      const lastAssistantMessage = [...previousMessages].reverse().find((m) => m.role === "assistant");
      if (lastAssistantMessage) {
        const existingSwipes = await prisma.messageSwipe.findMany({
          where: { messageId: lastAssistantMessage.id },
        });

        await prisma.messageSwipe.updateMany({
          where: { messageId: lastAssistantMessage.id },
          data: { selected: false },
        });

        await prisma.messageSwipe.create({
          data: {
            messageId: lastAssistantMessage.id,
            index: existingSwipes.length,
            content: generationResult.text,
            generationRunId: generationResult.generationRunId,
            selected: true,
          },
        });

        assistantMessage = await prisma.message.update({
          where: { id: lastAssistantMessage.id },
          data: {
            content: generationResult.text,
            editedAt: new Date(),
          },
          include: {
            swipes: { orderBy: { index: "asc" } },
          },
        });
      }
    } else {
      // Normal generate or continue: create new assistant message
      assistantMessage = await prisma.message.create({
        data: {
          chatId: id,
          role: "assistant",
          speaker: chat.character.name,
          content: generationResult.text,
          swipes: {
            create: {
              index: 0,
              content: generationResult.text,
              generationRunId: generationResult.generationRunId,
              selected: true,
            },
          },
        },
        include: {
          swipes: true,
        },
      });
    }

    return NextResponse.json({
      userMessage,
      assistantMessage,
      remainingCredits: generationResult.remainingCredits,
    });
  } catch (error) {
    console.error("[MESSAGES_POST_ERROR]", error.message);
    const status = error.statusCode || 500;
    return NextResponse.json({ error: error.message || "Generation error" }, { status });
  }
}
