import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VENTURE — Day 1 Live",
  description: "Live venture & startup camp platform — three rounds, twelve startups, one day."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-sand text-ink antialiased">{children}</body>
    </html>
  );
}
