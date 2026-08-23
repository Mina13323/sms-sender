import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { SendForm } from "./send-form";

export const dynamic = "force-dynamic";

export default async function SendPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen">
      <AppHeader role={user.role} name={user.name} />
      <main className="mx-auto max-w-xl px-4 py-10">
        <h1 className="mb-1 text-xl font-bold">SMS Sender</h1>
        <p className="mb-6 text-sm text-gray-500">
          Send a text message to one or more recipients.
        </p>
        <SendForm />
      </main>
    </div>
  );
}
