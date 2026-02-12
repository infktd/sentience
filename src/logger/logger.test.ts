import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Logger } from "./logger";
import { existsSync, unlinkSync, readFileSync } from "fs";

const TEST_LOG = "logs/test-char.log";

describe("Logger", () => {
  let logger: Logger;

  beforeEach(() => {
    if (existsSync(TEST_LOG)) unlinkSync(TEST_LOG);
    logger = new Logger("test-char");
  });

  afterEach(() => {
    if (existsSync(TEST_LOG)) unlinkSync(TEST_LOG);
  });

  test("writes JSON lines to character-specific file", () => {
    logger.info("test message", { key: "value" });
    const content = readFileSync(TEST_LOG, "utf-8").trim();
    const entry = JSON.parse(content);
    expect(entry.character).toBe("test-char");
    expect(entry.level).toBe("info");
    expect(entry.message).toBe("test message");
    expect(entry.data.key).toBe("value");
    expect(entry.timestamp).toBeDefined();
  });

  test("logs decisions with board and state snapshots", () => {
    const board = { characters: {}, bank: { items: [], gold: 0, lastUpdated: 0 } };
    const state = { hp: 100, max_hp: 100 };
    logger.decision("gather copper_ore", "lowest skill is mining", board, state);
    const content = readFileSync(TEST_LOG, "utf-8").trim();
    const entry = JSON.parse(content);
    expect(entry.level).toBe("decision");
    expect(entry.decision).toBe("gather copper_ore");
    expect(entry.reason).toBe("lowest skill is mining");
    expect(entry.board).toEqual(board);
    expect(entry.state).toEqual(state);
  });

  test("logs errors with context", () => {
    logger.error("action failed", { action: "fight", error: "499 cooldown" });
    const content = readFileSync(TEST_LOG, "utf-8").trim();
    const entry = JSON.parse(content);
    expect(entry.level).toBe("error");
    expect(entry.data.action).toBe("fight");
  });
});
