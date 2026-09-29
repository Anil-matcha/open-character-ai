import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-helpers";
import { exportCharacterCard } from "@/lib/character-card";

export async function GET(req, { params }) {
  try {
    const { id } = await params;
    const user = await getAuthenticatedUser();

    const character = await prisma.character.findUnique({
      where: { id },
    });

    if (!character) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    // Check visibility permissions
    if (!character.isPublic && (!user || character.userId !== user.id)) {
      return NextResponse.json({ error: "Access denied to private character" }, { status: 403 });
    }

    const exportedCard = exportCharacterCard(character);

    return new NextResponse(JSON.stringify(exportedCard, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${character.name.toLowerCase().replace(/\s+/g, "_")}.json"`,
      },
    });
  } catch (error) {
    console.error("[CHARACTER_EXPORT_ERROR]", error.message);
    return NextResponse.json({ error: "Failed to export character" }, { status: 500 });
  }
}
