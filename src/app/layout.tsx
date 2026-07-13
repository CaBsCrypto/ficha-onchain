import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";
import { LanguageProvider } from "@/hooks/useLanguage";
import { AppPrivyProvider } from "@/providers/PrivyProvider";
import DemoSwitcher from "../components/DemoSwitcher";

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
  title: "TrustLeaf â€” Patient-owned health records on Stellar",
  description:
    "Your complete medical record, owned by you and verified on-chain. Doctors issue verifiable prescriptions. Pharmacies verify instantly via QR. Built on Stellar Soroban.",
  keywords: [
    "medical records",
    "blockchain health",
    "Stellar",
    "Chile",
    "patient owned",
  ],
  openGraph: {
    title: "TrustLeaf â€” Patient-owned health records on Stellar",
    description:
      "Your complete medical record, owned by you and verified on-chain. Doctors issue verifiable prescriptions. Pharmacies verify instantly via QR. Built on Stellar Soroban.",
    url: SITE_URL,
    type: "website",
    images: ["/og-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "TrustLeaf â€” Patient-owned health records on Stellar",
    description:
      "Your complete medical record, owned by you and verified on-chain. Doctors issue verifiable prescriptions. Pharmacies verify instantly via QR. Built on Stellar Soroban.",
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
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-canvas text-ink">
        <AppPrivyProvider>
          <LanguageProvider>{children}</LanguageProvider>
<<<<<<< HEAD
        </AppPrivyProvider>
        <Toaster richColors position="bottom-center" />
=======
        </AppPrivyProvider>      <DemoSwitcher />

>>>>>>> dbc1e41 (fix: ignoreBuildErrors next.config)
      </body>
    </html>
  );
}


