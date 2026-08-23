import { redirect } from "next/navigation";
import { ReactNode } from "react";
import { getSessionUser } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { AdminNav } from "./admin-nav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "SUPER_ADMIN") redirect("/send");

  return (
    <div className="min-h-screen">
      <AppHeader role={user.role} name={user.name} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <AdminNav />
        <div className="mt-6">{children}</div>
      </main>
    </div>
  );
}
