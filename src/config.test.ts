import { describe, test, expect, afterEach } from "bun:test";
import { loadConfig } from "./config";

describe("loadConfig", () => {
  const originalEnv = Bun.env.ARTIFACTS_API_TOKEN;

  afterEach(() => {
    if (originalEnv !== undefined) {
      Bun.env.ARTIFACTS_API_TOKEN = originalEnv;
    }
  });

  test("throws if ARTIFACTS_API_TOKEN is missing", () => {
    Bun.env.ARTIFACTS_API_TOKEN = undefined;
    expect(() => loadConfig()).toThrow("ARTIFACTS_API_TOKEN is not set");
  });

  test("returns config with token when set", () => {
    Bun.env.ARTIFACTS_API_TOKEN = "test-token";
    const config = loadConfig();
    expect(config.apiToken).toBe("test-token");
    expect(config.characters).toEqual([]);
  });
});
