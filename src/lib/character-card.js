/**
 * SillyTavern Character Card V2/V3 Parser & Exporter
 * Losslessly handles standard character cards, alternate greetings, scenarios,
 * and unknown extension fields.
 */

/**
 * Normalizes an imported Character Card (JSON object or string)
 */
export function parseCharacterCard(input) {
  let raw = input;
  if (typeof input === "string") {
    try {
      raw = JSON.parse(input);
    } catch {
      throw new Error("Invalid character card JSON format");
    }
  }

  if (!raw || typeof raw !== "object") {
    throw new Error("Character card payload is empty or not an object");
  }

  // Detect V2/V3 card structure (often under `data` key) or flat structure
  const data = raw.data || raw;

  const name = (data.name || raw.name || "Unnamed Character").trim();
  const description = (data.description || raw.description || "").trim();
  const personality = (data.personality || raw.personality || "").trim();
  const scenario = (data.scenario || raw.scenario || "").trim();
  const greeting = (data.first_mes || raw.first_mes || data.greeting || raw.greeting || "Hello!").trim();
  const exampleDialogue = (data.mes_example || raw.mes_example || "").trim();
  const systemPrompt = (data.system_prompt || raw.system_prompt || "").trim();
  const creatorNotes = (data.creator_notes || raw.creator_notes || data.comment || "").trim();

  // Alternate greetings
  let alternateGreetings = [];
  if (Array.isArray(data.alternate_greetings)) {
    alternateGreetings = data.alternate_greetings;
  } else if (Array.isArray(raw.alternate_greetings)) {
    alternateGreetings = raw.alternate_greetings;
  }

  // Tags
  let tags = [];
  if (Array.isArray(data.tags)) {
    tags = data.tags;
  } else if (Array.isArray(raw.tags)) {
    tags = raw.tags;
  }

  // Embedded Lorebook (World Info)
  const characterBook = data.character_book || raw.character_book || null;

  return {
    name,
    description: description || personality || "An AI companion.",
    personality: personality || description,
    scenario,
    greeting,
    exampleDialogue,
    systemPrompt: systemPrompt || `You are ${name}. Stay fully in character.`,
    alternateGreetings,
    tags,
    creatorNotes,
    cardVersion: raw.spec_version || raw.spec || "v2",
    characterBook,
    // Store original JSON for lossless export
    rawCardJson: JSON.stringify(raw),
  };
}

/**
 * Exports a Character record into a standard SillyTavern V2 Character Card format.
 */
export function exportCharacterCard(character) {
  // If we already have preserved rawCardJson, merge updates while preserving unknown extensions
  let baseCard = {};
  if (character.cardJson) {
    try {
      baseCard = JSON.parse(character.cardJson);
    } catch {}
  }

  const existingData = baseCard.data || {};

  let altGreetings = [];
  try {
    if (typeof character.alternateGreetings === "string") {
      altGreetings = JSON.parse(character.alternateGreetings);
    } else if (Array.isArray(character.alternateGreetings)) {
      altGreetings = character.alternateGreetings;
    }
  } catch {}

  let parsedTags = [];
  try {
    if (typeof character.tags === "string") {
      parsedTags = JSON.parse(character.tags);
    } else if (Array.isArray(character.tags)) {
      parsedTags = character.tags;
    }
  } catch {}

  const cardData = {
    ...existingData,
    name: character.name,
    description: character.description,
    personality: character.personality,
    scenario: character.scenario || existingData.scenario || "",
    first_mes: character.greeting,
    mes_example: character.exampleDialogue || existingData.mes_example || "",
    system_prompt: character.systemPrompt || existingData.system_prompt || "",
    creator_notes: character.creatorNotes || existingData.creator_notes || "",
    alternate_greetings: altGreetings.length > 0 ? altGreetings : existingData.alternate_greetings || [],
    tags: parsedTags.length > 0 ? parsedTags : existingData.tags || [],
    extensions: existingData.extensions || {},
  };

  return {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: cardData,
  };
}
