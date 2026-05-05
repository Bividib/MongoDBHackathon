import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RunwayOps",
  description: "Cash-aware receivables operations for SMEs",
};

const NAV_ITEMS = [
  { href: "/actions", label: "Daily Cash Actions" },
  { href: "/approvals", label: "Approval Inbox" },
  { href: "/forecast", label: "Forecast" },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">
        <nav className="border-b bg-white">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
            <a href="/" className="text-lg font-bold tracking-tight">
              RunwayOps
            </a>
            <div className="flex gap-4">
              {NAV_ITEMS.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="text-sm font-medium text-gray-600 hover:text-gray-900"
                >
                  {item.label}
                </a>
              ))}
            </div>
          </div>
        </nav>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
