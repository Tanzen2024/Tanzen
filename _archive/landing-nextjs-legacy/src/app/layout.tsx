import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TANZEN - Digitalisez vos associations",
  description: "Plateforme de gestion pour associations et tontines",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
        
        {/* Chat Widget Configuration & Embed */}
        <script dangerouslySetInnerHTML={{
          __html: `
            window.TanzenChatConfig = {
              buttonColor: 'rgb(11, 30, 54)', // #0B1E36
              position: 'bottom-right', // 'bottom-left' ou 'bottom-right'
            };
          `
        }} />
        <script type="module" src="http://localhost:5175/src/embed.ts"></script>
      </body>
    </html>
  );
}
