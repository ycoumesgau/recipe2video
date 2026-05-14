import type { Metadata } from "next";
import { Quicksand } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider";
import { BRAND_LOGO_PATH } from "@/lib/branding";

import "./globals.css";

/** Quick Send → grille Quicksand (corps + titres). */
const quicksand = Quicksand({
  variable: "--font-quicksand",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "Recipe2Video · Licorn",
    template: "%s · Recipe2Video",
  },
  description:
    "Cockpit de production interne Licorn pour les vidéos de recettes (Runway, Mux…).",
  icons: {
    icon: [{ url: BRAND_LOGO_PATH, type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      suppressHydrationWarning
      lang="fr"
      className={`${quicksand.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
