import { Suspense } from "react";
import { requireStaff } from "@/lib/auth/viewer";
import { can } from "@/lib/auth/roles";
import { countNewOrders } from "@/server/admin-orders";
import { AdminShell } from "@/components/admin/AdminShell";
import { Toast } from "@/components/admin/Toast";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  // Layout открыт любому сотруднику; страницы и действия сами проверяют свой раздел (requireAccess / requireAdmin).
  const viewer = await requireStaff();
  const newOrders = can(viewer.role, "orders") ? await countNewOrders() : 0;
  return (
    <AdminShell newOrders={newOrders} viewer={{ name: viewer.name, role: viewer.role }}>
      {children}
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
    </AdminShell>
  );
}
