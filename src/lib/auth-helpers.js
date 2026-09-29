import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Returns the authenticated user session if valid, or null.
 */
export async function getAuthenticatedUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return null;
  }
  return session.user;
}

/**
 * Retrieves a chat ensuring it belongs to the authenticated user.
 * Prevents IDOR (Insecure Direct Object Reference).
 */
export async function getOwnedChat(userId, chatId) {
  if (!userId || !chatId) {
    return null;
  }

  const chat = await prisma.chat.findFirst({
    where: {
      id: chatId,
      userId: userId,
    },
    include: {
      character: true,
      storySummary: true,
    },
  });

  return chat;
}
