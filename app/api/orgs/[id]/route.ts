import { db } from "@/lib/db";
import { bad, ok } from "@/lib/http";

export const runtime = "nodejs";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = db().prepare("DELETE FROM orgs WHERE id = ?").run(id);
  return r.changes ? ok({ deleted: id }) : bad("Org not found", 404);
}
