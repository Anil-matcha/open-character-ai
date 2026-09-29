import { prisma } from "@/lib/prisma";

/**
 * Loads all active lorebook entries relevant to a chat session.
 * Scope resolution: character-specific lore + user's global lore.
 */
export async function getActiveLoreEntriesForChat(userId, characterId) {
  try {
    const lorebooks = await prisma.lorebook.findMany({
      where: {
        OR: [
          { userId, characterId },
          { userId, characterId: null },
          { characterId },
        ],
      },
      include: {
        entries: {
          where: { enabled: true },
          orderBy: { order: "asc" },
        },
      },
    });

    const allEntries = [];
    for (const lb of lorebooks) {
      allEntries.push(...lb.entries);
    }

    return allEntries;
  } catch (err) {
    console.error("[LOREBOOK_FETCH_ERROR]", err);
    return [];
  }
}
