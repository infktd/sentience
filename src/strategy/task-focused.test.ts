import { describe, test, expect } from "bun:test";
import { taskFocused } from "./task-focused";
import { GameData } from "../agent/game-data";
import type { Character, GameMap, Resource, Monster, Item } from "../types";
import type { BoardSnapshot } from "../board/board";

function makeChar(overrides: Partial<Character> = {}): Character {
  return {
    name: "alice", account: "test", skin: "men1", level: 5,
    xp: 0, max_xp: 100, gold: 0, speed: 0,
    mining_level: 5, mining_xp: 0, mining_max_xp: 100,
    woodcutting_level: 5, woodcutting_xp: 0, woodcutting_max_xp: 100,
    fishing_level: 5, fishing_xp: 0, fishing_max_xp: 100,
    weaponcrafting_level: 5, weaponcrafting_xp: 0, weaponcrafting_max_xp: 100,
    gearcrafting_level: 5, gearcrafting_xp: 0, gearcrafting_max_xp: 100,
    jewelrycrafting_level: 5, jewelrycrafting_xp: 0, jewelrycrafting_max_xp: 100,
    cooking_level: 5, cooking_xp: 0, cooking_max_xp: 100,
    alchemy_level: 5, alchemy_xp: 0, alchemy_max_xp: 100,
    hp: 160, max_hp: 160, haste: 0, critical_strike: 0, wisdom: 0,
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
    inventory_max_items: 100, inventory: [],
    ...overrides,
  };
}

function makeGameData(): GameData {
  const gd = new GameData();
  gd.load(
    [
      { map_id: 1, name: "Copper Mine", skin: "mine", x: 2, y: 0, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "resource", code: "copper_rocks" } } },
      { map_id: 2, name: "Forest", skin: "forest", x: 0, y: 2, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "resource", code: "ash_tree" } } },
      { map_id: 3, name: "Pond", skin: "pond", x: 3, y: 0, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "resource", code: "gudgeon_fishing_spot" } } },
      { map_id: 4, name: "Chicken Coop", skin: "coop", x: 0, y: 1, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "monster", code: "chicken" } } },
      { map_id: 5, name: "Bank", skin: "bank", x: 4, y: 1, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "bank", code: "bank" } } },
      { map_id: 6, name: "Workshop", skin: "workshop", x: 2, y: 1, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "workshop", code: "cooking" } } },
      { map_id: 7, name: "Wolf Den", skin: "den", x: 5, y: 5, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "monster", code: "wolf" } } },
    ] as GameMap[],
    [
      { name: "Copper Rocks", code: "copper_rocks", skill: "mining", level: 1, drops: [{ code: "copper_ore", rate: 100, min_quantity: 1, max_quantity: 1 }] },
      { name: "Ash Tree", code: "ash_tree", skill: "woodcutting", level: 1, drops: [{ code: "ash_wood", rate: 100, min_quantity: 1, max_quantity: 1 }] },
      { name: "Gudgeon Spot", code: "gudgeon_fishing_spot", skill: "fishing", level: 1, drops: [{ code: "gudgeon", rate: 100, min_quantity: 1, max_quantity: 1 }] },
    ] as Resource[],
    [
      { name: "Chicken", code: "chicken", level: 1, type: "normal", hp: 60, attack_fire: 4, attack_earth: 0, attack_water: 0, attack_air: 0, res_fire: 0, res_earth: 0, res_water: 0, res_air: 0, critical_strike: 0, initiative: 0, min_gold: 0, max_gold: 2, drops: [{ code: "raw_chicken", rate: 50, min_quantity: 1, max_quantity: 1 }] },
      { name: "Wolf", code: "wolf", level: 5, type: "normal", hp: 120, attack_fire: 0, attack_earth: 8, attack_water: 0, attack_air: 0, res_fire: 0, res_earth: 0, res_water: 0, res_air: 0, critical_strike: 0, initiative: 0, min_gold: 1, max_gold: 5, drops: [{ code: "wolf_bone", rate: 30, min_quantity: 1, max_quantity: 1 }] },
    ] as Monster[],
    [
      { name: "Cooked Gudgeon", code: "cooked_gudgeon", level: 1, type: "consumable", subtype: "food", description: "", tradeable: true, craft: { skill: "cooking", level: 1, items: [{ code: "gudgeon", quantity: 1 }], quantity: 1 } },
      { name: "Copper Bar", code: "copper_bar", level: 1, type: "resource", subtype: "bar", description: "", tradeable: true, craft: { skill: "mining", level: 1, items: [{ code: "copper_ore", quantity: 10 }], quantity: 1 } },
    ] as Item[],
  );
  return gd;
}

const emptyBoard: BoardSnapshot = {
  characters: {},
  bank: { items: [], gold: 0, lastUpdated: 0 },
  geOrders: [],
};

describe("taskFocused", () => {
  test("falls back to maxAllSkills when no task active", () => {
    const char = makeChar({ task: "", task_type: "" });
    const gd = makeGameData();
    const goal = taskFocused(char, emptyBoard, gd);
    // Should produce a normal maxAllSkills goal (not task-related)
    expect(["gather", "fight", "craft", "idle"]).toContain(goal.type);
  });

  test("fights monster for monster task", () => {
    const char = makeChar({
      task: "chicken",
      task_type: "monsters",
      task_progress: 50,
      task_total: 100,
    });
    const gd = makeGameData();
    const goal = taskFocused(char, emptyBoard, gd);
    expect(goal.type).toBe("fight");
    if (goal.type === "fight") {
      expect(goal.monster).toBe("chicken");
    }
  });

  test("gathers resource for item task (raw drop)", () => {
    const char = makeChar({
      task: "copper_ore",
      task_type: "items",
      task_progress: 10,
      task_total: 100,
    });
    const gd = makeGameData();
    const goal = taskFocused(char, emptyBoard, gd);
    expect(goal.type).toBe("gather");
    if (goal.type === "gather") {
      expect(goal.resource).toBe("copper_rocks");
    }
  });

  test("crafts item for item task when bank has materials", () => {
    const char = makeChar({
      task: "cooked_gudgeon",
      task_type: "items",
      task_progress: 5,
      task_total: 50,
    });
    const board: BoardSnapshot = {
      characters: {},
      bank: { items: [{ code: "gudgeon", quantity: 10 }], gold: 0, lastUpdated: Date.now() },
      geOrders: [],
    };
    const gd = makeGameData();
    const goal = taskFocused(char, board, gd);
    expect(goal.type).toBe("craft");
    if (goal.type === "craft") {
      expect(goal.item).toBe("cooked_gudgeon");
    }
  });

  test("gathers materials for craftable item task when bank lacks materials", () => {
    const char = makeChar({
      task: "cooked_gudgeon",
      task_type: "items",
      task_progress: 5,
      task_total: 50,
    });
    const gd = makeGameData();
    // Empty bank — no gudgeon for cooking
    const goal = taskFocused(char, emptyBoard, gd);
    expect(goal.type).toBe("gather");
    if (goal.type === "gather") {
      expect(goal.resource).toBe("gudgeon_fishing_spot");
    }
  });

  test("fights monster for item task when item is monster drop", () => {
    const char = makeChar({
      task: "raw_chicken",
      task_type: "items",
      task_progress: 0,
      task_total: 20,
    });
    const gd = makeGameData();
    const goal = taskFocused(char, emptyBoard, gd);
    expect(goal.type).toBe("fight");
    if (goal.type === "fight") {
      expect(goal.monster).toBe("chicken");
    }
  });

  test("resolves depth-2 chain: gathers ore when task needs crafted bar", () => {
    // Task: produce copper_bar. Bank has no copper_ore.
    // Chain: copper_bar → needs copper_ore → gather copper_rocks
    const char = makeChar({
      task: "copper_bar",
      task_type: "items",
      task_progress: 0,
      task_total: 5,
    });
    const gd = makeGameData();
    const goal = taskFocused(char, emptyBoard, gd);
    expect(goal.type).toBe("gather");
    if (goal.type === "gather") {
      expect(goal.resource).toBe("copper_rocks");
    }
  });

  test("resolves depth-2 chain: crafts bar when task needs bar and bank has ore", () => {
    // Task: produce copper_bar. Bank has enough copper_ore.
    // Chain: copper_bar → has copper_ore → craft copper_bar
    const char = makeChar({
      task: "copper_bar",
      task_type: "items",
      task_progress: 0,
      task_total: 5,
    });
    const board: BoardSnapshot = {
      characters: {},
      bank: { items: [{ code: "copper_ore", quantity: 50 }], gold: 0, lastUpdated: Date.now() },
      geOrders: [],
    };
    const gd = makeGameData();
    const goal = taskFocused(char, board, gd);
    expect(goal.type).toBe("craft");
    if (goal.type === "craft") {
      expect(goal.item).toBe("copper_bar");
    }
  });

  test("resolves monster drop for intermediate material in chain", () => {
    // Set up: task item needs wolf_bone (mob drop) + copper_bar (craftable)
    const gd = new GameData();
    gd.load(
      [
        { map_id: 1, name: "Copper Mine", skin: "mine", x: 2, y: 0, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "resource", code: "copper_rocks" } } },
        { map_id: 7, name: "Wolf Den", skin: "den", x: 5, y: 5, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "monster", code: "wolf" } } },
        { map_id: 5, name: "Bank", skin: "bank", x: 4, y: 1, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "bank", code: "bank" } } },
      ] as GameMap[],
      [{ name: "Copper Rocks", code: "copper_rocks", skill: "mining", level: 1, drops: [{ code: "copper_ore", rate: 100, min_quantity: 1, max_quantity: 1 }] }] as Resource[],
      [{ name: "Wolf", code: "wolf", level: 5, type: "normal", hp: 120, attack_fire: 0, attack_earth: 8, attack_water: 0, attack_air: 0, res_fire: 0, res_earth: 0, res_water: 0, res_air: 0, critical_strike: 0, initiative: 0, min_gold: 1, max_gold: 5, drops: [{ code: "wolf_bone", rate: 30, min_quantity: 1, max_quantity: 1 }] }] as Monster[],
      [
        { name: "Copper Bar", code: "copper_bar", level: 1, type: "resource", subtype: "bar", description: "", tradeable: true, craft: { skill: "mining", level: 1, items: [{ code: "copper_ore", quantity: 10 }], quantity: 1 } },
        { name: "Bone Weapon", code: "bone_weapon", level: 5, type: "weapon", subtype: "sword", description: "", tradeable: true, craft: { skill: "weaponcrafting", level: 5, items: [{ code: "copper_bar", quantity: 3 }, { code: "wolf_bone", quantity: 5 }], quantity: 1 } },
      ] as Item[]
    );

    const char = makeChar({
      task: "bone_weapon",
      task_type: "items",
      task_progress: 0,
      task_total: 1,
    });

    // Has copper_bar but not wolf_bone → fight wolf
    const board: BoardSnapshot = {
      characters: {},
      bank: { items: [{ code: "copper_bar", quantity: 10 }], gold: 0, lastUpdated: Date.now() },
      geOrders: [],
    };
    const goal = taskFocused(char, board, gd);
    expect(goal.type).toBe("fight");
    if (goal.type === "fight") {
      expect(goal.monster).toBe("wolf");
    }
  });

  test("falls back to maxAllSkills when task is complete", () => {
    const char = makeChar({
      task: "chicken",
      task_type: "monsters",
      task_progress: 100,
      task_total: 100,
    });
    const gd = makeGameData();
    const goal = taskFocused(char, emptyBoard, gd);
    // Should fall back — agent's task override handles completion
    expect(goal.type).not.toBe("fight");
  });
});
