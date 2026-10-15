import type { ReactNode } from "react";
import "./globals.css";

export const metadata = { title: "冷蔵庫ノート" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
