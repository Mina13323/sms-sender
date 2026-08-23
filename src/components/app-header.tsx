"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { LogOut, MessageSquareText } from "lucide-react";

export function AppHeader({
  role,
  name,
}: {
  role: "SUPER_ADMIN" | "USER";
  name: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const links = [
    { href: "/send", label: "Send SMS" },
    ...(role === "SUPER_ADMIN" ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/send" className="flex items-center gap-2 font-semibold text-gray-900">
            <MessageSquareText className="h-5 w-5 text-indigo-600" />
            SMS Panel
          </Link>
          <nav className="flex items-center gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={clsx(
                  "rounded-md px-3 py-1.5 text-sm font-medium",
                  (link.href === "/admin"
                    ? pathname.startsWith("/admin")
                    : pathname === link.href)
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-gray-600 hover:bg-gray-100",
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-gray-500 sm:block">{name}</span>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
