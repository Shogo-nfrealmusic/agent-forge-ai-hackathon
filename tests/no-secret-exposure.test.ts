import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { readSourceFiles } from "./helpers";

/**
 * Secrets must stay on the server.
 *
 * In Next.js, anything read via `process.env.NEXT_PUBLIC_*` — or any env access
 * inside a "use client" module — is inlined into the browser bundle. These
 * tests fail the build if a future change would leak the AI key.
 */

const SECRET_ENV_NAMES = ["AI_API_KEY", "AI_BASE_URL", "AI_MODEL"];
const SECRET_WORDS = ["API_KEY", "APIKEY", "SECRET", "TOKEN", "PASSWORD", "CREDENTIAL"];

function isClientModule(content: string): boolean {
  return /^\s*["']use client["']/m.test(content.split("\n").slice(0, 3).join("\n"));
}

describe("no secret reaches the browser bundle", () => {
  it('no "use client" module reads process.env', async () => {
    const files = await readSourceFiles();
    const clientFiles = files.filter((f) => isClientModule(f.content));

    expect(clientFiles.length, "expected at least one client component to exist").toBeGreaterThan(0);
    for (const { rel, content } of clientFiles) {
      expect(content, `${rel} is a client module and must not read process.env`).not.toContain(
        "process.env",
      );
    }
  });

  it('no "use client" module imports the AI adapter or the audit store', async () => {
    const files = await readSourceFiles();
    for (const { rel, content } of files.filter((f) => isClientModule(f.content))) {
      expect(content, `${rel} must not import the AI adapter`).not.toContain("@/lib/ai/adapter");
      expect(content, `${rel} must not import the audit store`).not.toContain("@/lib/audit/store");
    }
  });

  it("declares no NEXT_PUBLIC_ variable that looks like a credential", async () => {
    const files = await readSourceFiles();
    for (const { rel, content } of files) {
      const publicVars = [...content.matchAll(/NEXT_PUBLIC_[A-Z0-9_]+/g)].map((m) => m[0]);
      for (const name of publicVars) {
        for (const word of SECRET_WORDS) {
          expect(name.includes(word), `${rel} exposes ${name} to the browser`).toBe(false);
        }
      }
    }
  });

  it("reads the AI credentials only from server-side modules", async () => {
    const files = await readSourceFiles();
    const allowed = [path.join("lib", "ai"), path.join("app", "api")];

    for (const { rel, content } of files) {
      const mentionsSecret = SECRET_ENV_NAMES.some((name) =>
        content.includes(`process.env.${name}`) || content.includes(`env.${name}`),
      );
      if (!mentionsSecret) continue;
      expect(
        allowed.some((dir) => rel.includes(dir)),
        `${rel} reads AI credentials but is not a server-only module`,
      ).toBe(true);
    }
  });

  it("hardcodes no credential-looking literal", async () => {
    const files = await readSourceFiles();
    const patterns = [
      /sk-[A-Za-z0-9]{16,}/, // OpenAI style
      /sk-ant-[A-Za-z0-9-]{16,}/, // Anthropic style
      /AIza[0-9A-Za-z_-]{20,}/, // Google style
      /gh[pousr]_[A-Za-z0-9]{20,}/, // GitHub style
    ];
    for (const { rel, content } of files) {
      for (const pattern of patterns) {
        expect(pattern.test(content), `${rel} contains a hardcoded credential`).toBe(false);
      }
    }
  });

  it("next.config.ts does not re-export env vars to the client", async () => {
    const config = await readFile(path.join(process.cwd(), "next.config.ts"), "utf8");
    expect(config).not.toContain("AI_API_KEY");
    expect(config).not.toMatch(/^\s*env\s*:/m);
  });
});

describe(".env.example is a template, not a secret store", () => {
  it("exists and ships no real values", async () => {
    const example = await readFile(path.join(process.cwd(), ".env.example"), "utf8");
    expect(example).toContain("AI_API_KEY=");

    for (const line of example.split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match) continue;
      const [, name, value] = match;
      if (SECRET_WORDS.some((w) => name.includes(w))) {
        expect(value.trim(), `${name} in .env.example must be empty`).toBe("");
      }
    }
  });

  it("is not shadowed by a committed .env file", async () => {
    const gitignore = await readFile(path.join(process.cwd(), ".gitignore"), "utf8");
    expect(gitignore).toMatch(/^\.env\*?$/m);
    expect(gitignore).toContain("!.env.example");
  });
});
