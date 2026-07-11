import type { Metadata } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  title: "Transfer Hub",
  description: "Move text and files between your devices, instantly.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full antialiased`}>
      <Analytics />
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
