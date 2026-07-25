import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Weather Booking Adjustment Agent",
  description:
    "屋外フォト撮影の予約と天気予報から撮影リスクと対応案を提示する、人間承認前提のAIエージェント（プロトタイプ / mock data）",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4">
            <Link href="/" className="text-base font-semibold tracking-tight">
              Weather Booking Adjustment Agent
            </Link>
            <nav className="flex gap-4 text-sm text-slate-600">
              <Link href="/" className="hover:text-slate-900 hover:underline">
                予約一覧
              </Link>
              <Link href="/audit" className="hover:text-slate-900 hover:underline">
                監査ログ
              </Link>
            </nav>
            <span className="ml-auto rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
              PROTOTYPE / MOCK DATA · 予約システムへの書き込みなし
            </span>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>

        <footer className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-5xl px-6 py-4 text-xs leading-relaxed text-slate-500">
            このアプリはハッカソン用プロトタイプです。実在の顧客データは含まれず、予約の変更・キャンセル・返金は一切行いません。
            スタッフの承認記録はローカルの監査ログにのみ保存されます。
          </div>
        </footer>
      </body>
    </html>
  );
}
