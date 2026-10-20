import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "PartsRoute · Every part. One complete cost.",
  description:
    "Compare evidence-backed electronics purchasing plans across Indian retailers, including shipping, packs and tax.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
