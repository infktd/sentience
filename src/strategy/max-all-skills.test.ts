import { describe, test, expect } from "bun:test";
import { maxAllSkills } from "./max-all-skills";
import { GameData } from "../agent/game-data";
import type { Character, GameMap, Resource, Monster, Item, NpcItem } from "../types";
import type { BoardSnapshot } from "../board/board";

function makeChar(overrides: Partial<Character> = {}): Character {
  return {
    name: "alice", account: "test", skin: "men1", level: 1,
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

function makeGameData(): GameData {
  const gd = new GameData();
  gd.load(
    [
      { map_id: 1, name: "Copper Mine", skin: "mine", x: 2, y: 0, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "resource", code: "copper_rocks" } } },
      { map_id: 2, name: "Forest", skin: "forest", x: 0, y: 2, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "resource", code: "ash_tree" } } },
      { map_id: 3, name: "Pond", skin: "pond", x: 3, y: 0, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "resource", code: "gudgeon_fishing_spot" } } },
      { map_id: 4, name: "Chicken Coop", skin: "coop", x: 0, y: 1, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "monster", code: "chicken" } } },
      { map_id: 5, name: "Bank", skin: "bank", x: 4, y: 1, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "bank", code: "bank" } } },
      { map_id: 6, name: "Workshop", skin: "workshop", x: 2, y: 1, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "workshop", code: "workshop" } } },
      { map_id: 7, name: "Tailor", skin: "tailor", x: 3, y: 3, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "npc", code: "tailor" } } },
    ] as GameMap[],
    [
      { name: "Copper Rocks", code: "copper_rocks", skill: "mining", level: 1, drops: [] },
      { name: "Ash Tree", code: "ash_tree", skill: "woodcutting", level: 1, drops: [] },
      { name: "Gudgeon Spot", code: "gudgeon_fishing_spot", skill: "fishing", level: 1, drops: [] },
    ] as Resource[],
    [
      { name: "Chicken", code: "chicken", level: 1, type: "normal", hp: 60, attack_fire: 4, attack_earth: 0, attack_water: 0, attack_air: 0, res_fire: 0, res_earth: 0, res_water: 0, res_air: 0, critical_strike: 0, initiative: 0, min_gold: 0, max_gold: 2, drops: [] },
    ] as Monster[],
    [
      { name: "Copper Bar", code: "copper_bar", level: 1, type: "resource", subtype: "bar", description: "", tradeable: true, craft: { skill: "mining", level: 1, items: [{ code: "copper_ore", quantity: 10 }], quantity: 1 } },
      { name: "Ash Plank", code: "ash_plank", level: 1, type: "resource", subtype: "plank", description: "", tradeable: true, craft: { skill: "woodcutting", level: 1, items: [{ code: "ash_wood", quantity: 10 }], quantity: 1 } },
      { name: "Copper Dagger", code: "copper_dagger", level: 1, type: "weapon", subtype: "sword", description: "", tradeable: true, craft: { skill: "weaponcrafting", level: 1, items: [{ code: "copper_bar", quantity: 6 }], quantity: 1 } },
      { name: "Copper Helmet", code: "copper_helmet", level: 1, type: "helmet", subtype: "helmet", description: "", tradeable: true, craft: { skill: "gearcrafting", level: 1, items: [{ code: "copper_bar", quantity: 6 }], quantity: 1 } },
      { name: "Copper Ring", code: "copper_ring", level: 1, type: "ring", subtype: "ring", description: "", tradeable: true, craft: { skill: "jewelrycrafting", level: 1, items: [{ code: "copper_bar", quantity: 6 }], quantity: 1 } },
      { name: "Cooked Gudgeon", code: "cooked_gudgeon", level: 1, type: "consumable", subtype: "food", description: "", tradeable: true, craft: { skill: "cooking", level: 1, items: [{ code: "gudgeon", quantity: 1 }], quantity: 1 } },
      { name: "Life Ring", code: "life_ring", level: 15, type: "ring", subtype: "ring", description: "", tradeable: true, craft: { skill: "jewelrycrafting", level: 15, items: [{ code: "iron_bar", quantity: 8 }, { code: "cloth", quantity: 2 }, { code: "mushroom", quantity: 5 }], quantity: 1 } },
    ] as Item[],
  );
  gd.loadNpcItems([
    { code: "cloth", npc: "tailor", currency: "wool", buy_price: 3, sell_price: null },
    { code: "hard_leather", npc: "tailor", currency: "cowhide", buy_price: 3, sell_price: null },
  ] as NpcItem[]);
  return gd;
}

const emptyBoard: BoardSnapshot = {
  characters: {},
  bank: { items: [], gold: 0, lastUpdated: 0 },
};

describe("maxAllSkills", () => {
  test("picks lowest skill when all are equal", () => {
    const char = makeChar();
    const gd = makeGameData();
    const goal = maxAllSkills(char, emptyBoard, gd);
    expect(["gather", "fight"]).toContain(goal.type);
  });

  test("picks the lowest skill when one is behind", () => {
    const char = makeChar({
      mining_level: 5,
      woodcutting_level: 5,
      fishing_level: 1,
      weaponcrafting_level: 5,
      gearcrafting_level: 5,
      jewelrycrafting_level: 5,
      cooking_level: 5,
      alchemy_level: 5,
      level: 5,
    });
    const gd = makeGameData();
    const goal = maxAllSkills(char, emptyBoard, gd);
    expect(goal.type).toBe("gather");
    if (goal.type === "gather") {
      expect(goal.resource).toBe("gudgeon_fishing_spot");
    }
  });

  test("avoids skill another character is working on", () => {
    const char = makeChar({
      mining_level: 5,
      woodcutting_level: 5,
      fishing_level: 1,
      level: 5,
      weaponcrafting_level: 5,
      gearcrafting_level: 5,
      jewelrycrafting_level: 5,
      cooking_level: 5,
      alchemy_level: 5,
    });
    const board: BoardSnapshot = {
      characters: {
        bob: {
          currentAction: "gathering",
          target: "fishing",
          position: { x: 0, y: 0 },
          skillLevels: { fishing: 1 },
          inventoryUsed: 0,
          inventoryMax: 20,
        },
      },
      bank: { items: [], gold: 0, lastUpdated: 0 },
    };
    const gd = makeGameData();
    const goal = maxAllSkills(char, board, gd);
    if (goal.type === "gather") {
      expect(goal.resource).not.toBe("gudgeon_fishing_spot");
    }
  });

  test("returns idle when no valid goal found", () => {
    const char = makeChar();
    const emptyGd = new GameData();
    emptyGd.load([], [], []);
    const goal = maxAllSkills(char, emptyBoard, emptyGd);
    expect(goal.type).toBe("idle");
  });

  test("crafts when crafting skill is lowest and bank has materials", () => {
    const char = makeChar({
      mining_level: 5,
      woodcutting_level: 5,
      fishing_level: 5,
      weaponcrafting_level: 1, // lowest
      gearcrafting_level: 5,
      jewelrycrafting_level: 5,
      cooking_level: 5,
      alchemy_level: 5,
      level: 5,
    });
    const board: BoardSnapshot = {
      characters: {},
      bank: { items: [{ code: "copper_bar", quantity: 10 }], gold: 0, lastUpdated: Date.now() },
    };
    const gd = makeGameData();
    const goal = maxAllSkills(char, board, gd);
    expect(goal.type).toBe("craft");
    if (goal.type === "craft") {
      expect(goal.item).toBe("copper_dagger");
      expect(goal.quantity).toBe(1);
    }
  });

  test("skips crafting skill when bank lacks materials", () => {
    const char = makeChar({
      mining_level: 5,
      woodcutting_level: 5,
      fishing_level: 5,
      weaponcrafting_level: 1, // lowest but no materials
      gearcrafting_level: 5,
      jewelrycrafting_level: 5,
      cooking_level: 5,
      alchemy_level: 5,
      level: 5,
    });
    const gd = makeGameData();
    // Empty bank — no materials for weaponcrafting
    const goal = maxAllSkills(char, emptyBoard, gd);
    // Should fall through to combat (next lowest after crafting skills all skip)
    expect(goal.type).not.toBe("craft");
  });

  test("refines raw materials when gathering skill has enough in bank", () => {
    const char = makeChar({
      mining_level: 1, // lowest — gathering skill
      woodcutting_level: 5,
      fishing_level: 5,
      weaponcrafting_level: 5,
      gearcrafting_level: 5,
      jewelrycrafting_level: 5,
      cooking_level: 5,
      alchemy_level: 5,
      level: 5,
    });
    const board: BoardSnapshot = {
      characters: {},
      bank: { items: [{ code: "copper_ore", quantity: 15 }], gold: 0, lastUpdated: Date.now() },
    };
    const gd = makeGameData();
    const goal = maxAllSkills(char, board, gd);
    expect(goal.type).toBe("craft");
    if (goal.type === "craft") {
      expect(goal.item).toBe("copper_bar");
      expect(goal.quantity).toBe(1);
    }
  });

  test("gathers when gathering skill is lowest but bank lacks raw materials", () => {
    const char = makeChar({
      mining_level: 1, // lowest — not enough ore to refine
      woodcutting_level: 5,
      fishing_level: 5,
      weaponcrafting_level: 5,
      gearcrafting_level: 5,
      jewelrycrafting_level: 5,
      cooking_level: 5,
      alchemy_level: 5,
      level: 5,
    });
    const board: BoardSnapshot = {
      characters: {},
      bank: { items: [{ code: "copper_ore", quantity: 3 }], gold: 0, lastUpdated: Date.now() },
    };
    const gd = makeGameData();
    const goal = maxAllSkills(char, board, gd);
    expect(goal.type).toBe("gather");
    if (goal.type === "gather") {
      expect(goal.resource).toBe("copper_rocks");
    }
  });

  test("gathers needed material for crafting recipe instead of highest-level resource", () => {
    // Set up: mining is lowest, bank has no copper_ore, weaponcrafting needs copper_bar (which needs copper_ore)
    const gd = new GameData();
    gd.load(
      [
        { map_id: 1, name: "Copper Mine", skin: "mine", x: 2, y: 0, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "resource", code: "copper_rocks" } } },
        { map_id: 8, name: "Iron Mine", skin: "mine", x: 5, y: 0, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "resource", code: "iron_rocks" } } },
        { map_id: 5, name: "Bank", skin: "bank", x: 4, y: 1, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "bank", code: "bank" } } },
        { map_id: 4, name: "Chicken Coop", skin: "coop", x: 0, y: 1, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "monster", code: "chicken" } } },
      ] as GameMap[],
      [
        { name: "Copper Rocks", code: "copper_rocks", skill: "mining", level: 1, drops: [{ code: "copper_ore", rate: 100, min_quantity: 1, max_quantity: 1 }] },
        { name: "Iron Rocks", code: "iron_rocks", skill: "mining", level: 10, drops: [{ code: "iron_ore", rate: 100, min_quantity: 1, max_quantity: 1 }] },
      ] as Resource[],
      [
        { name: "Chicken", code: "chicken", level: 1, type: "normal", hp: 60, attack_fire: 4, attack_earth: 0, attack_water: 0, attack_air: 0, res_fire: 0, res_earth: 0, res_water: 0, res_air: 0, critical_strike: 0, initiative: 0, min_gold: 0, max_gold: 2, drops: [] },
      ] as Monster[],
      [
        { name: "Copper Bar", code: "copper_bar", level: 1, type: "resource", subtype: "bar", description: "", tradeable: true, craft: { skill: "mining", level: 1, items: [{ code: "copper_ore", quantity: 10 }], quantity: 1 } },
        { name: "Iron Sword", code: "iron_sword", level: 10, type: "weapon", subtype: "sword", description: "", tradeable: true, craft: { skill: "weaponcrafting", level: 10, items: [{ code: "iron_ore", quantity: 6 }], quantity: 1 } },
      ] as Item[]
    );

    const char = makeChar({
      mining_level: 10,
      woodcutting_level: 20,
      fishing_level: 20,
      weaponcrafting_level: 20,
      gearcrafting_level: 20,
      jewelrycrafting_level: 20,
      cooking_level: 20,
      alchemy_level: 20,
      level: 20,
    });
    // Bank has neither enough copper_ore to refine NOR iron_ore → needs both
    // iron_sword (level 10 recipe) needs iron_ore → should prefer iron_rocks
    const board: BoardSnapshot = {
      characters: {},
      bank: { items: [{ code: "copper_ore", quantity: 5 }], gold: 0, lastUpdated: Date.now() },
    };
    const goal = maxAllSkills(char, board, gd);
    expect(goal.type).toBe("gather");
    if (goal.type === "gather") {
      expect(goal.resource).toBe("iron_rocks");
    }
  });

  test("buys from NPC when crafting recipe needs NPC material and bank has currency", () => {
    const char = makeChar({
      mining_level: 20,
      woodcutting_level: 20,
      fishing_level: 20,
      weaponcrafting_level: 20,
      gearcrafting_level: 20,
      jewelrycrafting_level: 15, // lowest crafting — life_ring needs cloth
      cooking_level: 20,
      alchemy_level: 20,
      level: 20,
    });
    const board: BoardSnapshot = {
      characters: {},
      bank: {
        items: [
          { code: "iron_bar", quantity: 10 },
          { code: "mushroom", quantity: 10 },
          // Has wool (tailor currency) but not cloth (tailor product)
          { code: "wool", quantity: 10 },
        ],
        gold: 0,
        lastUpdated: Date.now(),
      },
    };
    const gd = makeGameData();
    const goal = maxAllSkills(char, board, gd);
    expect(goal.type).toBe("buy_npc");
    if (goal.type === "buy_npc") {
      expect(goal.npc).toBe("tailor");
      expect(goal.item).toBe("cloth");
      expect(goal.quantity).toBe(1);
    }
  });

  test("skips NPC buy when bank lacks currency for the NPC", () => {
    const char = makeChar({
      mining_level: 20,
      woodcutting_level: 20,
      fishing_level: 20,
      weaponcrafting_level: 20,
      gearcrafting_level: 20,
      jewelrycrafting_level: 15,
      cooking_level: 20,
      alchemy_level: 20,
      level: 20,
    });
    const board: BoardSnapshot = {
      characters: {},
      bank: {
        items: [
          { code: "iron_bar", quantity: 10 },
          { code: "mushroom", quantity: 10 },
          // No wool — can't buy cloth from tailor
        ],
        gold: 0,
        lastUpdated: Date.now(),
      },
    };
    const gd = makeGameData();
    const goal = maxAllSkills(char, board, gd);
    // Should NOT be buy_npc since we can't afford it
    expect(goal.type).not.toBe("buy_npc");
  });
});
