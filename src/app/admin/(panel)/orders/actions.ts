"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/domain/order-status";
import { idSchema } from "@/lib/validation/tour";
import { setAdminNote, transitionOrder, type TransitionResult } from "@/server/orders";
import { moveOrder, refundOrder, type ActionResult } from "@/server/refunds";
import { sendCancelled, sendTicket } from "@/server/ticket";

const BAD_REQUEST = "Некорректный запрос";

function revalidateAll(id: number) {
  revalidatePath("/admin/sessions/[id]", "page");
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);
}

export async function changeStatus(id: number, to: OrderStatus): Promise<TransitionResult> {
  await requireAdmin();
  if (!Number.isInteger(id) || !ORDER_STATUSES.includes(to)) return { ok: false, error: "Некорректный запрос" };
  const r = await transitionOrder(id, to);
  if (r.ok) revalidateAll(id);
  return r;
}

export async function saveNote(id: number, formData: FormData): Promise<void> {
  await requireAdmin();
  if (!Number.isInteger(id)) return;
  await setAdminNote(id, String(formData.get("note") ?? ""));
  revalidateAll(id);
}

/**
 * «Отменить и вернуть»: возврат через ЮKassa и отмена заказа. Письмо об отмене уходит после ответа админу —
 * сбой почты не должен мешать уже выполненному возврату.
 */
export async function refundAction(id: number, amount: number): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success || !Number.isInteger(amount)) return { ok: false, error: BAD_REQUEST };
  const r = await refundOrder(id, amount);
  if (r.ok) {
    revalidateAll(id);
    after(() => sendCancelled(id));
  }
  return r;
}

/** «Перенести»: другой сеанс той же экскурсии; клиенту уходит обновлённый билет. */
export async function moveAction(id: number, sessionId: number): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success || !idSchema.safeParse(sessionId).success) return { ok: false, error: BAD_REQUEST };
  const r = await moveOrder(id, sessionId);
  if (r.ok) {
    revalidateAll(id);
    after(() => sendTicket(id, "moved"));
  }
  return r;
}

/** «Отправить билет повторно»: отправляется сразу, чтобы админ увидел, ушло ли письмо. */
export async function resendTicketAction(id: number): Promise<ActionResult> {
  await requireAdmin();
  if (!idSchema.safeParse(id).success) return { ok: false, error: BAD_REQUEST };
  const sent = await sendTicket(id, "paid");
  if (!sent) return { ok: false, error: "Письмо не отправлено — проверьте настройки почты" };
  revalidateAll(id);
  return { ok: true };
}
