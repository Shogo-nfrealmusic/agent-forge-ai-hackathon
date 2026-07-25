import type { Metadata } from "next";
import Link from "next/link";
import { getMessages } from "@/lib/i18n/server";
import LangToggle from "@/components/LangToggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "Weather Booking Adjustment Agent",
  description:
    "Human-in-the-loop AI agent that assesses weather risk for outdoor photo-shoot bookings and drafts customer messages. Prototype — mock data only.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { locale, m } = await getMessages();

  return (
    <html lang={locale} className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto flex max-w-4xl flex-wrap items-baseline gap-x-6 gap-y-1 px-6 py-4">
            <Link href="/" className="text-sm font-semibold tracking-tight">
              Weather Booking Agent
            </Link>
            <span className="font-mono text-[11px] text-stone-400">{m.nav.prototypeNote}</span>
            <nav className="ml-auto flex items-center gap-5 text-sm text-stone-500">
              <Link href="/" className="hover:text-stone-900">
                {m.nav.bookings}
              </Link>
              <Link href="/audit" className="hover:text-stone-900">
                {m.nav.audit}
              </Link>
              <LangToggle locale={locale} />
            </nav>
          </div>
        </header>

        <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">{children}</main>

        <footer className="border-t border-stone-200">
          <div className="mx-auto max-w-4xl px-6 py-5 text-[11px] leading-relaxed text-stone-400">
            {m.footer}
          </div>
        </footer>
      </body>
    </html>
  );
}
