import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, Source_Serif_4 } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
});

const body = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-body",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: {
    default: "Telep Muse connectors",
    template: "%s · Telep Muse",
  },
  description:
    "Catalog of Telep IO connectors for Muse, Meta’s personal assistant. Independent work by Telep IO — not a Meta partnership.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_CATALOG_URL || "https://muse.telep.io"),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} ${mono.variable}`}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
