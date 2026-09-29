import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, getOwnedChat } from "@/lib/auth-helpers";
import { assemblePrompt, findMatchingLoreEntries } from "@/lib/prompt-builder";
import { getActiveLoreEntriesForChat } from "@/lib/lorebook";

export async function GET(req, { params }) {
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

    const messages = await prisma.message.findMany({
      where: { chatId: id },
      orderBy: { createdAt: "asc" },
    });

    const availableLore = await getActiveLoreEntriesForChat(user.id, chat.characterId);
    const recentText = messages.slice(-5).map((m) => m.content).join(" ");
    const activeLoreEntries = findMatchingLoreEntries(recentText, availableLore);

    const assembled = assemblePrompt({
      character: chat.character,
      chat,
      messages,
      activeLoreEntries,
      storySummary: chat.storySummary,
      historyCount: 10,
    });

    return NextResponse.json({
      blocks: assembled.blocks,
      structuredTurnsCount: assembled.structuredTurns.length,
      estimatedTokens: assembled.estimatedTokens,
      activeLoreEntriesCount: activeLoreEntries.length,
      activeLoreEntries: activeLoreEntries.map((e) => ({
        id: e.id,
        keys: e.keys,
        scope: e.scope,
        content: e.content,
      })),
      character: {
        name: chat.character.name,
        scenario: chat.character.scenario,
        hasExampleDialogue: Boolean(chat.character.exampleDialogue),
      },
    });
  } catch (error) {
    console.error("[PROMPT_PREVIEW_ERROR]", error.message);
    return NextResponse.json({ error: "Failed to generate prompt preview" }, { status: 500 });
  }
}
