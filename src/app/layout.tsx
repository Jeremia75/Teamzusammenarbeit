import type { Metadata, Viewport } from "next";
import "./globals.css";
import { THEME_SCRIPT } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: "Projektraum",
  description: "Projekte, Aufgaben und Meilensteine im Team",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#16191D" },
    { media: "(prefers-color-scheme: dark)", color: "#0F1216" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        {/* Gewählte Darstellung vor dem ersten Zeichnen setzen */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
