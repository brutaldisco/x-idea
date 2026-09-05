import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_JP } from "next/font/google";
import type { ReactNode } from "react";
import { OfflineBanner } from "@/components/pwa/OfflineBanner";
import { PwaRuntime } from "@/components/pwa/PwaRuntime";
import {
  PWA_BACKGROUND_COLOR,
  PWA_BACKGROUND_COLOR_DARK,
  PWA_DESCRIPTION,
  PWA_NAME,
} from "@/lib/pwa";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const noto = Noto_Sans_JP({
  subsets: ["latin"],
  variable: "--font-noto",
  display: "swap",
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  applicationName: PWA_NAME,
  title: {
    default: PWA_NAME,
    template: `%s · ${PWA_NAME}`,
  },
  description: PWA_DESCRIPTION,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: PWA_NAME,
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: PWA_BACKGROUND_COLOR },
    {
      media: "(prefers-color-scheme: dark)",
      color: PWA_BACKGROUND_COLOR_DARK,
    },
  ],
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja" className={`${inter.variable} ${noto.variable} h-full`}>
      <body className="min-h-dvh bg-paper font-sans text-ink antialiased">
        <PwaRuntime />
        <OfflineBanner />
        {children}
      </body>
    </html>
  );
}
