import { cookies } from "next/headers";
import { LOCALE_COOKIE, isLocale, messages, type Locale, type Messages } from "@/lib/i18n/messages";

/**
 * Server-side locale resolution (cookie-based). Kept separate from messages.ts
 * so client components can import the dictionaries without dragging
 * next/headers into the browser bundle.
 */

export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : "en";
}

export async function getMessages(): Promise<{ locale: Locale; m: Messages }> {
  const locale = await getLocale();
  return { locale, m: messages[locale] };
}
