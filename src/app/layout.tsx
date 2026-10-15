import type { Metadata, Viewport } from "next";
import "./globals.css";
import Script from "next/script";
import { THEME_SCRIPT } from "@/components/theme-toggle";
import { ErrorReporter } from "@/components/error-reporter";

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
      <body className="antialiased">
        {/* Gewählte Darstellung vor dem ersten Zeichnen setzen */}
        <Script id="theme" strategy="beforeInteractive">
          {THEME_SCRIPT}
        </Script>
        <ErrorReporter />
        {children}
      </body>
    </html>
  );
}
