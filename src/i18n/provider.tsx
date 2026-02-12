"use client";

import { ReactNode, createContext, useContext, useMemo } from "react";
import { useLanguage } from "@/stores/useLanguage";
import enMessages from "./messages/en.json";
import urMessages from "./messages/ur.json";

type Messages = typeof enMessages;

const I18nContext = createContext<{
  messages: Messages;
  language: "en" | "ur";
  t: (key: string, params?: Record<string, string>) => string;
} | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const { language } = useLanguage();

  const messages = useMemo(() => {
    return language === "ur" ? urMessages : enMessages;
  }, [language]);

  const t = (key: string, params?: Record<string, string>): string => {
    const keys = key.split(".");
    let value: any = messages;

    for (const k of keys) {
      value = value?.[k];
      if (value === undefined) {
        console.warn(`Translation key not found: ${key}`);
        return key;
      }
    }

    if (typeof value !== "string") {
      return key;
    }

    // Replace parameters like {name}
    if (params) {
      return value.replace(/\{(\w+)\}/g, (_, param) => params[param] || "");
    }

    return value;
  };

  return (
    <I18nContext.Provider value={{ messages, language, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslations() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useTranslations must be used within I18nProvider");
  }
  return context.t;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return context;
}
