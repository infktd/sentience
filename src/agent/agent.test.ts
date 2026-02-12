import { describe, test, expect, afterEach } from "bun:test";
import { Agent } from "./agent";
import { GameData } from "./game-data";
import type { Character, GameMap, Monster, SimpleItem, Goal } from "../types";
import type { BoardSnapshot } from "../board/board";
import { Board } from "../board/board";
import { Coordinator } from "../coordinator/coordinator";
import { existsSync, unlinkSync } from "fs";

const TEST_LOG = "logs/test-agent.log";

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    name: "test-agent", account: "test", skin: "men1", level: 1,
    xp: 0, max_xp: 100, gold: 0, speed: 0,
    mining_level: 1, mining_xp: 0, mining_max_xp: 100,
    woodcutting_level: 1, woodcutting_xp: 0, woodcutting_max_xp: 100,
    fishing_level: 1, fishing_xp: 0, fishing_max_xp: 100,
    weaponcrafting_level: 1, weaponcrafting_xp: 0, weaponcrafting_max_xp: 100,
    gearcrafting_level: 1, gearcrafting_xp: 0, gearcrafting_max_xp: 100,
    jewelrycrafting_level: 1, jewelrycrafting_xp: 0, jewelrycrafting_max_xp: 100,
    cooking_level: 1, cooking_xp: 0, cooking_max_xp: 100,
    alchemy_level: 1, alchemy_xp: 0, alchemy_max_xp: 100,
    hp: 100, max_hp: 100, haste: 0, critical_strike: 0, wisdom: 0,
    prospecting: 0, initiative: 0, threat: 0,
    attack_fire: 0, attack_earth: 0, attack_water: 0, attack_air: 0,
    dmg: 0, dmg_fire: 0, dmg_earth: 0, dmg_water: 0, dmg_air: 0,
    res_fire: 0, res_earth: 0, res_water: 0, res_air: 0,
    effects: [], x: 0, y: 0, layer: "overworld", map_id: 0,
    cooldown: 0, cooldown_expiration: new Date().toISOString(),
    weapon_slot: "", rune_slot: "", shield_slot: "", helmet_slot: "",
    body_armor_slot: "", leg_armor_slot: "", boots_slot: "",
    ring1_slot: "", ring2_slot: "", amulet_slot: "",
    artifact1_slot: "", artifact2_slot: "", artifact3_slot: "",
    utility1_slot: "", utility1_slot_quantity: 0,
    utility2_slot: "", utility2_slot_quantity: 0, bag_slot: "",
    task: "", task_type: "", task_progress: 0, task_total: 0,
    inventory_max_items: 20, inventory: [],
    ...overrides,
  };
}

describe("Agent", () => {
  afterEach(() => {
    if (existsSync(TEST_LOG)) unlinkSync(TEST_LOG);
  });

  test("overrides strategy with rest when HP is low", () => {
    const char = makeCharacter({ hp: 30, max_hp: 100 });
    const needsRest = Agent.checkSurvivalOverride(char);
    expect(needsRest).toEqual({ type: "rest" });
  });

  test("overrides strategy with deposit when total quantity near max", () => {
    // Few slots but high quantities — total quantity triggers deposit
    const inventory = [
      { slot: 0, code: "copper_ore", quantity: 50 },
      { slot: 1, code: "ash_wood", quantity: 48 },
    ];
    const char = makeCharacter({ inventory, inventory_max_items: 100 });
    // totalQuantity=98 >= 100-5=95 → deposit
    const needsDeposit = Agent.checkSurvivalOverride(char);
    expect(needsDeposit).toEqual({ type: "deposit_all" });
  });

  test("overrides strategy with deposit when 20 slots used", () => {
    const inventory = Array.from({ length: 20 }, (_, i) => ({
      slot: i,
      code: `item_${i}`,
      quantity: 1,
    }));
    // totalQuantity=20, max=200 → quantity check doesn't fire
    // but 20 slots >= 20 → deposit
    const char = makeCharacter({ inventory, inventory_max_items: 200 });
    const needsDeposit = Agent.checkSurvivalOverride(char);
    expect(needsDeposit).toEqual({ type: "deposit_all" });
  });

  test("no override when character is healthy with space", () => {
    const inventory = [
      { slot: 0, code: "copper_ore", quantity: 10 },
    ];
    const char = makeCharacter({ hp: 80, max_hp: 100, inventory, inventory_max_items: 100 });
    // totalQuantity=10 < 95, usedSlots=1 < 20 → no override
    const override = Agent.checkSurvivalOverride(char);
    expect(override).toBeNull();
  });

  test("getActivityType returns combat for fight goals", () => {
    expect(Agent.getActivityType({ type: "fight", monster: "chicken" }, undefined)).toBe("combat");
  });

  test("getActivityType returns gathering skill for gather goals", () => {
    const resource = { name: "Copper Rocks", code: "copper_rocks", skill: "mining" as const, level: 1, drops: [] };
    expect(Agent.getActivityType({ type: "gather", resource: "copper_rocks" }, resource)).toBe("gathering:mining");
  });

  test("getActivityType returns null for non-equipment goals", () => {
    expect(Agent.getActivityType({ type: "rest" }, undefined)).toBeNull();
    expect(Agent.getActivityType({ type: "deposit_all" }, undefined)).toBeNull();
    expect(Agent.getActivityType({ type: "idle", reason: "test" }, undefined)).toBeNull();
  });

  test("checkTaskOverride returns task_complete when task is done", () => {
    const char = makeCharacter({
      task: "chicken",
      task_type: "monsters",
      task_progress: 100,
      task_total: 100,
    });
    const override = Agent.checkTaskOverride(char);
    expect(override).toEqual({ type: "task_complete" });
  });

  test("checkTaskOverride returns task_new when no task assigned", () => {
    const char = makeCharacter({ task: "", task_type: "" });
    const override = Agent.checkTaskOverride(char);
    expect(override).toEqual({ type: "task_new" });
  });

  test("checkTaskOverride returns null when monster task is in progress", () => {
    const char = makeCharacter({
      task: "chicken",
      task_type: "monsters",
      task_progress: 50,
      task_total: 100,
    });
    const override = Agent.checkTaskOverride(char);
    expect(override).toBeNull();
  });

  test("checkTaskOverride returns task_trade when item task and enough to complete", () => {
    const char = makeCharacter({
      task: "ash_plank",
      task_type: "items",
      task_progress: 27,
      task_total: 30,
      inventory: [{ slot: 0, code: "ash_plank", quantity: 3 }],
    });
    const override = Agent.checkTaskOverride(char);
    expect(override).toEqual({ type: "task_trade" });
  });

  test("checkTaskOverride returns task_trade when item task and inventory nearly full", () => {
    const char = makeCharacter({
      task: "ash_plank",
      task_type: "items",
      task_progress: 5,
      task_total: 30,
      inventory_max_items: 100,
      inventory: [
        { slot: 0, code: "ash_plank", quantity: 5 },
        { slot: 1, code: "other_stuff", quantity: 91 },
      ],
    });
    // totalQuantity=96 >= 100-5=95 → inventory nearly full
    const override = Agent.checkTaskOverride(char);
    expect(override).toEqual({ type: "task_trade" });
  });

  test("checkTaskOverride does not trade small batch when inventory has space", () => {
    const char = makeCharacter({
      task: "ash_plank",
      task_type: "items",
      task_progress: 5,
      task_total: 30,
      inventory_max_items: 100,
      inventory: [{ slot: 0, code: "ash_plank", quantity: 3 }],
    });
    // Only 3 items, 25 remaining, inventory has tons of space → don't trade yet
    const override = Agent.checkTaskOverride(char);
    expect(override).toBeNull();
  });

  test("checkTaskOverride returns null for item task with no task items in inventory", () => {
    const char = makeCharacter({
      task: "ash_plank",
      task_type: "items",
      task_progress: 5,
      task_total: 30,
      inventory: [{ slot: 0, code: "ash_wood", quantity: 10 }],
    });
    const override = Agent.checkTaskOverride(char);
    expect(override).toBeNull();
  });

  // === getErrorRecovery tests ===

  test("getErrorRecovery returns deposit_all for 497 (inventory full)", () => {
    const char = makeCharacter();
    const goal = { type: "gather" as const, resource: "copper_rocks" };
    const result = Agent.getErrorRecovery(497, char, goal);
    expect(result).toEqual({ recovery: { type: "deposit_all" } });
  });

  test("getErrorRecovery returns task_complete for 475", () => {
    const char = makeCharacter();
    const goal = { type: "task_trade" as const };
    const result = Agent.getErrorRecovery(475, char, goal);
    expect(result).toEqual({ recovery: { type: "task_complete" } });
  });

  test("getErrorRecovery returns skip for 478, 493, 473", () => {
    const char = makeCharacter();
    const goal = { type: "craft" as const, item: "copper_bar", quantity: 1 };
    expect(Agent.getErrorRecovery(478, char, goal)).toBe("skip");
    expect(Agent.getErrorRecovery(493, char, goal)).toBe("skip");
    expect(Agent.getErrorRecovery(473, char, goal)).toBe("skip");
  });

  test("getErrorRecovery returns skip for 490 (already equipped)", () => {
    const char = makeCharacter();
    const goal = { type: "equip" as const, code: "copper_sword", slot: "weapon" as const };
    expect(Agent.getErrorRecovery(490, char, goal)).toBe("skip");
  });

  test("getErrorRecovery returns null for unknown error codes", () => {
    const char = makeCharacter();
    const goal = { type: "gather" as const, resource: "copper_rocks" };
    expect(Agent.getErrorRecovery(999, char, goal)).toBeNull();
    expect(Agent.getErrorRecovery(500, char, goal)).toBeNull();
  });

  test("checkTaskOverride prefers task_complete over task_trade when done", () => {
    const char = makeCharacter({
      task: "ash_plank",
      task_type: "items",
      task_progress: 30,
      task_total: 30,
      inventory: [{ slot: 0, code: "ash_plank", quantity: 2 }],
    });
    const override = Agent.checkTaskOverride(char);
    expect(override).toEqual({ type: "task_complete" });
  });

  test("checkTaskOverride returns task_cancel for unachievable task when has tasks_coin", () => {
    const gd = new GameData();
    gd.load(
      [
        { map_id: 1, name: "Dragon Lair", skin: "cave", x: 5, y: 5, layer: "overworld" as const, access: { type: "standard" as const }, interactions: { content: { type: "monster" as const, code: "dragon" } } },
      ] as GameMap[],
      [],
      [{ name: "Dragon", code: "dragon", level: 30, type: "normal", hp: 500, attack_fire: 50, attack_earth: 0, attack_water: 0, attack_air: 0, res_fire: 0, res_earth: 0, res_water: 0, res_air: 0, critical_strike: 0, initiative: 0, min_gold: 10, max_gold: 50, drops: [] }] as Monster[]
    );

    const char = makeCharacter({
      task: "dragon",
      task_type: "monsters",
      task_progress: 0,
      task_total: 10,
      level: 5,
      inventory: [{ slot: 0, code: "tasks_coin", quantity: 3 }],
    });
    const override = Agent.checkTaskOverride(char, gd, []);
    expect(override).toEqual({ type: "task_cancel" });
  });

  test("checkTaskOverride returns null for unachievable task without tasks_coin", () => {
    const gd = new GameData();
    gd.load(
      [
        { map_id: 1, name: "Dragon Lair", skin: "cave", x: 5, y: 5, layer: "overworld" as const, access: { type: "standard" as const }, interactions: { content: { type: "monster" as const, code: "dragon" } } },
      ] as GameMap[],
      [],
      [{ name: "Dragon", code: "dragon", level: 30, type: "normal", hp: 500, attack_fire: 50, attack_earth: 0, attack_water: 0, attack_air: 0, res_fire: 0, res_earth: 0, res_water: 0, res_air: 0, critical_strike: 0, initiative: 0, min_gold: 10, max_gold: 50, drops: [] }] as Monster[]
    );

    const char = makeCharacter({
      task: "dragon",
      task_type: "monsters",
      task_progress: 0,
      task_total: 10,
      level: 5,
      inventory: [], // no tasks_coin
    });
    const override = Agent.checkTaskOverride(char, gd, []);
    expect(override).toBeNull();
  });

  // === Party fight tests ===

  test("getActivityType returns combat for party fight goals", () => {
    expect(Agent.getActivityType({ type: "fight", monster: "boss_chicken", party: ["alice", "bob", "charlie"] }, undefined)).toBe("combat");
  });

  test("party fight goal is identified correctly", () => {
    const goal = { type: "fight" as const, monster: "boss_chicken", party: ["alice", "bob", "charlie"] };
    expect(goal.party).toBeDefined();
    expect(goal.party!.length).toBe(3);
  });

  test("solo fight goal has no party field", () => {
    const goal: Goal = { type: "fight", monster: "chicken" };
    if (goal.type === "fight") {
      expect(goal.party).toBeUndefined();
    }
  });

  test("party initiator is alphabetically first", () => {
    const party = ["charlie", "alice", "bob"];
    const sorted = [...party].sort();
    expect(sorted[0]).toBe("alice");
  });

  // === Coordinator integration ===

  test("selectStrategyGoal uses coordinator when provided", () => {
    const board = new Board();
    const gameData = new GameData();
    gameData.load([], [], []);

    const strategy = () => ({ type: "gather" as const, resource: "copper_rocks" });
    const coordinator = new Coordinator(board, gameData, () => ({
      type: "fight" as const,
      monster: "chicken",
    }));

    const char = makeCharacter();
    const snapshot: BoardSnapshot = { characters: {}, bank: { items: [], gold: 0, lastUpdated: 0 }, geOrders: [] };

    const goal = Agent.selectStrategyGoal(
      "test-agent", char, snapshot, gameData, strategy, coordinator
    );
    expect(goal).toEqual({ type: "fight", monster: "chicken" });
  });

  test("selectStrategyGoal falls back to strategy when no coordinator", () => {
    const gameData = new GameData();
    gameData.load([], [], []);

    const strategy = () => ({ type: "gather" as const, resource: "copper_rocks" });

    const char = makeCharacter();
    const snapshot: BoardSnapshot = { characters: {}, bank: { items: [], gold: 0, lastUpdated: 0 }, geOrders: [] };

    const goal = Agent.selectStrategyGoal(
      "test-agent", char, snapshot, gameData, strategy, null
    );
    expect(goal).toEqual({ type: "gather", resource: "copper_rocks" });
  });
});
