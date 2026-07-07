"use client";

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Language } from "@/types";
import { translations, type Translation } from "@/lib/i18n";

interface LanguageContextValue {
  lang: Language;
  /** Current translation dictionary for `lang`. */
  t: Translation;
  setLang: (lang: Language) => void;
  toggle: () => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = "ficha-lang";

/**
 * Provides the active language + translation dictionary to the tree.
 * Persists the choice in localStorage and keeps <html lang> in sync.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>("en");

  // Resolve the initial preference on mount (client only).
  // Priority: ?lang= query param > localStorage.
  useEffect(() => {
    const fromQuery = new URLSearchParams(window.location.search).get("lang");
    if (fromQuery === "en" || fromQuery === "es") {
      setLangState(fromQuery);
      return;
    }
    const stored = window.localStorage.getItem(STORAGE_KEY) as Language | null;
    if (stored === "en" || stored === "es") {
      setLangState(stored);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    window.localStorage.setItem(STORAGE_KEY, lang);
    // Keep ?lang= in sync so the current language is shareable via URL.
    const url = new URL(window.location.href);
    if (url.searchParams.get("lang") !== lang) {
      url.searchParams.set("lang", lang);
      window.history.replaceState(null, "", url);
    }
  }, [lang]);

  const setLang = useCallback((next: Language) => setLangState(next), []);
  const toggle = useCallback(
    () => setLangState((prev) => (prev === "en" ? "es" : "en")),
    [],
  );

  const value = useMemo<LanguageContextValue>(
    () => ({ lang, t: translations[lang], setLang, toggle }),
    [lang, setLang, toggle],
  );

  return createElement(LanguageContext.Provider, { value }, children);
}

/** Access the current language, translations and setters. */
export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within a <LanguageProvider>");
  }
  return ctx;
}
