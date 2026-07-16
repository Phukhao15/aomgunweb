import type { Metadata } from "next";
import "./globals.css";

export function generateMetadata(): Metadata {
  return {
    title: "AomGun Family — ออมเงินไปด้วยกันทั้งครอบครัว",
    description: "A premium family finance experience for parents and children to budget, save and learn together.",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title: "AomGun Family — Family Money, Growing Together",
      description: "Budget, save and learn together in one safe family space.",
    },
    twitter: { card: "summary" },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
