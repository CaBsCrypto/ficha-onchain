import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
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

const SITE_URL = "https://trustleaf-demo.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "TrustLeaf — Recetas privadas en Stellar Testnet",
  description:
    "Portales de médico y paciente con Privy y recetas privadas verificadas en Stellar Testnet. Entorno de validación con datos sintéticos.",
  keywords: [
    "recetas privadas",
    "Stellar Testnet",
    "Stellar",
    "Chile",
    "Privy",
  ],
  openGraph: {
    title: "TrustLeaf — Recetas privadas en Stellar Testnet",
    description:
      "Médico y paciente completan sus recorridos con Privy. Solo datos sintéticos y Stellar Testnet.",
    url: SITE_URL,
    type: "website",
    images: ["/og-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "TrustLeaf — Recetas privadas en Stellar Testnet",
    description:
      "Médico y paciente completan sus recorridos con Privy. Solo datos sintéticos y Stellar Testnet.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-canvas text-ink">
        <AppPrivyProvider>
          <LanguageProvider>{children}</LanguageProvider>
        </AppPrivyProvider>
        <Toaster richColors position="bottom-center" />
      </body>
    </html>
  );
}

