import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-helpers";

export async function DELETE(req, { params }) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const lorebook = await prisma.lorebook.findFirst({
      where: { id, userId: user.id },
    });

    if (!lorebook) {
      return NextResponse.json({ error: "Lorebook not found or access denied" }, { status: 404 });
    }

    await prisma.lorebook.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, deletedId: id });
  } catch (error) {
    console.error("[LOREBOOK_DELETE_ERROR]", error.message);
    return NextResponse.json({ error: "Failed to delete lorebook" }, { status: 500 });
  }
}
