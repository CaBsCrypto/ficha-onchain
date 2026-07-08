import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/hooks/useLanguage";
import { AppPrivyProvider } from "@/providers/PrivyProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TrustLeaf — Verifiable medical records on Stellar",
  description:
    "Doctors issue prescriptions as blockchain records. Patients receive them instantly — no fees, no paperwork, no borders. Built on Stellar Soroban.",
  keywords: [
    "healthtech",
    "blockchain",
    "prescriptions",
    "Stellar",
    "Soroban",
    "medical records",
    "Chile",
  ],
  openGraph: {
    title: "TrustLeaf",
    description: "Your medical history. Verified. Always yours.",
    type: "website",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-canvas text-ink">
        <AppPrivyProvider>
          <LanguageProvider>{children}</LanguageProvider>
        </AppPrivyProvider>
      </body>
    </html>
  );
}
