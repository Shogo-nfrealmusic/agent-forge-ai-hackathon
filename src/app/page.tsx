import Link from "next/link";
import { triageBookings, type TriagedBooking } from "@/lib/triage";
import { getMessages } from "@/lib/i18n/server";
import { describeAiProviders } from "@/lib/ai/providers";
import { describeWhatsAppProvider } from "@/lib/delivery/whatsapp";
import { describeDaytona } from "@/lib/sandbox/daytona";
import { RiskBadge } from "@/components/badges";
import type { Messages } from "@/lib/i18n/messages";

// Triage reflects the runtime environment and forecast, not build time.
export const dynamic = "force-dynamic";

function Row({ item, m }: { item: TriagedBooking; m: Messages }) {
  const { booking, weather, risk } = item;
  const wind = Math.max(weather.windSpeedMaxKmh, weather.windGustMaxKmh);

  return (
    <Link
      href={`/bookings/${booking.bookingId}`}
      className="grid grid-cols-[7.5rem_1fr_5rem_4rem_4.5rem] items-baseline gap-x-4 px-3 py-3 text-sm hover:bg-white"
    >
      <span className="tnum text-stone-500">
        {booking.date.slice(5).replace("-", "/")}{" "}
        <span className="text-stone-400">{booking.time.split("-")[0]}</span>
      </span>
      <span className="min-w-0">
        <span className="font-medium">{booking.plan}</span>
        <span className="text-stone-400"> · {booking.location}</span>
        <span className="tnum text-stone-400">
          {" "}
          · {booking.durationMinutes}
          {m.list.minutes}
        </span>
      </span>
      <RiskBadge level={risk.riskLevel} size="sm" />
      <span className="tnum text-right text-stone-600">
        {weather.precipitationProbabilityMax}%
      </span>
      <span className="tnum text-right text-stone-600">{wind} km/h</span>
    </Link>
  );
}

function ColumnHeader({ m }: { m: Messages }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr_5rem_4rem_4.5rem] gap-x-4 border-b border-stone-200 px-3 pb-2 text-[11px] uppercase tracking-wide text-stone-400">
      <span>{m.list.colWhen}</span>
      <span>{m.list.colBooking}</span>
      <span>{m.list.colRisk}</span>
      <span className="text-right">{m.list.colRain}</span>
      <span className="text-right">{m.list.colWind}</span>
    </div>
  );
}

export default async function TriagePage() {
  const { m } = await getMessages();
  const triage = await triageBookings();

  const aiProviders = describeAiProviders().filter((p) => p.configured);
  const whatsapp = describeWhatsAppProvider();
  const daytona = describeDaytona();
  const flagged = triage.action.length + triage.watch.length;

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-lg font-semibold tracking-tight">{m.list.title}</h1>
        <p className="mt-1 text-sm text-stone-500">{m.list.subtitle(flagged, triage.total)}</p>
      </section>

      {/* --- Needs action ------------------------------------------------- */}
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
          {m.list.needsAction}
          <span className="tnum ml-2 font-normal text-stone-400">{triage.action.length}</span>
        </h2>
        {triage.action.length === 0 ? (
          <p className="px-3 py-4 text-sm text-stone-400">{m.list.empty}</p>
        ) : (
          <div>
            <ColumnHeader m={m} />
            <div className="divide-y divide-stone-100">
              {triage.action.map((item) => (
                <Row key={item.booking.bookingId} item={item} m={m} />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* --- Watch -------------------------------------------------------- */}
      {triage.watch.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
            {m.list.watch}
            <span className="tnum ml-2 font-normal text-stone-400">{triage.watch.length}</span>
          </h2>
          <div className="divide-y divide-stone-100 border-t border-stone-200">
            {triage.watch.map((item) => (
              <Row key={item.booking.bookingId} item={item} m={m} />
            ))}
          </div>
        </section>
      )}

      {/* --- All clear (collapsed) ---------------------------------------- */}
      <section>
        <details>
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-stone-400 hover:text-stone-600">
            {m.list.allClear}
            <span className="tnum ml-2 font-normal">{triage.clear.length}</span>
            <span className="ml-3 font-normal normal-case tracking-normal">
              {m.list.allClearHint}
            </span>
          </summary>
          <div className="mt-2 divide-y divide-stone-100 border-t border-stone-200">
            {triage.clear.map((item) => (
              <Row key={item.booking.bookingId} item={item} m={m} />
            ))}
          </div>
        </details>
      </section>

      {/* --- Runtime capability, quiet ------------------------------------ */}
      <p className="border-t border-stone-200 pt-4 font-mono text-[11px] leading-relaxed text-stone-400">
        weather: Open-Meteo → fixture · ai:{" "}
        {aiProviders.length > 0 ? aiProviders.map((p) => p.label).join(" → ") : "mock"} · sandbox:{" "}
        {daytona.configured ? "Daytona" : "local"} · delivery:{" "}
        {whatsapp.configured
          ? whatsapp.realSendEnabled
            ? `LIVE (${whatsapp.provider})`
            : `${whatsapp.provider}, locked`
          : "hand-off links"}
      </p>
    </div>
  );
}
