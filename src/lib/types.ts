/**
 * Shared domain types for the Weather Booking Adjustment Agent.
 *
 * SAFETY NOTE: This prototype is read-only with respect to any booking system.
 * There is no type here representing a booking mutation, and none must be added
 * without an explicit human-approval + audit design.
 *
 * Outbound messaging (WhatsApp / email) IS modelled, but it is gated: a message
 * can only be delivered for a booking that already has an `approved` decision,
 * and real sending stays off unless DELIVERY_ALLOW_REAL_SEND=true.
 */

export type RiskLevel = "low" | "medium" | "high";

export type Recommendation =
  | "keep"
  | "reschedule"
  | "plan_change"
  | "contact_staff";

export type StaffDecision = "approved" | "rejected" | "needs_discussion";

/** A mock booking. All customer fields are dummy values by construction. */
export interface Booking {
  bookingId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM-HH:MM (local to `timezone`)
  timezone: string;
  location: string;
  latitude: number;
  longitude: number;
  durationMinutes: number;
  plan: string;
  customerName: string; // dummy only — see tests/no-real-customer-data.test.ts
  customerEmail: string; // dummy only — must be @example.com
  /** Dummy only — must be in the +1-555-01XX range reserved for fiction. */
  customerPhone: string; // E.164
  notes?: string;
}

export type WeatherSource = "open-meteo" | "fixture";

/** Normalised weather for the booking window. Adapter-agnostic. */
export interface WeatherSummary {
  source: WeatherSource;
  fetchedAt: string; // ISO
  /** True when the live API failed / was unavailable and fixture data was used. */
  degraded: boolean;
  fallbackReason?: string;
  date: string;
  timeRange: string;
  /** Max precipitation probability (%) across the booking window. */
  precipitationProbabilityMax: number;
  /** Total precipitation (mm) across the booking window. */
  precipitationMm: number;
  /** Max sustained wind speed (km/h). */
  windSpeedMaxKmh: number;
  /** Max wind gust (km/h). */
  windGustMaxKmh: number;
  temperatureC: number;
  /** WMO weather codes observed in the window. */
  weatherCodes: number[];
  conditionLabel: string;
  /** Severe-weather warnings (typhoon / storm advisories). Empty for live API. */
  alerts: string[];
}

export interface RuleHit {
  id: string;
  level: RiskLevel;
  label: string;
  detail: string;
}

/** Output of the deterministic rule engine — the source of truth for the UI. */
export interface DeterministicRisk {
  riskLevel: RiskLevel;
  hits: RuleHit[];
  /** Human-readable summary of why this level was chosen. */
  reason: string;
}

/** Validated AI output. Shape is enforced by zod before it reaches the UI. */
export interface AiRecommendation {
  riskLevel: RiskLevel;
  summary: string;
  recommendation: Recommendation;
  customerMessage: string;
  confidence: number;
  requiresHumanReview: boolean;
}

export type AiSource = "live" | "mock";

export interface AiResult {
  recommendation: AiRecommendation;
  source: AiSource;
  /** Which provider answered, e.g. "qwen-cloud" | "gmi-cloud". Never a secret. */
  provider?: string;
  /** Set when a provider failed, failover happened, or the mock was used. */
  fallbackReason?: string;
  model?: string;
  latencyMs?: number;
}

export type AgreementStatus = "agree" | "needs_check";

export interface AnalysisResult {
  booking: Booking;
  weather: WeatherSummary;
  deterministic: DeterministicRisk;
  ai: AiResult;
  agreement: AgreementStatus;
  /** Highest of deterministic / AI level — used for the "act on the worse case" banner. */
  effectiveRiskLevel: RiskLevel;
  analyzedAt: string;
  /** Delivery capability for this environment. Never contains credentials. */
  delivery: {
    providers: DeliveryProviderInfo[];
    /** Where a hand-off link should point. Never a credential. */
    targets: { whatsapp: string; email: string; overridden: boolean };
  };
}

/* ------------------------------------------------------------------------ */
/* Alternative shooting windows (Daytona sandbox feature)                    */
/* ------------------------------------------------------------------------ */

/** One hour of forecast for the whole booking day. */
export interface HourlyPoint {
  hour: number; // 0-23, local to the booking timezone
  time: string; // "HH:MM"
  precipitationProbability: number;
  precipitationMm: number;
  windSpeedKmh: number;
  windGustKmh: number;
  temperatureC: number;
  weatherCode: number;
}

export interface DayForecast {
  source: WeatherSource;
  degraded: boolean;
  fallbackReason?: string;
  date: string;
  hours: HourlyPoint[];
}

export interface ShootingWindow {
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  precipitationProbabilityMax: number;
  windSpeedMaxKmh: number;
  temperatureC: number;
  /** Lower is better. Comparable only within one analysis. */
  score: number;
  riskLevel: RiskLevel;
}

/**
 * Where the window analysis was computed.
 *   daytona-sandbox : the model wrote Python and it ran inside a Daytona sandbox
 *   local-trusted   : our own hand-written implementation (no generated code ran)
 */
export type WindowAnalysisSource = "daytona-sandbox" | "local-trusted";

export interface WindowAnalysis {
  source: WindowAnalysisSource;
  /** The booking's own window, scored on the same scale. */
  current: ShootingWindow | null;
  /** Best alternative on the same day, or null if nothing is better. */
  best: ShootingWindow | null;
  alternatives: ShootingWindow[];
  /** Set when the sandbox path was unavailable or failed. */
  fallbackReason?: string;
  /** The Python the model wrote. Shown in the UI; null on the local path. */
  generatedCode?: string | null;
  executionMs?: number;
}

/* ------------------------------------------------------------------------ */
/* Outbound delivery                                                         */
/* ------------------------------------------------------------------------ */

export type DeliveryChannel = "whatsapp" | "email";

export type DeliveryMode =
  /** A deep link was produced; the staff member sends from their own client. */
  | "link_handoff"
  /** A provider call was simulated — nothing left this machine. */
  | "dry_run"
  /** A real provider API call was made. */
  | "provider_api";

export type DeliveryStatus = "prepared" | "sent" | "failed";

export interface DeliveryProviderInfo {
  channel: DeliveryChannel;
  /** "meta" | "twilio" | null (null = no provider configured) */
  provider: string | null;
  configured: boolean;
  /** Master kill switch. False → provider calls are simulated, never sent. */
  realSendEnabled: boolean;
}

export interface DeliveryResult {
  channel: DeliveryChannel;
  mode: DeliveryMode;
  status: DeliveryStatus;
  /** Masked destination — the full address/number is never returned or logged. */
  destinationMasked: string;
  /** True when DEMO_WHATSAPP_TO / DEMO_EMAIL_TO replaced the fixture contact. */
  destinationOverridden?: boolean;
  provider?: string;
  providerMessageId?: string;
  errorReason?: string;
}

/* ------------------------------------------------------------------------ */
/* Audit log                                                                 */
/* ------------------------------------------------------------------------ */

interface AuditEntryBase {
  id: string;
  recordedAt: string;
  bookingId: string;
  /** Always false — no booking system is ever mutated by this prototype. */
  bookingSystemMutated: false;
  note: string;
}

export interface DecisionAuditEntry extends AuditEntryBase {
  kind: "decision";
  decision: StaffDecision;
  /** Free-text reason. Required for `rejected`. */
  reason: string | null;
  deterministicRiskLevel: RiskLevel;
  aiRiskLevel: RiskLevel;
  aiRecommendation: Recommendation;
  agreement: AgreementStatus;
  weatherSource: WeatherSource;
  aiSource: AiSource;
}

export interface DeliveryAuditEntry extends AuditEntryBase {
  kind: "delivery";
  channel: DeliveryChannel;
  mode: DeliveryMode;
  status: DeliveryStatus;
  destinationMasked: string;
  /** True when a demo override replaced the fixture contact. */
  destinationOverridden?: boolean;
  /** The approved decision this delivery is attached to. Required. */
  decisionEntryId: string;
  provider?: string;
  providerMessageId?: string;
  errorReason?: string;
  /** Length only — the message body is never written to the audit log. */
  messageLength: number;
}

export type AuditEntry = DecisionAuditEntry | DeliveryAuditEntry;

export function isDecisionEntry(entry: AuditEntry): entry is DecisionAuditEntry {
  return entry.kind === "decision";
}

export function isDeliveryEntry(entry: AuditEntry): entry is DeliveryAuditEntry {
  return entry.kind === "delivery";
}
