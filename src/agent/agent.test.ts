import { describe, test, expect, afterEach } from "bun:test";
import { Agent } from "./agent";
import type { Character } from "../types";
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

  test("overrides strategy with deposit when inventory is full", () => {
    const inventory = Array.from({ length: 20 }, (_, i) => ({
      slot: i,
      code: "copper_ore",
      quantity: 1,
    }));
    const char = makeCharacter({ inventory, inventory_max_items: 20 });
    const needsDeposit = Agent.checkSurvivalOverride(char);
    expect(needsDeposit).toEqual({ type: "deposit_all" });
  });

  test("no override when character is healthy with space", () => {
    const char = makeCharacter({ hp: 80, max_hp: 100, inventory: [] });
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
});
