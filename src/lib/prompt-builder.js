/**
 * Prompt Builder Engine for Roleplay Studio
 * Follows SillyTavern-style modular context assembly with inspectable components.
 */

export function estimateTokens(text) {
  if (!text || typeof text !== "string") return 0;
  // Standard heuristic: ~4 characters per token for English text
  return Math.ceil(text.length / 4);
}

/**
 * Keyword matching for Lorebook / World Info entries.
 * Scans recent conversation text and character scenario for matching keys.
 */
export function findMatchingLoreEntries(textToScan, loreEntries = [], maxBudgetTokens = 1000) {
  if (!textToScan || !loreEntries || loreEntries.length === 0) return [];

  const normalizedScan = textToScan.toLowerCase();
  const matched = [];
  let currentTokens = 0;

  // Sort by priority/order ascending
  const sortedEntries = [...loreEntries]
    .filter((e) => e.enabled !== false)
    .sort((a, b) => (a.order || 100) - (b.order || 100));

  for (const entry of sortedEntries) {
    if (!entry.content) continue;

    // Parse keys (can be comma-separated or JSON array)
    let keys = [];
    try {
      if (entry.keys.startsWith("[")) {
        keys = JSON.parse(entry.keys);
      } else {
        keys = entry.keys.split(",").map((k) => k.trim());
      }
    } catch {
      keys = entry.keys.split(",").map((k) => k.trim());
    }

    const matchesKey = keys.some((k) => {
      if (!k) return false;
      const cleanKey = k.toLowerCase().trim();
      // Whole-word or substring match
      const regex = new RegExp(`\\b${cleanKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      return regex.test(normalizedScan);
    });

    if (matchesKey) {
      const entryTokens = estimateTokens(entry.content);
      if (currentTokens + entryTokens <= maxBudgetTokens) {
        matched.push(entry);
        currentTokens += entryTokens;
      }
    }
  }

  return matched;
}

/**
 * Builds the complete prompt structure with dedicated semantic blocks.
 */
export function assemblePrompt({
  character,
  chat = {},
  messages = [],
  persona = null,
  activeLoreEntries = [],
  storySummary = null,
  maxHistoryTokens = 3000,
  historyCount = 10,
}) {
  const blocks = [];

  // 1. Core Character Persona & System Directive
  const charHeader = [
    `### CHARACTER DEFINITION ###`,
    `Name: ${character.name}`,
    character.description ? `Description: ${character.description}` : "",
    character.personality ? `Personality: ${character.personality}` : "",
    character.scenario ? `Scenario: ${character.scenario}` : "",
    chat.scenarioOverride ? `Current Chat Scenario: ${chat.scenarioOverride}` : "",
    character.systemPrompt ? `\nInstructions:\n${character.systemPrompt}` : "",
  ].filter(Boolean).join("\n");
  blocks.push({ id: "character_definition", title: "Character Persona", content: charHeader });

  // 2. User Persona (if selected)
  if (persona && persona.name) {
    const personaBlock = [
      `### USER PERSONA ###`,
      `User Name: ${persona.name}`,
      persona.description ? `About User: ${persona.description}` : "",
    ].filter(Boolean).join("\n");
    blocks.push({ id: "user_persona", title: "User Persona", content: personaBlock });
  }

  // 3. Example Dialogues (from card specification)
  if (character.exampleDialogue && character.exampleDialogue.trim().length > 0) {
    blocks.push({
      id: "example_dialogue",
      title: "Example Dialogues",
      content: `### EXAMPLE DIALOGUE ###\n${character.exampleDialogue.trim()}`,
    });
  }

  // 4. Active Lorebook / World Info
  if (activeLoreEntries && activeLoreEntries.length > 0) {
    const loreContent = activeLoreEntries
      .map((entry) => `[${entry.keys}]: ${entry.content}`)
      .join("\n\n");
    blocks.push({
      id: "lorebook_entries",
      title: `World Info (${activeLoreEntries.length} active entries)`,
      content: `### RELEVANT WORLD LORE ###\n${loreContent}`,
    });
  }

  // 5. Rolling Long-term Story Summary & Pinned Facts
  if (storySummary && (storySummary.summary || storySummary.pinnedFacts)) {
    let pinnedList = [];
    try {
      if (typeof storySummary.pinnedFacts === "string" && storySummary.pinnedFacts.startsWith("[")) {
        pinnedList = JSON.parse(storySummary.pinnedFacts);
      }
    } catch {}

    const summaryParts = [
      `### STORY MEMORY ###`,
      storySummary.summary ? `Summary of earlier events:\n${storySummary.summary}` : "",
      pinnedList.length > 0 ? `Key Pinned Facts:\n- ${pinnedList.join("\n- ")}` : "",
    ].filter(Boolean).join("\n\n");

    blocks.push({ id: "story_memory", title: "Story Memory & Pinned Facts", content: summaryParts });
  }

  // 6. Recent Conversation History (Last 10 messages included directly in system prompt)
  const recentHistory = messages.slice(-historyCount);
  if (recentHistory.length > 0) {
    const formattedHistory = recentHistory
      .map((m) => {
        const speakerName = m.speaker || (m.role === "user" ? (persona?.name || "User") : character.name);
        return `${speakerName}: ${m.content}`;
      })
      .join("\n\n");

    blocks.push({
      id: "conversation_history",
      title: `Recent Conversation History (${recentHistory.length} messages)`,
      content: `### RECENT CONVERSATION HISTORY ###\n${formattedHistory}`,
    });
  }

  // 7. Roleplay Behavioral Guardrails
  const roleplayRules = `### ROLEPLAY RULES ###
1. Embody ${character.name} completely. Write in the first person directly as ${character.name}.
2. Never act as an AI assistant, helpful assistant, or mention language models or tokens.
3. Advance the story dynamically with dialogue, actions, sensory details, and thoughts based on the recent conversation history.
4. Reply directly to the USER's latest message naturally based on the conversation history. Do NOT repeat or parrot the history.
5. Do NOT prepend responses with speaker names like "User:" or "${character.name}:". Write only the in-character prose and speech.`;
  blocks.push({ id: "roleplay_rules", title: "Roleplay Directive", content: roleplayRules });

  // 7. Context History Budgeting
  // Take messages in reverse chronological order until budget is reached
  const structuredTurns = [];
  let consumedTokens = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const turnTokens = estimateTokens(msg.content);
    if (consumedTokens + turnTokens > maxHistoryTokens && structuredTurns.length >= 4) {
      break; // preserve minimum 4 turns even if over budget
    }
    structuredTurns.unshift({
      role: msg.role === "user" ? "user" : "assistant",
      speaker: msg.speaker || (msg.role === "user" ? (persona?.name || "User") : character.name),
      content: msg.content,
      imageUrl: msg.imageUrl || null,
    });
    consumedTokens += turnTokens;
  }

  // Flattened system instructions string for providers that require one system_prompt
  const fullSystemPrompt = blocks.map((b) => b.content).join("\n\n");

  return {
    blocks,
    systemPrompt: fullSystemPrompt,
    structuredTurns,
    estimatedTokens: estimateTokens(fullSystemPrompt) + consumedTokens,
  };
}
