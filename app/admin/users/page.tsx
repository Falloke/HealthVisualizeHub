import { auth } from "@/auth";
import { redirect } from "next/navigation";
import AdminUsersFeature from "@/app/features/admin/usersPage"
export default async function AdminUsersPage() {
  const session = await auth();
  if (session?.user?.role !== "Admin") {
    redirect("/"); // กันซ้ำกับ middleware อีกชั้น
  }

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold text-pink-600">Admin</h1>
      <AdminUsersFeature /> 
    </div>
  );
}

