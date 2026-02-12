import { describe, test, expect, mock, beforeEach } from "bun:test";
import { ApiClient, ApiRequestError, CooldownError } from "./client";

describe("ApiClient", () => {
  let client: ApiClient;

  beforeEach(() => {
    client = new ApiClient("test-token");
  });

  test("sends auth header on requests", async () => {
    const originalFetch = globalThis.fetch;
    let capturedHeaders: Headers | undefined;
    globalThis.fetch = mock(async (url, init) => {
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ data: { status: "ok" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    await client.get("/");
    expect(capturedHeaders?.get("Authorization")).toBe("Bearer test-token");

    globalThis.fetch = originalFetch;
  });

  test("throws ApiRequestError on 4xx", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      return new Response(
        JSON.stringify({ error: { code: 478, message: "Insufficient item" } }),
        { status: 478 }
      );
    }) as unknown as typeof fetch;

    await expect(client.post("/my/char/action/fight", {})).rejects.toThrow(ApiRequestError);

    globalThis.fetch = originalFetch;
  });

  test("tracks cooldowns per character", () => {
    client.setCooldown("char1", Date.now() + 5000);
    expect(client.isOnCooldown("char1")).toBe(true);
    expect(client.isOnCooldown("char2")).toBe(false);
  });

  test("cooldown expires", () => {
    client.setCooldown("char1", Date.now() - 1000);
    expect(client.isOnCooldown("char1")).toBe(false);
  });

  test("action methods wait for cooldown and track new cooldown", async () => {
    const originalFetch = globalThis.fetch;
    const cooldownExpiration = new Date(Date.now() + 3000).toISOString();

    globalThis.fetch = mock(async () => {
      return new Response(
        JSON.stringify({
          data: {
            cooldown: {
              total_seconds: 3,
              remaining_seconds: 3,
              started_at: new Date().toISOString(),
              expiration: cooldownExpiration,
              reason: "rest",
            },
            hp_restored: 50,
            character: { name: "testchar" },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as unknown as typeof fetch;

    const result = await client.rest("testchar");
    expect(result.hp_restored).toBe(50);
    expect(client.isOnCooldown("testchar")).toBe(true);

    globalThis.fetch = originalFetch;
  });

  test("stores cooldown from 499 error response", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      return new Response(
        JSON.stringify({ error: { code: 499, message: "The character is in cooldown: 5.50 seconds remaining." } }),
        { status: 499 }
      );
    }) as unknown as typeof fetch;

    await expect(client.post("/my/testchar/action/fight", {})).rejects.toThrow(ApiRequestError);
    expect(client.isOnCooldown("testchar")).toBe(true);
    expect(client.getCooldownRemaining("testchar")).toBeGreaterThan(4000);

    globalThis.fetch = originalFetch;
  });

  test("initializes cooldown from character state on getCharacter", async () => {
    const originalFetch = globalThis.fetch;
    const futureExpiry = new Date(Date.now() + 10000).toISOString();
    globalThis.fetch = mock(async () => {
      return new Response(
        JSON.stringify({
          data: {
            name: "testchar",
            cooldown: 10,
            cooldown_expiration: futureExpiry,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as unknown as typeof fetch;

    await client.getCharacter("testchar");
    expect(client.isOnCooldown("testchar")).toBe(true);
    expect(client.getCooldownRemaining("testchar")).toBeGreaterThan(8000);

    globalThis.fetch = originalFetch;
  });

  test("does not set cooldown from expired character state", async () => {
    const originalFetch = globalThis.fetch;
    const pastExpiry = new Date(Date.now() - 5000).toISOString();
    globalThis.fetch = mock(async () => {
      return new Response(
        JSON.stringify({
          data: {
            name: "testchar",
            cooldown: 0,
            cooldown_expiration: pastExpiry,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as unknown as typeof fetch;

    await client.getCharacter("testchar");
    expect(client.isOnCooldown("testchar")).toBe(false);

    globalThis.fetch = originalFetch;
  });
});
