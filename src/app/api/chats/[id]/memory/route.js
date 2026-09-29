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

    let summaryRecord = await prisma.storySummary.findUnique({
      where: { chatId: id },
    });

    if (!summaryRecord) {
      summaryRecord = {
        summary: "",
        pinnedFacts: "[]",
      };
    }

    let pinnedFacts = [];
    try {
      pinnedFacts = JSON.parse(summaryRecord.pinnedFacts || "[]");
    } catch {}

    return NextResponse.json({
      summary: summaryRecord.summary,
      pinnedFacts,
      updatedAt: summaryRecord.updatedAt,
    });
  } catch (error) {
    console.error("[MEMORY_GET_ERROR]", error.message);
    return NextResponse.json({ error: "Failed to load story memory" }, { status: 500 });
  }
}

export async function POST(req, { params }) {
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

    const body = await req.json();
    const { summary, newFact, removeFactIndex } = body;

    let existing = await prisma.storySummary.findUnique({
      where: { chatId: id },
    });

    let pinnedFacts = [];
    if (existing?.pinnedFacts) {
      try {
        pinnedFacts = JSON.parse(existing.pinnedFacts);
      } catch {}
    }

    if (newFact && typeof newFact === "string" && newFact.trim()) {
      pinnedFacts.push(newFact.trim());
    }

    if (removeFactIndex !== undefined && removeFactIndex >= 0 && removeFactIndex < pinnedFacts.length) {
      pinnedFacts.splice(removeFactIndex, 1);
    }

    const newSummaryText = summary !== undefined ? summary : existing?.summary || "";

    const updated = await prisma.storySummary.upsert({
      where: { chatId: id },
      create: {
        chatId: id,
        summary: newSummaryText,
        pinnedFacts: JSON.stringify(pinnedFacts),
      },
      update: {
        summary: newSummaryText,
        pinnedFacts: JSON.stringify(pinnedFacts),
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      summary: updated.summary,
      pinnedFacts,
    });
  } catch (error) {
    console.error("[MEMORY_POST_ERROR]", error.message);
    return NextResponse.json({ error: "Failed to update story memory" }, { status: 500 });
  }
}
