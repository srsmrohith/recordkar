import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Recordkar", template: "%s · Recordkar" },
  description: "Know where your money stands.",
  applicationName: "Recordkar",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0F6E56" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f0d" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IN" className="h-full antialiased">
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
