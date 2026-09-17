import type { Metadata } from "next";
import { Sora, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// next/font self-hosts these at build time: no render-blocking Google
// Fonts request, no layout shift from a late-arriving @font-face swap.
const sora = Sora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sora",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SonarSense — Underwater Debris Detection",
  description:
    "AI-powered underwater marine debris detection using side-scan sonar and YOLOv8, combining acoustic highlight and shadow analysis for real-time seabed survey.",
  keywords: [
    "SonarSense",
    "marine debris detection",
    "side-scan sonar",
    "YOLOv8",
    "underwater AI",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${sora.variable} ${jetbrainsMono.variable}`}>
      <head>
        {/* Mapbox GL JS CSS (external stylesheet the CSP allow-lists explicitly) */}
        <link
          href="https://api.mapbox.com/mapbox-gl-js/v3.9.4/mapbox-gl.css"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
