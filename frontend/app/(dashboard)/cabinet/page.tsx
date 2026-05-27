import { RoleGuard } from "@/components/common/role-guard";
import CabinetDashboard from "@/components/dashboard/cabinet-dashboard";

export default function CabinetPage() {
  return (
    <RoleGuard allow={["Worker", "Bloger"]} redirectTo="/register">
      <CabinetDashboard />
    </RoleGuard>
  );
}
