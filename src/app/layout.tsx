import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "秋招协作台",
  description: "受邀成员共享的秋招进度记录工具",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
