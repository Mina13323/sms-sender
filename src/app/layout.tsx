import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SMS Panel",
  description: "SMS management and sending platform",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-gray-50 text-gray-900">{children}</body>
    </html>
  );
}
