import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Weather Booking Adjustment Agent",
  description:
    "Human-in-the-loop AI agent that assesses weather risk for outdoor photo-shoot bookings and drafts customer messages. Prototype — mock data only.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4">
            <Link href="/" className="text-base font-semibold tracking-tight">
              Weather Booking Adjustment Agent
            </Link>
            <nav className="flex gap-4 text-sm text-slate-600">
              <Link href="/" className="hover:text-slate-900 hover:underline">
                Bookings
              </Link>
              <Link href="/audit" className="hover:text-slate-900 hover:underline">
                Audit log
              </Link>
            </nav>
            <span className="ml-auto rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
              PROTOTYPE / MOCK DATA · never writes to a booking system
            </span>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>

        <footer className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-5xl px-6 py-4 text-xs leading-relaxed text-slate-500">
            Hackathon prototype. It contains no real customer data and never changes, cancels or
            refunds a booking. Staff decisions are written only to a local audit log, and a message
            can only be delivered after a staff member has approved it.
          </div>
        </footer>
      </body>
    </html>
  );
}
