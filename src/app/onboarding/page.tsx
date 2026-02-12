"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/stores/useLanguage";
import { useTranslations } from "@/i18n/provider";
import { Languages, User, Users, Store } from "lucide-react";

type OnboardingStep = "language" | "mode" | "complete";
type AccountMode = "individual" | "family" | "shop";

export default function OnboardingPage() {
  const { user } = useUser();
  const router = useRouter();
  const { language, setLanguage } = useLanguage();
  const t = useTranslations();
  const [step, setStep] = useState<OnboardingStep>("language");
  const [selectedMode, setSelectedMode] = useState<AccountMode | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLanguageSelect = async (lang: "en" | "ur") => {
    setLanguage(lang);
    
    // Ensure profile exists first
    await fetch("/api/ensure-profile", { method: "POST" }).catch(console.error);
    
    // Update user profile with selected language via API
    await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set-language", language: lang }),
    }).catch(console.error);

    setStep("mode");
  };

  const handleModeSelect = async (mode: AccountMode) => {
    setSelectedMode(mode);
    setIsLoading(true);

    try {
      // Create account via API (bypasses RLS)
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set-mode",
          mode,
          name: user?.fullName || "My Account",
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      setStep("complete");
      setTimeout(() => {
        router.push("/dashboard");
      }, 1500);
    } catch (error) {
      console.error("Error completing onboarding:", error);
      alert("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (step === "language") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-primary/5 to-background p-6">
        <div className="w-full max-w-md space-y-8 text-center">
          <div>
            <Languages className="mx-auto h-16 w-16 text-primary" />
            <h1 className="mt-6 text-3xl font-bold">
              Choose Your Language
            </h1>
            <p className="mt-2 text-muted-foreground">
              اپنی زبان منتخب کریں
            </p>
          </div>

          <div className="grid gap-4">
            <Button
              size="lg"
              variant="outline"
              className="h-20 text-xl"
              onClick={() => handleLanguageSelect("en")}
            >
              <span className="font-semibold">English</span>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-20 text-xl"
              onClick={() => handleLanguageSelect("ur")}
            >
              <span className="font-semibold">اردو (Urdu)</span>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "mode") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-primary/5 to-background p-6">
        <div className="w-full max-w-4xl space-y-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold">{t("onboarding.mode.title")}</h1>
            <p className="mt-2 text-muted-foreground">
              {t("onboarding.mode.subtitle")}
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <Card
              className="cursor-pointer transition-all hover:border-primary hover:shadow-lg"
              onClick={() => handleModeSelect("individual")}
            >
              <CardHeader className="text-center">
                <User className="mx-auto h-16 w-16 text-primary" />
                <CardTitle className="mt-4">
                  {t("onboarding.mode.individual.title")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-center text-sm text-muted-foreground">
                  {t("onboarding.mode.individual.description")}
                </p>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer transition-all hover:border-primary hover:shadow-lg"
              onClick={() => handleModeSelect("family")}
            >
              <CardHeader className="text-center">
                <Users className="mx-auto h-16 w-16 text-primary" />
                <CardTitle className="mt-4">
                  {t("onboarding.mode.family.title")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-center text-sm text-muted-foreground">
                  {t("onboarding.mode.family.description")}
                </p>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer transition-all hover:border-primary hover:shadow-lg"
              onClick={() => handleModeSelect("shop")}
            >
              <CardHeader className="text-center">
                <Store className="mx-auto h-16 w-16 text-primary" />
                <CardTitle className="mt-4">
                  {t("onboarding.mode.shop.title")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-center text-sm text-muted-foreground">
                  {t("onboarding.mode.shop.description")}
                </p>
              </CardContent>
            </Card>
          </div>

          {isLoading && (
            <div className="text-center">
              <p className="text-muted-foreground">
                {t("onboarding.mode.creating")}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (step === "complete") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-primary/5 to-background p-6">
        <div className="w-full max-w-md space-y-8 text-center">
          <div>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary">
              <svg
                className="h-8 w-8 text-primary-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h1 className="mt-6 text-3xl font-bold">
              {t("onboarding.complete.title")}
            </h1>
            <p className="mt-2 text-muted-foreground">
              {t("onboarding.complete.subtitle")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
