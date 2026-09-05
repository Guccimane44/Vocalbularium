import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Vocabularium — Your vocabulary, remembered",
  description:
    "Capture unfamiliar words, explore their meanings, and remember them with spaced repetition.",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
