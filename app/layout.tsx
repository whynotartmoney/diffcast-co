import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrument = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://127.0.0.1:43219";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Diffcast — Carbon for motion",
  description:
    "Paste a GitHub compare URL or two snippets of code. Get a cinematic, shareable diff reel and export a GIF. No install.",
  openGraph: {
    title: "Diffcast — Carbon for motion",
    description: "Paste a GitHub compare URL. Get a shareable cinematic diff reel.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Diffcast — Carbon for motion",
    description: "Paste a GitHub compare URL. Get a shareable cinematic diff reel.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} ${instrument.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
