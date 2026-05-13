/**
 * Runs before any test module is imported.
 * Sets minimum required env vars so loadEnv() succeeds during module collection.
 * Integration tests override DATABASE_URL with TEST_DATABASE_URL if present.
 */
process.env["DATABASE_URL"] ??= process.env["TEST_DATABASE_URL"] ?? "postgres://test:test@localhost:5432/test";
process.env["OCR_SERVICE_URL"] ??= "http://localhost:8000";
process.env["OPENAI_API_KEY"] ??= "sk-test-stub";
process.env["LLM_PROVIDER"] ??= "openai";
