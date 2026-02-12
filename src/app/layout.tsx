"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { I18nProvider } from "@/i18n/provider";
import { Toaster } from "@/components/ui/sonner";
import { useLanguage } from "@/stores/useLanguage";
import { useEffect } from "react";
import "./globals.css";

function LayoutContent({ children }: { children: React.ReactNode }) {
  const { language } = useLanguage();
  const direction = language === "ur" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.setAttribute("lang", language);
    document.documentElement.setAttribute("dir", direction);
  }, [language, direction]);

  return (
    <html 
      lang={language} 
      dir={direction} 
      suppressHydrationWarning
    >
      <head>
        <title>HisaabKitaab — Your AI Financial Partner</title>
        <meta
          name="description"
          content="Bilingual AI-powered financial management for Pakistani households and businesses. Track expenses, scan bills, and get smart advice in English or Urdu."
        />
        <meta
          name="keywords"
          content="finance, budgeting, expense tracker, Pakistan, Urdu, AI financial advisor"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link 
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Nastaliq+Urdu:wght@400;500;600;700&display=swap" 
          rel="stylesheet" 
        />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        <I18nProvider>
          {children}
          <Toaster position="top-right" richColors />
        </I18nProvider>
      </body>
    </html>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      appearance={{
        baseTheme: undefined,
        variables: {
          colorPrimary: "#0F766E",
          colorTextOnPrimaryBackground: "#FFFFFF",
          colorBackground: "rgba(255, 255, 255, 0.95)",
          fontFamily: "Inter, sans-serif",
          borderRadius: "0.75rem",
        },
        elements: {
          formButtonPrimary: "bg-primary hover:bg-primary/90 shadow-lg",
          card: "shadow-2xl backdrop-blur-xl bg-white/95 border border-gray-200/50",
          headerTitle: "text-primary font-bold",
          headerSubtitle: "text-muted-foreground",
          socialButtonsBlockButton: "border-border hover:bg-accent backdrop-blur-sm bg-white/90",
          formFieldInput: "border-border focus:ring-primary backdrop-blur-sm bg-white/90",
          footerActionLink: "text-primary hover:text-primary/80 font-semibold",
          modalBackdrop: "backdrop-blur-md bg-black/40",
          modalContent: "backdrop-blur-xl bg-white/95 shadow-2xl border border-gray-200/50",
          logo: "h-12 w-12",
        },
      }}
    >
      <LayoutContent>{children}</LayoutContent>
    </ClerkProvider>
  );
}

