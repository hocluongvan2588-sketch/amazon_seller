import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Amazon Ops Platform",
    template: "%s · Amazon Ops Platform",
  },
  description:
    "Nền tảng vận hành nội bộ: Product Research, Unit Economics, Go/No-Go, Launch & Operations cho shop Amazon.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
