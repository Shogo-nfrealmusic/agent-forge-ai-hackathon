/**
 * Shared domain types for the Weather Booking Adjustment Agent.
 *
 * SAFETY NOTE: This prototype is read-only with respect to any booking system.
 * There is no type in this file representing a booking mutation, and none must
 * be added without an explicit human-approval + audit design.
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
  /** Set when the live provider failed or returned an unusable payload. */
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
}

export interface AuditEntry {
  id: string;
  recordedAt: string;
  bookingId: string;
  decision: StaffDecision;
  /** Free-text reason. Required for `rejected`. */
  reason: string | null;
  deterministicRiskLevel: RiskLevel;
  aiRiskLevel: RiskLevel;
  aiRecommendation: Recommendation;
  agreement: AgreementStatus;
  weatherSource: WeatherSource;
  aiSource: AiSource;
  /** Always false in this prototype — no booking system is ever mutated. */
  bookingSystemMutated: false;
  note: string;
}
