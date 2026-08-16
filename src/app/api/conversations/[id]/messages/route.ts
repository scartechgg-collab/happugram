import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  messages,
  attachments,
  messageReactions,
  users,
  conversations,
  conversationMembers,
} from "@/db/schema";
import { eq, and, desc, lt, sql, inArray, isNull } from "drizzle-orm";
import { requireAuth } from "@/lib/require-auth";
import { isConversationMember } from "@/lib/conversations";
import { looksLikeUrl, fetchLinkPreview } from "@/lib/link-preview";
import { bus, Events } from "@/lib/bus";

export const dynamic = "force-dynamic";

// GET /api/conversations/[id]/messages — paginated messages
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  if (!(await isConversationMember(id, auth.session.sub))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const url = new URL(req.url);
  const before = url.searchParams.get("before");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 40), 100);

  const conditions = [eq(messages.conversationId, id), eq(messages.deletedAt, null as any)];
  if (before) {
    conditions.push(lt(messages.createdAt, new Date(before)));
  }

  const rows = await db
    .select()
    .from(messages)
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  const withAttachments = await Promise.all(
    rows.map(async (m) => {
      const [atts, reacts, sender] = await Promise.all([
        db.select().from(attachments).where(eq(attachments.messageId, m.id)),
        db.select().from(messageReactions).where(eq(messageReactions.messageId, m.id)),
        db
          .select({
            id: users.id,
            username: users.username,
            displayName: users.displayName,
            avatarUrl: users.avatarUrl,
          })
          .from(users)
          .where(eq(users.id, m.senderId))
          .limit(1),
      ]);
      return {
        ...m,
        attachments: atts,
        reactions: reacts,
        sender: sender[0] ?? null,
      };
    })
  );

  return NextResponse.json(withAttachments.reverse());
}

// POST /api/conversations/[id]/messages — send a message
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  if (!(await isConversationMember(id, auth.session.sub))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const b = body as {
    content?: unknown;
    kind?: unknown;
    replyToId?: unknown;
    attachmentIds?: unknown;
  };
  const content = typeof b.content === "string" ? b.content : null;
  const replyToId = typeof b.replyToId === "string" ? b.replyToId : null;
  const attachmentIds = Array.isArray(b.attachmentIds)
    ? b.attachmentIds.filter((x) => typeof x === "string")
    : [];

  let kind = typeof b.kind === "string" ? b.kind : "text";

  // Detect link
  if (kind === "text" && content) {
    const url = looksLikeUrl(content);
    if (url) kind = "link";
  }

  if (!content && attachmentIds.length === 0) {
    return NextResponse.json({ error: "Message is empty." }, { status: 400 });
  }
  if (content && content.length > 4000) {
    return NextResponse.json({ error: "Message is too long." }, { status: 400 });
  }

  const inserted = await db
    .insert(messages)
    .values({
      conversationId: id,
      senderId: auth.session.sub,
      content,
      kind,
      replyToId,
      status: "sent",
    })
    .returning();
  const msg = inserted[0]!;

  // Link attachments
  if (attachmentIds.length) {
    await db
      .update(attachments)
      .set({ messageId: msg.id })
      .where(
        and(
          inArray(attachments.id, attachmentIds),
          eq(attachments.uploaderId, auth.session.sub),
          isNull(attachments.messageId)
        )
      );
  }

  // Update conversation timestamp
  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, id));

  // Fetch link preview asynchronously (best-effort)
  if (kind === "link" && content) {
    const url = looksLikeUrl(content);
    if (url) {
      fetchLinkPreview(url).catch(() => {});
    }
  }

  // Emit realtime event
  bus.emit(Events.MESSAGE_NEW, {
    conversationId: id,
    message: msg,
  });

  return NextResponse.json(msg, { status: 201 });
}
