import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";

export const metadata: Metadata = {
  applicationName: "AdSyntra",
  title: {
    default: "AdSyntra | Unified Ads Management",
    template: "%s | AdSyntra",
  },
  description:
    "Manage Google Ads and Meta Ads from one workspace. Connect advertising accounts, plan campaigns, organize ads and creative assets, and work across platforms with a unified workflow.",
  keywords: [
    "AdSyntra",
    "Google Ads management",
    "Meta Ads management",
    "Facebook Ads",
    "Instagram Ads",
    "campaign management",
    "advertising dashboard",
    "ad management platform",
    "creative asset library",
    "cross-platform advertising",
  ],
  category: "technology",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    siteName: "AdSyntra",
    title: "AdSyntra | Unified Google Ads & Meta Ads Management",
    description:
      "Bring Google Ads and Meta Ads workflows into one workspace for campaign management, advertising creatives, and cross-platform visibility.",
    locale: "en_US",
  },
  twitter: {
    card: "summary",
    title: "AdSyntra | Unified Ads Management",
    description:
      "One workspace for Google Ads and Meta Ads campaign workflows, ads, and creative assets.",
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
  },
  formatDetection: {
    telephone: false,
    date: false,
    address: false,
    email: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/icon?family=Material+Icons"
        />
      </head>
      <body className="relative flex min-h-full flex-col bg-slate-100">
        <ClerkProvider>{children}</ClerkProvider>
      </body>
    </html>
  );
}
