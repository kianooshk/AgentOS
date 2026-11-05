import { db, newId, now, type KbDoc } from "@/lib/db";
import { bad, body, ok } from "@/lib/http";

export const runtime = "nodejs";

export function GET(req: Request) {
  const org = new URL(req.url).searchParams.get("org");
  if (!org) return bad("org is required");
  return ok(db().prepare("SELECT * FROM kb WHERE org_id = ? ORDER BY created_at DESC").all(org) as KbDoc[]);
}

export async function POST(req: Request) {
  const { org_id, title, content } = await body<KbDoc>(req);
  if (!org_id || !title?.trim() || !content?.trim()) return bad("org_id, title and content are required");
  const doc: KbDoc = { id: newId(), org_id, title: title.trim(), content, created_at: now() };
  db().prepare("INSERT INTO kb (id, org_id, title, content, created_at) VALUES (?, ?, ?, ?, ?)").run(doc.id, doc.org_id, doc.title, doc.content, doc.created_at);
  return ok(doc, 201);
}
