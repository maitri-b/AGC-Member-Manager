import type { Metadata } from "next";
import { Sarabun } from "next/font/google";
import "./globals.css";
import AuthProvider from "@/lib/auth-provider";

const sarabun = Sarabun({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["thai", "latin"],
  variable: "--font-sarabun",
});

export const metadata: Metadata = {
  title: "Agents Club - Member Manager",
  description: "ระบบจัดการสมาชิก Agents Club สมาคมตัวแทนท่องเที่ยว",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={`${sarabun.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sarabun bg-gray-50">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
