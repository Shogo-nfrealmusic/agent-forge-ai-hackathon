import type { WindowAnalysis } from "@/lib/types";

/**
 * Short-lived in-memory cache for the window analysis.
 *
 * Two reasons this exists:
 *
 *  1. Cost. Every uncached analysis creates a Daytona sandbox. Without this,
 *     simply refreshing a booking page — or clicking through seven bookings
 *     twice during a demo — burns sandbox credits for an answer that has not
 *     changed.
 *  2. Correctness. An hourly forecast does not move minute to minute, so
 *     recomputing on every page view buys nothing.
 *
 * Deliberately process-local and non-persistent: on serverless each instance
 * keeps its own copy and it disappears on a cold start. That is fine — a miss
 * only costs one extra sandbox, never a wrong answer.
 *
 * Only successful sandbox results are cached. A local-trusted fallback is cheap
 * to recompute, and caching it would keep serving the degraded answer after the
 * sandbox recovers.
 */

const TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ENTRIES = 100;

interface CacheEntry {
  analysis: WindowAnalysis;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Same booking + same forecast data => same answer. */
export function windowCacheKey(bookingId: string, forecastFingerprint: string): string {
  return `${bookingId}:${forecastFingerprint}`;
}

export function readWindowCache(key: string, now = Date.now()): WindowAnalysis | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= now) {
    cache.delete(key);
    return null;
  }
  return hit.analysis;
}

export function writeWindowCache(
  key: string,
  analysis: WindowAnalysis,
  now = Date.now(),
): void {
  // Never cache a degraded result — it would outlive the outage that caused it.
  if (analysis.source !== "daytona-sandbox") return;

  if (cache.size >= MAX_ENTRIES) {
    // Cheap eviction: drop the oldest inserted key.
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }

  cache.set(key, { analysis, expiresAt: now + TTL_MS });
}

/** Test helper. */
export function clearWindowCache(): void {
  cache.clear();
}

export function windowCacheSize(): number {
  return cache.size;
}
