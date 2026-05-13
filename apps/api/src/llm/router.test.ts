/**
 * Unit tests for getLLMProvider routing logic.
 *
 * Controls env vars directly via vi.stubEnv so each test gets an isolated
 * environment. The singleton cache in router.ts is reset between tests by
 * reimporting the module.
 *
 * @author Al Amin Ahamed
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Stub provider classes so no real SDK init happens ─────────────────────────

vi.mock("./anthropic.js", () => ({
  AnthropicProvider: class {
    name() { return "anthropic"; }
    async complete() { return ""; }
    async completeJSON(_: unknown, schema: { parse: (v: unknown) => unknown }) { return schema.parse({}); }
  },
}));

vi.mock("./openai.js", () => ({
  OpenAIProvider: class {
    name() { return "openai"; }
    async complete() { return ""; }
    async completeJSON(_: unknown, schema: { parse: (v: unknown) => unknown }) { return schema.parse({}); }
  },
}));

vi.mock("./ollama.js", () => ({
  OllamaProvider: class {
    name() { return "ollama"; }
    async complete() { return ""; }
    async completeJSON(_: unknown, schema: { parse: (v: unknown) => unknown }) { return schema.parse({}); }
  },
}));

// env.ts caches its result; reset between tests by clearing the module cache
beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("getLLMProvider routing", () => {
  it("LLM_PROVIDER=anthropic with key set returns AnthropicProvider", async () => {
    vi.stubEnv("LLM_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    vi.stubEnv("OPENAI_API_KEY", "sk-openai-test");
    vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost/test");
    vi.stubEnv("OCR_SERVICE_URL", "http://localhost:8000");

    const { getLLMProvider } = await import("./router.js");
    const provider = getLLMProvider();
    expect(provider.name()).toBe("anthropic");
  });

  it("LLM_PROVIDER=anthropic with no Anthropic key falls back to OpenAI", async () => {
    vi.stubEnv("LLM_PROVIDER", "anthropic");
    vi.stubEnv("OPENAI_API_KEY", "sk-openai-test");
    vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost/test");
    vi.stubEnv("OCR_SERVICE_URL", "http://localhost:8000");
    // No ANTHROPIC_API_KEY

    const { getLLMProvider } = await import("./router.js");
    const provider = getLLMProvider();
    expect(provider.name()).toBe("openai");
  });

  it("LLM_PROVIDER=ollama returns OllamaProvider regardless of API keys", async () => {
    vi.stubEnv("LLM_PROVIDER", "ollama");
    vi.stubEnv("OPENAI_API_KEY", "sk-openai-test");
    vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost/test");
    vi.stubEnv("OCR_SERVICE_URL", "http://localhost:8000");

    const { getLLMProvider } = await import("./router.js");
    const provider = getLLMProvider();
    expect(provider.name()).toBe("ollama");
  });

  it("unset LLM_PROVIDER defaults to Anthropic when key is present", async () => {
    // Explicitly remove LLM_PROVIDER so Zod default ("anthropic") applies
    delete process.env["LLM_PROVIDER"];
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    vi.stubEnv("OPENAI_API_KEY", "sk-openai-test");
    vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost/test");
    vi.stubEnv("OCR_SERVICE_URL", "http://localhost:8000");

    const { getLLMProvider } = await import("./router.js");
    const provider = getLLMProvider();
    expect(provider.name()).toBe("anthropic");
  });

  it("unset LLM_PROVIDER with only OpenAI key falls back to OpenAI", async () => {
    delete process.env["LLM_PROVIDER"];
    vi.stubEnv("OPENAI_API_KEY", "sk-openai-test");
    vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost/test");
    vi.stubEnv("OCR_SERVICE_URL", "http://localhost:8000");
    // No ANTHROPIC_API_KEY, no LLM_PROVIDER

    const { getLLMProvider } = await import("./router.js");
    const provider = getLLMProvider();
    expect(provider.name()).toBe("openai");
  });

  it("explicit override bypasses env LLM_PROVIDER", async () => {
    vi.stubEnv("LLM_PROVIDER", "anthropic");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    vi.stubEnv("OPENAI_API_KEY", "sk-openai-test");
    vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost/test");
    vi.stubEnv("OCR_SERVICE_URL", "http://localhost:8000");

    const { getLLMProvider } = await import("./router.js");
    const provider = getLLMProvider("ollama");
    expect(provider.name()).toBe("ollama");
  });
});
