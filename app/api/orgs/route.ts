import { db, newId, now, type Org } from "@/lib/db";
import { bad, body, ok } from "@/lib/http";

export const runtime = "nodejs";

export function GET() {
  return ok(db().prepare("SELECT * FROM orgs ORDER BY created_at").all() as Org[]);
}

export async function POST(req: Request) {
  const { name } = await body<{ name: string }>(req);
  if (!name?.trim()) return bad("Name is required");
  const org: Org = { id: newId(), name: name.trim(), created_at: now() };
  db().prepare("INSERT INTO orgs (id, name, created_at) VALUES (?, ?, ?)").run(org.id, org.name, org.created_at);
  return ok(org, 201);
}
