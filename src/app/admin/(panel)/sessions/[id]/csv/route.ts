import { getViewer } from "@/lib/auth/viewer";
import { can } from "@/lib/auth/roles";
import { getSessionRoster, rosterToCsv } from "@/server/admin-orders";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Список участников — имена и телефоны покупателей: гиду и полному доступу, редактору нет.
  const viewer = await getViewer();
  if (!viewer) return new Response("Unauthorized", { status: 401 });
  if (!can(viewer.role, "roster")) return new Response("Forbidden", { status: 403 });

  const { id: raw } = await params;
  if (!/^\d{1,9}$/.test(raw)) return new Response("Not found", { status: 404 });
  const id = Number(raw);
  const roster = await getSessionRoster(id);
  if (!roster) return new Response("Not found", { status: 404 });

  return new Response(rosterToCsv(roster), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="session-${id}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
