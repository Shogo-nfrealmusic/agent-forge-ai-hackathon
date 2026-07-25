"use client";

import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, LOCALES, type Locale } from "@/lib/i18n/messages";

/**
 * EN / 日本語 switch. Writes a cookie and re-renders the server components.
 * No secrets, no storage beyond the cookie.
 */
export default function LangToggle({ locale }: { locale: Locale }) {
  const router = useRouter();

  function setLocale(next: Locale) {
    if (next === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  const label: Record<Locale, string> = { en: "EN", ja: "日本語" };

  return (
    <div className="flex items-center gap-1 text-xs" role="group" aria-label="Language">
      {LOCALES.map((l, i) => (
        <span key={l} className="flex items-center gap-1">
          {i > 0 && <span className="text-stone-300">/</span>}
          <button
            type="button"
            onClick={() => setLocale(l)}
            aria-pressed={l === locale}
            className={
              l === locale
                ? "font-semibold text-stone-900"
                : "text-stone-400 hover:text-stone-700"
            }
          >
            {label[l]}
          </button>
        </span>
      ))}
    </div>
  );
}
