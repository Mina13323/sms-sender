"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const tabs = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/providers", label: "Providers" },
  { href: "/admin/routes", label: "Routes & Pricing" },
  { href: "/admin/settings", label: "Settings" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 border-b border-gray-200 pb-px">
      {tabs.map((tab) => {
        const active = tab.href === "/admin" ? pathname === "/admin" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={clsx(
              "rounded-t-md border-b-2 px-3 py-2 text-sm font-medium",
              active
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-gray-500 hover:text-gray-800",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
