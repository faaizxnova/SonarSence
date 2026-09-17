import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <head>
        {/* Sora for UI text, JetBrains Mono for data readouts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* Mapbox GL JS CSS */}
        <link
          href="https://api.mapbox.com/mapbox-gl-js/v3.9.4/mapbox-gl.css"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
