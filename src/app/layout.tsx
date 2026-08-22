import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/ToastProvider";
import { themeInitScript } from "@/lib/theme";
import { withBasePath } from "@/lib/basePath";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cdrive — Kurumsal Dosya Yönetimi",
  description: "Departmanlar arası güvenli dosya paylaşımı ve yönetimi",
  // PWA: manifest app/manifest.ts'te üretiliyor (basePath'i otomatik alsın diye).
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Cdrive",
    // iOS'ta durum çubuğu içeriğin üstüne biner ve arka planı sayfadan alır.
    statusBarStyle: "default",
  },
  icons: {
    // Next.js metadata.manifest'e basePath ekliyor ama metadata.icons'a EKLEMİYOR
    // (doğrulandı: öneksiz /apple-touch-icon.png 404 dönüyor). Elle sarmalıyoruz.
    apple: withBasePath("/apple-touch-icon.png"),
  },
};

/**
 * Tarayıcı arayüzünün (Android adres çubuğu, iOS durum çubuğu) uygulamanın temasıyla
 * uyumlu boyanması için. Açık/koyu temaya göre ayrı değer veriliyor — tek bir renk
 * verilirse koyu temada beyaz bir şerit kalıyor.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0f" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="tr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Sayfa boyanmadan önce doğru temayı uygular, yanlış temayla an'lık çizilmeyi (FOUC) önler. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
