import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import WorkspaceShell from "@/components/WorkspaceShell";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EMX ATLAS — Predictive Network Twin",
  description:
    "7X · EMX predictive network optimisation — a live digital twin of the national logistics network",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <WorkspaceShell>{children}</WorkspaceShell>
      </body>
    </html>
  );
}
