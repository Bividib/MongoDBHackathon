import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RunwayOps",
  description: "Payroll Risk Command for SMEs"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
