import type { Metadata } from "next";
import { geistSans, geistMono, firaMono } from "./fonts";
import { Header } from "@/components/header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Oboe",
  description: "Crowdfunded agent skills marketplace",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${firaMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Header />
        <main className="min-h-screen max-w-4xl mx-auto px-4">{children}</main>
      </body>
    </html>
  );
}
