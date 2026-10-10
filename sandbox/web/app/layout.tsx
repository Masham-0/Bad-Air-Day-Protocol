import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bad-Air Day Protocol",
  description: "Today's outdoor-activity protocol for a Delhi-NCR school: air forecast, smoke trace and parent notice.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
