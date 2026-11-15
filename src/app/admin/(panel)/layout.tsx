import { Suspense } from "react";
import { requireStaff } from "@/lib/auth/viewer";
import { countNewOrders } from "@/server/admin-orders";
import { AdminShell } from "@/components/admin/AdminShell";
import { Toast } from "@/components/admin/Toast";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  // Гиду layout открыт (сводка, списки участников, отметка прихода); остальные страницы сами вызывают requireAdmin().
  const viewer = await requireStaff();
  const newOrders = viewer.role === "guide" ? 0 : await countNewOrders();
  return (
    <AdminShell newOrders={newOrders} viewer={{ name: viewer.name, role: viewer.role }}>
      {children}
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
    </AdminShell>
  );
}
