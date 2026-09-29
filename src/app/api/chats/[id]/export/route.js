import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, getOwnedChat } from "@/lib/auth-helpers";

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

    const { searchParams } = new URL(req.url);
    const format = searchParams.get("format") || "json";

    const messages = await prisma.message.findMany({
      where: { chatId: id },
      orderBy: { createdAt: "asc" },
      include: {
        swipes: { orderBy: { index: "asc" } },
      },
    });

    if (format === "text" || format === "markdown") {
      let doc = `# Roleplay Transcript: ${chat.character.name}\n`;
      doc += `Exported: ${new Date().toISOString()}\n\n`;
      doc += `---\n\n`;

      for (const m of messages) {
        const speaker = m.speaker || (m.role === "user" ? user.name || "User" : chat.character.name);
        doc += `**${speaker}**:\n${m.content}\n\n`;
      }

      return new NextResponse(doc, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="chat-${chat.character.name.toLowerCase().replace(/\s+/g, "_")}.md"`,
        },
      });
    }

    // Default JSON export (sanitized, excluding billing and private user keys)
    const exportPayload = {
      spec: "open_character_chat_v1",
      exportedAt: new Date().toISOString(),
      character: {
        name: chat.character.name,
        avatar: chat.character.avatar,
        description: chat.character.description,
        personality: chat.character.personality,
      },
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        speaker: m.speaker,
        content: m.content,
        imageUrl: m.imageUrl,
        createdAt: m.createdAt,
        editedAt: m.editedAt,
        swipes: m.swipes.map((s) => ({
          index: s.index,
          content: s.content,
          selected: s.selected,
        })),
      })),
    };

    return NextResponse.json(exportPayload);
  } catch (error) {
    console.error("[CHAT_EXPORT_ERROR]", error.message);
    return NextResponse.json({ error: "Failed to export chat" }, { status: 500 });
  }
}
