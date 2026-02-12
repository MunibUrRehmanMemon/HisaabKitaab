"use client";

import { SignInButton, SignUpButton, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  MessageSquare,
  Scan,
  TrendingUp,
  Users,
  Store,
  Mic,
  ArrowRight,
} from "lucide-react";
import { useTranslations } from "@/i18n/provider";
import { LanguageToggle } from "@/components/LanguageToggle";
import { HisaabKitaabLogo } from "@/components/Logo";
import { UserMenu } from "@/components/UserMenu";
import { useEffect } from "react";

export default function HomePage() {
  const t = useTranslations();
  const { isSignedIn, user, isLoaded } = useUser();
  const router = useRouter();

  useEffect(() => {
    // Redirect to dashboard if user is signed in and has completed onboarding
    if (isSignedIn && isLoaded) {
      // You can check if onboarding is complete from user metadata
      // For now, just redirect to dashboard
      // router.push("/dashboard");
    }
  }, [isSignedIn, isLoaded]);

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top Navigation */}
      <nav className="fixed top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto max-w-7xl flex h-14 sm:h-16 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2 sm:gap-3">
            <HisaabKitaabLogo className="h-8 w-8 sm:h-10 sm:w-10" />
            <div>
              <h1 className="text-base sm:text-xl font-bold text-primary">
                {t("common.appName")}
              </h1>
              <p className="text-[10px] sm:text-xs text-muted-foreground">حساب کتاب</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <LanguageToggle />
            {isSignedIn ? (
              <UserMenu />
            ) : (
              <SignInButton mode="modal">
                <Button variant="ghost" size="sm">{t("auth.signIn")}</Button>
              </SignInButton>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative flex flex-col items-center justify-center px-4 sm:px-6 py-16 pt-28 text-center sm:py-20 sm:pt-32 md:py-32 md:pt-40">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/5 to-transparent" />

        <h1 className="mb-4 sm:mb-6 text-3xl sm:text-4xl md:text-6xl font-bold tracking-tight text-foreground">
          {t("landing.hero.title")}
        </h1>
        <p className="mb-6 sm:mb-8 max-w-2xl text-base sm:text-lg md:text-xl text-muted-foreground px-4">
          {t("landing.hero.subtitle")}
        </p>

        <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row w-full sm:w-auto px-4">
          {isSignedIn ? (
            <Button
              size="lg"
              className="w-full sm:w-auto sm:min-w-[200px]"
              onClick={() => router.push("/dashboard")}
            >
              {t("dashboard.title")}
              <ArrowRight className="ms-2 h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          ) : (
            <>
              <SignUpButton mode="modal">
                <Button size="lg" className="w-full sm:w-auto sm:min-w-[200px]">
                  {t("landing.hero.cta")}
                </Button>
              </SignUpButton>
              <SignInButton mode="modal">
                <Button size="lg" variant="outline" className="w-full sm:w-auto sm:min-w-[200px]">
                  {t("auth.signIn")}
                </Button>
              </SignInButton>
            </>
          )}
        </div>
      </section>

      {/* Features Section */}
      <section className="px-4 sm:px-6 py-12 sm:py-16 md:py-20">
        <div className="mx-auto max-w-7xl">
          <h2 className="mb-3 sm:mb-4 text-center text-2xl sm:text-3xl font-bold">
            {t("landing.features.title")}
          </h2>
          <div className="mt-8 sm:mt-12 grid gap-4 sm:gap-6 md:gap-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <Mic className="h-10 w-10 sm:h-12 sm:w-12 text-primary" />
                <CardTitle className="mt-3 sm:mt-4 text-lg sm:text-xl">
                  {t("landing.features.voiceEntry.title")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm sm:text-base text-muted-foreground">
                  {t("landing.features.voiceEntry.description")}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Scan className="h-10 w-10 sm:h-12 sm:w-12 text-primary" />
                <CardTitle className="mt-3 sm:mt-4 text-lg sm:text-xl">
                  {t("landing.features.billScan.title")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm sm:text-base text-muted-foreground">
                  {t("landing.features.billScan.description")}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <MessageSquare className="h-10 w-10 sm:h-12 sm:w-12 text-primary" />
                <CardTitle className="mt-3 sm:mt-4 text-lg sm:text-xl">
                  {t("landing.features.advisor.title")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm sm:text-base text-muted-foreground">
                  {t("landing.features.advisor.description")}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <TrendingUp className="h-10 w-10 sm:h-12 sm:w-12 text-primary" />
                <CardTitle className="mt-3 sm:mt-4 text-lg sm:text-xl">
                  {t("landing.features.forecast.title")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm sm:text-base text-muted-foreground">
                  {t("landing.features.forecast.description")}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Store className="h-10 w-10 sm:h-12 sm:w-12 text-primary" />
                <CardTitle className="mt-3 sm:mt-4 text-lg sm:text-xl">
                  {t("landing.features.shop.title")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm sm:text-base text-muted-foreground">
                  {t("landing.features.shop.description")}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Users className="h-10 w-10 sm:h-12 sm:w-12 text-primary" />
                <CardTitle className="mt-3 sm:mt-4 text-lg sm:text-xl">
                  {t("landing.features.family.title")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm sm:text-base text-muted-foreground">
                  {t("landing.features.family.description")}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-4 sm:px-6 py-12 sm:py-16 md:py-20">
        <div className="mx-auto max-w-4xl rounded-2xl bg-primary p-8 sm:p-12 text-center text-primary-foreground">
          <h2 className="mb-3 sm:mb-4 text-2xl sm:text-3xl font-bold">{t("landing.cta.title")}</h2>
          <p className="mb-6 sm:mb-8 text-base sm:text-lg opacity-90">{t("landing.cta.subtitle")}</p>
          {isSignedIn ? (
            <Button
              size="lg"
              variant="secondary"
              className="w-full sm:w-auto sm:min-w-[250px]"
              onClick={() => router.push("/dashboard")}
            >
              {t("dashboard.title")}
              <ArrowRight className="ms-2 h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          ) : (
            <SignUpButton mode="modal">
              <Button size="lg" variant="secondary" className="w-full sm:w-auto sm:min-w-[250px]">
                {t("landing.cta.button")}
              </Button>
            </SignUpButton>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-4 sm:px-6 py-6 sm:py-8 text-center text-xs sm:text-sm text-muted-foreground">
        <p>
          © 2026 {t("common.appName")}. Built with ❤️ for Pakistan 🇵🇰
        </p>
      </footer>
    </div>
  );
}
