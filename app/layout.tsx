import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '图片工厂',
  description: '用模板批量处理图片，快速生成适合社交平台分享的 3:4 图片。',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
