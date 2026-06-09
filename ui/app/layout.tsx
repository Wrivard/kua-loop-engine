import type { Metadata } from "next";
import type { ReactNode } from "react";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Küa — Runs",
  description: "Squelette S5 : liste des runs du moteur kua-loop-engine en temps réel.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="bg-paper font-sans text-ink antialiased dark:bg-paper-dark dark:text-gray-100">
        {children}
      </body>
    </html>
  );
}
