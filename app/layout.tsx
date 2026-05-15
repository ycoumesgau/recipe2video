import type { Metadata, Viewport } from "next";
import { Quicksand } from "next/font/google";

import { PwaServiceWorkerRegister } from "@/components/pwa-service-worker-register";
import { ThemeProvider } from "@/components/theme-provider";
import { BRAND_LOGO_PATH } from "@/lib/branding";

import "./globals.css";

/** Quick Send → grille Quicksand (corps + titres). */
const quicksand = Quicksand({
  variable: "--font-quicksand",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1e9dd" },
    { media: "(prefers-color-scheme: dark)", color: "#18181c" },
  ],
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: {
    default: "Recipe2Video · Licorn",
    template: "%s · Recipe2Video",
  },
  description:
    "Cockpit de production interne Licorn pour les vidéos de recettes (Runway, Mux…).",
  applicationName: "Recipe2Video",
  appleWebApp: {
    capable: true,
    title: "Recipe2Video",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: BRAND_LOGO_PATH, type: "image/png" },
      { url: "/pwa/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/pwa/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/pwa/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
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
        <PwaServiceWorkerRegister />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
