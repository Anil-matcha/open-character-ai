import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth-helpers";

export async function GET(req) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const characterId = searchParams.get("characterId");

    const where = { userId: user.id };
    if (characterId) {
      where.OR = [{ characterId }, { characterId: null }];
    }

    const lorebooks = await prisma.lorebook.findMany({
      where,
      include: {
        entries: {
          orderBy: { order: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ lorebooks });
  } catch (error) {
    console.error("[LOREBOOKS_GET_ERROR]", error.message);
    return NextResponse.json({ error: "Failed to fetch lorebooks" }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { name, description, characterId, entries = [] } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Lorebook name is required" }, { status: 400 });
    }

    const lorebook = await prisma.lorebook.create({
      data: {
        userId: user.id,
        characterId: characterId || null,
        name: name.trim(),
        description: description || null,
        entries: {
          create: entries.map((e, index) => ({
            keys: Array.isArray(e.keys) ? e.keys.join(", ") : e.keys || "",
            secondaryKeys: e.secondaryKeys || null,
            content: e.content || "",
            order: e.order !== undefined ? e.order : index * 10,
            enabled: e.enabled !== false,
            scope: e.scope || "character",
            budgetTokens: e.budgetTokens || 300,
          })),
        },
      },
      include: {
        entries: true,
      },
    });

    return NextResponse.json({ lorebook }, { status: 201 });
  } catch (error) {
    console.error("[LOREBOOKS_POST_ERROR]", error.message);
    return NextResponse.json({ error: "Failed to create lorebook" }, { status: 500 });
  }
}
