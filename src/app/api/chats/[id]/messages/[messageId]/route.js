import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser, getOwnedChat } from "@/lib/auth-helpers";

export async function PATCH(req, { params }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, messageId } = await params;
    const chat = await getOwnedChat(user.id, id);
    if (!chat) {
      return NextResponse.json({ error: "Chat thread not found or access denied" }, { status: 404 });
    }

    const body = await req.json();
    const { content, selectedSwipeIndex } = body;

    const message = await prisma.message.findFirst({
      where: { id: messageId, chatId: id },
      include: { swipes: true },
    });

    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    // Switch active swipe
    if (selectedSwipeIndex !== undefined) {
      const targetSwipe = message.swipes.find((s) => s.index === selectedSwipeIndex);
      if (!targetSwipe) {
        return NextResponse.json({ error: "Swipe alternative not found" }, { status: 404 });
      }

      await prisma.messageSwipe.updateMany({
        where: { messageId },
        data: { selected: false },
      });

      await prisma.messageSwipe.update({
        where: { id: targetSwipe.id },
        data: { selected: true },
      });

      const updated = await prisma.message.update({
        where: { id: messageId },
        data: { content: targetSwipe.content },
        include: { swipes: { orderBy: { index: "asc" } } },
      });

      return NextResponse.json({ message: updated });
    }

    // Edit message content
    if (content !== undefined) {
      const updated = await prisma.message.update({
        where: { id: messageId },
        data: {
          content,
          editedAt: new Date(),
        },
        include: { swipes: { orderBy: { index: "asc" } } },
      });

      return NextResponse.json({ message: updated });
    }

    return NextResponse.json({ error: "No update parameters provided" }, { status: 400 });
  } catch (error) {
    console.error("[MESSAGE_PATCH_ERROR]", error.message);
    return NextResponse.json({ error: "Failed to update message" }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, messageId } = await params;
    const chat = await getOwnedChat(user.id, id);
    if (!chat) {
      return NextResponse.json({ error: "Chat thread not found or access denied" }, { status: 404 });
    }

    const message = await prisma.message.findFirst({
      where: { id: messageId, chatId: id },
    });

    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    await prisma.message.delete({
      where: { id: messageId },
    });

    return NextResponse.json({ success: true, deletedMessageId: messageId });
  } catch (error) {
    console.error("[MESSAGE_DELETE_ERROR]", error.message);
    return NextResponse.json({ error: "Failed to delete message" }, { status: 500 });
  }
}
