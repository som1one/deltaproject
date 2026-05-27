import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { RoleGuard } from "@/components/common/role-guard";

export default function AdminPage() {
  return (
    <RoleGuard allow="Admin" redirectTo="/admin/login">
      <AdminDashboard />
    </RoleGuard>
  );
}
