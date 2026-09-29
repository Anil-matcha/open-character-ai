import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-helpers";
import { parseCharacterCard } from "@/lib/character-card";

export async function POST(req) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized. Please sign in to import characters." }, { status: 401 });
    }

    const payload = await req.json();
    const cardData = parseCharacterCard(payload);

    // Save character preserving raw lossless cardJson and roleplay fields
    const character = await prisma.character.create({
      data: {
        name: cardData.name,
        avatar: cardData.name.substring(0, 2).toUpperCase() || "🎭",
        description: cardData.description,
        personality: cardData.personality,
        systemPrompt: cardData.systemPrompt,
        greeting: cardData.greeting,
        scenario: cardData.scenario || "",
        exampleDialogue: cardData.exampleDialogue || "",
        alternateGreetings: JSON.stringify(cardData.alternateGreetings || []),
        tags: JSON.stringify(cardData.tags || []),
        creatorNotes: cardData.creatorNotes || "",
        cardVersion: cardData.cardVersion,
        cardJson: cardData.rawCardJson,
        isCustom: true,
        // Product Principle: Never make an imported character public without explicit consent
        isPublic: false,
        userId: user.id,
      },
    });

    // If character included an embedded lorebook, import it too
    if (cardData.characterBook && Array.isArray(cardData.characterBook.entries)) {
      const lorebook = await prisma.lorebook.create({
        data: {
          userId: user.id,
          characterId: character.id,
          name: cardData.characterBook.name || `${character.name} World Info`,
          description: cardData.characterBook.description || `Lorebook for ${character.name}`,
        },
      });

      for (const entry of cardData.characterBook.entries) {
        if (!entry.content) continue;
        const keys = Array.isArray(entry.keys) ? entry.keys.join(", ") : entry.keys || "";
        await prisma.loreEntry.create({
          data: {
            lorebookId: lorebook.id,
            keys,
            content: entry.content,
            order: entry.insertion_order || entry.order || 100,
            enabled: entry.enabled !== false,
            scope: "character",
          },
        });
      }
    }

    return NextResponse.json({ character }, { status: 201 });
  } catch (error) {
    console.error("[CHARACTER_IMPORT_ERROR]", error.message);
    return NextResponse.json({ error: error.message || "Failed to import character card" }, { status: 400 });
  }
}
