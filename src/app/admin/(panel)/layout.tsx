import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/session";
import { countNewOrders } from "@/server/admin-orders";
import { AdminShell } from "@/components/admin/AdminShell";
import { Toast } from "@/components/admin/Toast";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const newOrders = await countNewOrders();
  return (
    <AdminShell newOrders={newOrders}>
      {children}
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
    </AdminShell>
  );
}
