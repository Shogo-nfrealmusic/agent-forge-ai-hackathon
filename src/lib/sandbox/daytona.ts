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
const SANDBOX_PARAMS = {
  language: "python",
  ephemeral: true,
  networkBlockAll: true,
  autoStopInterval: 1,
  autoDeleteInterval: 5,
  labels: { app: "weather-booking-agent", purpose: "ai-generated-window-analysis" },
} as const;

export interface DaytonaConfigInfo {
  configured: boolean;
  target?: string;
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
  opts: { apiKey?: string | null; timeoutSeconds?: number } = {},
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

    sandbox = await daytona.create(SANDBOX_PARAMS);

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
    if (daytona && sandbox) {
      // Best effort — never let cleanup failure surface to the caller.
      try {
        await daytona.delete(sandbox);
      } catch {
        /* the sandbox will expire on its own */
      }
    }
  }
}
