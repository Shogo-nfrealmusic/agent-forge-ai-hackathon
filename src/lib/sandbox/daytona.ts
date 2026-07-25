/**
 * Daytona sandbox adapter (SERVER ONLY).
 *
 * Daytona provides isolated infrastructure for running AI-generated code.
 * That is exactly what we need it for: the model writes a Python analysis
 * script, and that script runs **inside a Daytona sandbox — never on our
 * server**.
 *
 * The rule this enforces:
 *
 *   AI-generated code is executed ONLY in a sandbox. If no sandbox is
 *   available, we do not run it at all — we fall back to our own trusted,
 *   hand-written implementation instead.
 *
 * That is why there is no local `eval` path anywhere in this codebase.
 *
 * Docs: https://www.daytona.io/docs
 */

const DEFAULT_TIMEOUT_S = 45;

/**
 * How every sandbox we create is configured.
 *
 * `networkBlockAll` is the important one: the generated analysis is pure
 * arithmetic over data we inject, so it has no legitimate reason to reach the
 * network. Blocking it at the sandbox boundary means that even if the static
 * screen in windows/codegen.ts misses something, the code still cannot call
 * out or exfiltrate anything.
 *
 * The lifecycle settings exist to protect a hackathon credit balance: the
 * sandbox is ephemeral, stops after a minute idle, and self-deletes — on top of
 * the explicit delete in the `finally` block below.
 */
const BASE_SANDBOX_PARAMS = {
  language: "python",
  networkBlockAll: true,
  autoStopInterval: 1,
} as const;

/**
 * Demo mode. With DAYTONA_KEEP_SANDBOX=true the sandbox is NOT deleted after
 * the run, so it stays visible in the Daytona dashboard — useful for showing an
 * audience that the generated code really did execute somewhere isolated.
 *
 * It still auto-stops after a minute, so it is not burning compute; it only
 * holds a slot. Leave it off outside a demo.
 */
export function shouldKeepSandbox(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DAYTONA_KEEP_SANDBOX?.trim() === "true";
}

function sandboxParams(label: string, keep: boolean): Record<string, unknown> {
  return {
    ...BASE_SANDBOX_PARAMS,
    // A readable name so the dashboard row is identifiable during a demo.
    name: `wbaa-${label}`,
    labels: {
      app: "weather-booking-agent",
      purpose: "ai-generated-window-analysis",
      booking: label,
    },
    // Kept sandboxes must not be ephemeral, or they vanish when they stop.
    ephemeral: !keep,
    ...(keep ? { autoArchiveInterval: 60 } : { autoDeleteInterval: 5 }),
  };
}

export interface DaytonaConfigInfo {
  configured: boolean;
  target?: string;
  /** True when sandboxes are kept for inspection in the dashboard. */
  keepSandboxes: boolean;
}

export interface SandboxRunResult {
  ok: boolean;
  /** stdout from the sandbox. */
  output: string;
  exitCode?: number;
  errorReason?: string;
  durationMs: number;
}

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error(
      "sandbox/daytona.ts must never run in the browser — the API key is server-side only.",
    );
  }
}

export function readDaytonaApiKey(env: NodeJS.ProcessEnv = process.env): string | null {
  return env.DAYTONA_API_KEY?.trim() || null;
}

export function isDaytonaConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return readDaytonaApiKey(env) !== null;
}

export function describeDaytona(env: NodeJS.ProcessEnv = process.env): DaytonaConfigInfo {
  return {
    configured: isDaytonaConfigured(env),
    target: env.DAYTONA_TARGET?.trim() || undefined,
    keepSandboxes: shouldKeepSandbox(env),
  };
}

/**
 * Run Python inside a fresh Daytona sandbox and return stdout. NEVER throws.
 *
 * The sandbox is deleted afterwards on a best-effort basis so a demo does not
 * leak credits.
 *
 * @param opts.apiKey injected for tests; `undefined` reads the environment,
 *                    `null` forces the "not configured" path.
 */
export async function runPythonInSandbox(
  code: string,
  opts: { apiKey?: string | null; timeoutSeconds?: number; label?: string; keep?: boolean } = {},
): Promise<SandboxRunResult> {
  assertServerOnly();
  const startedAt = Date.now();

  const failed = (errorReason: string): SandboxRunResult => ({
    ok: false,
    output: "",
    errorReason,
    durationMs: Date.now() - startedAt,
  });

  const apiKey = opts.apiKey !== undefined ? opts.apiKey : readDaytonaApiKey();
  const keep = opts.keep ?? shouldKeepSandbox();
  if (!apiKey) {
    return failed("DAYTONA_API_KEY is not set, so no sandbox is available");
  }

  if (code.trim().length === 0) {
    return failed("Refusing to run empty code in a sandbox");
  }

  // Minimal structural types — we only touch the two calls we need, so an SDK
  // version bump elsewhere cannot break compilation here.
  interface SandboxHandle {
    process: {
      codeRun: (
        code: string,
        params?: unknown,
        timeout?: number,
      ) => Promise<{ exitCode?: number; result: string }>;
    };
  }
  interface DaytonaHandle {
    create: (params?: Record<string, unknown>) => Promise<SandboxHandle>;
    delete: (sandbox: SandboxHandle) => Promise<void>;
  }

  let sandbox: SandboxHandle | null = null;
  let daytona: DaytonaHandle | null = null;

  try {
    // Imported lazily so the SDK is never pulled into a bundle that does not
    // need it, and so a missing/broken install degrades instead of crashing.
    const { Daytona } = await import("@daytonaio/sdk");
    daytona = new Daytona({
      apiKey,
      ...(process.env.DAYTONA_TARGET?.trim()
        ? { target: process.env.DAYTONA_TARGET.trim() }
        : {}),
    }) as unknown as DaytonaHandle;

    const label = (opts.label ?? "run").replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 40);
    sandbox = await daytona.create(sandboxParams(label, keep));

    const response = await sandbox.process.codeRun(
      code,
      undefined,
      opts.timeoutSeconds ?? DEFAULT_TIMEOUT_S,
    );

    const exitCode = response.exitCode ?? 0;
    if (exitCode !== 0) {
      return {
        ok: false,
        output: response.result ?? "",
        exitCode,
        errorReason: `The sandbox exited with code ${exitCode}`,
        durationMs: Date.now() - startedAt,
      };
    }

    return {
      ok: true,
      output: response.result ?? "",
      exitCode,
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failed(`Daytona sandbox failed: ${message}`);
  } finally {
    // In demo mode the sandbox is deliberately left behind so it shows up in
    // the Daytona dashboard. Otherwise it is removed immediately.
    if (daytona && sandbox && !keep) {
      // Best effort — never let cleanup failure surface to the caller.
      try {
        await daytona.delete(sandbox);
      } catch {
        /* the sandbox will expire on its own via autoDeleteInterval */
      }
    }
  }
}
