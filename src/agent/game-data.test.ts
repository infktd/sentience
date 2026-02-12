import { describe, test, expect } from "bun:test";
import { GameData } from "./game-data";
import type { GameMap, Resource, Monster, Item, SimpleItem, NpcItem } from "../types";

describe("GameData", () => {
  test("findMapsWithResource returns maps containing a resource", () => {
    const gameData = new GameData();
    gameData.load(
      [
        {
          map_id: 1, name: "Copper Mine", skin: "mine", x: 2, y: 0,
          layer: "overworld" as const,
          access: { type: "standard" as const },
          interactions: { content: { type: "resource" as const, code: "copper_rocks" } },
        },
        {
          map_id: 2, name: "Town", skin: "town", x: 0, y: 0,
          layer: "overworld" as const,
          access: { type: "standard" as const },
          interactions: { content: { type: "bank" as const, code: "bank" } },
        },
      ] as GameMap[],
      [
        { name: "Copper Rocks", code: "copper_rocks", skill: "mining", level: 1, drops: [] },
      ] as Resource[],
      [
        { name: "Chicken", code: "chicken", level: 1, type: "normal", hp: 60, attack_fire: 4, attack_earth: 0, attack_water: 0, attack_air: 0, res_fire: 0, res_earth: 0, res_water: 0, res_air: 0, critical_strike: 0, initiative: 0, min_gold: 0, max_gold: 2, drops: [] },
      ] as Monster[]
    );

    const maps = gameData.findMapsWithResource("copper_rocks");
    expect(maps).toHaveLength(1);
    expect(maps[0].x).toBe(2);
    expect(maps[0].y).toBe(0);
  });

  test("findMapsWithMonster returns maps containing a monster", () => {
    const gameData = new GameData();
    gameData.load(
      [
        {
          map_id: 3, name: "Forest", skin: "forest", x: 1, y: 1,
          layer: "overworld" as const,
          access: { type: "standard" as const },
          interactions: { content: { type: "monster" as const, code: "chicken" } },
        },
      ] as GameMap[],
      [],
      [{ name: "Chicken", code: "chicken", level: 1, type: "normal", hp: 60, attack_fire: 4, attack_earth: 0, attack_water: 0, attack_air: 0, res_fire: 0, res_earth: 0, res_water: 0, res_air: 0, critical_strike: 0, initiative: 0, min_gold: 0, max_gold: 2, drops: [] }] as Monster[]
    );

    const maps = gameData.findMapsWithMonster("chicken");
    expect(maps).toHaveLength(1);
  });

  test("findNearestBank returns closest bank to position", () => {
    const gameData = new GameData();
    gameData.load(
      [
        {
          map_id: 1, name: "Bank 1", skin: "bank", x: 4, y: 1,
          layer: "overworld" as const,
          access: { type: "standard" as const },
          interactions: { content: { type: "bank" as const, code: "bank" } },
        },
        {
          map_id: 2, name: "Bank 2", skin: "bank", x: 1, y: 0,
          layer: "overworld" as const,
          access: { type: "standard" as const },
          interactions: { content: { type: "bank" as const, code: "bank" } },
        },
      ] as GameMap[],
      [],
      []
    );

    const bank = gameData.findNearestBank(0, 0);
    expect(bank).toBeDefined();
    expect(bank!.x).toBe(1);
    expect(bank!.y).toBe(0);
  });

  test("getResourceByCode returns resource details", () => {
    const gameData = new GameData();
    gameData.load(
      [],
      [{ name: "Copper Rocks", code: "copper_rocks", skill: "mining", level: 1, drops: [] }] as Resource[],
      []
    );

    const resource = gameData.getResourceByCode("copper_rocks");
    expect(resource).toBeDefined();
    expect(resource!.skill).toBe("mining");
  });

  test("getItemByCode returns item details", () => {
    const gameData = new GameData();
    gameData.load([], [], [], [
      { name: "Copper Sword", code: "copper_sword", level: 1, type: "weapon", subtype: "sword", description: "", tradeable: true, effects: [{ code: "attack_fire", value: 10, description: "" }] },
    ] as Item[]);

    const item = gameData.getItemByCode("copper_sword");
    expect(item).toBeDefined();
    expect(item!.effects![0].value).toBe(10);
  });

  test("getEquippableItems filters to equipment types", () => {
    const gameData = new GameData();
    gameData.load([], [], [], [
      { name: "Copper Sword", code: "copper_sword", level: 1, type: "weapon", subtype: "sword", description: "", tradeable: true },
      { name: "Copper Ore", code: "copper_ore", level: 1, type: "resource", subtype: "ore", description: "", tradeable: true },
      { name: "Iron Helmet", code: "iron_helmet", level: 5, type: "helmet", subtype: "helmet", description: "", tradeable: true },
    ] as Item[]);

    const equippable = gameData.getEquippableItems();
    expect(equippable).toHaveLength(2);
    expect(equippable.map(i => i.code).sort()).toEqual(["copper_sword", "iron_helmet"]);
  });

  test("getCraftableItems returns items craftable with available bank materials", () => {
    const gameData = new GameData();
    gameData.load([], [], [], [
      { name: "Copper Bar", code: "copper_bar", level: 1, type: "resource", subtype: "bar", description: "", tradeable: true, craft: { skill: "mining", level: 1, items: [{ code: "copper_ore", quantity: 10 }], quantity: 1 } },
      { name: "Copper Dagger", code: "copper_dagger", level: 1, type: "weapon", subtype: "sword", description: "", tradeable: true, craft: { skill: "weaponcrafting", level: 1, items: [{ code: "copper_bar", quantity: 6 }], quantity: 1 } },
    ] as Item[]);

    const bankItems: SimpleItem[] = [{ code: "copper_ore", quantity: 15 }];
    const craftable = gameData.getCraftableItems("mining", 1, bankItems);
    expect(craftable).toHaveLength(1);
    expect(craftable[0].code).toBe("copper_bar");
  });

  test("getCraftableItems returns empty when bank lacks materials", () => {
    const gameData = new GameData();
    gameData.load([], [], [], [
      { name: "Copper Bar", code: "copper_bar", level: 1, type: "resource", subtype: "bar", description: "", tradeable: true, craft: { skill: "mining", level: 1, items: [{ code: "copper_ore", quantity: 10 }], quantity: 1 } },
    ] as Item[]);

    const bankItems: SimpleItem[] = [{ code: "copper_ore", quantity: 5 }];
    const craftable = gameData.getCraftableItems("mining", 1, bankItems);
    expect(craftable).toHaveLength(0);
  });

  test("getCraftableItems respects skill level cap", () => {
    const gameData = new GameData();
    gameData.load([], [], [], [
      { name: "Copper Dagger", code: "copper_dagger", level: 1, type: "weapon", subtype: "sword", description: "", tradeable: true, craft: { skill: "weaponcrafting", level: 1, items: [{ code: "copper_bar", quantity: 6 }], quantity: 1 } },
      { name: "Iron Sword", code: "iron_sword", level: 10, type: "weapon", subtype: "sword", description: "", tradeable: true, craft: { skill: "weaponcrafting", level: 10, items: [{ code: "iron_bar", quantity: 6 }], quantity: 1 } },
    ] as Item[]);

    const bankItems: SimpleItem[] = [
      { code: "copper_bar", quantity: 10 },
      { code: "iron_bar", quantity: 10 },
    ];
    // Level 5 can only craft the level 1 recipe
    const craftable = gameData.getCraftableItems("weaponcrafting", 5, bankItems);
    expect(craftable).toHaveLength(1);
    expect(craftable[0].code).toBe("copper_dagger");
  });

  test("getCraftableItems sorts by craft level descending", () => {
    const gameData = new GameData();
    gameData.load([], [], [], [
      { name: "Copper Dagger", code: "copper_dagger", level: 1, type: "weapon", subtype: "sword", description: "", tradeable: true, craft: { skill: "weaponcrafting", level: 1, items: [{ code: "copper_bar", quantity: 6 }], quantity: 1 } },
      { name: "Sticky Sword", code: "sticky_sword", level: 5, type: "weapon", subtype: "sword", description: "", tradeable: true, craft: { skill: "weaponcrafting", level: 5, items: [{ code: "copper_bar", quantity: 5 }], quantity: 1 } },
    ] as Item[]);

    const bankItems: SimpleItem[] = [{ code: "copper_bar", quantity: 20 }];
    const craftable = gameData.getCraftableItems("weaponcrafting", 10, bankItems);
    expect(craftable).toHaveLength(2);
    expect(craftable[0].code).toBe("sticky_sword"); // level 5 first
    expect(craftable[1].code).toBe("copper_dagger"); // level 1 second
  });

  test("getCraftableItems handles multi-material recipes", () => {
    const gameData = new GameData();
    gameData.load([], [], [], [
      { name: "Fire Staff", code: "fire_staff", level: 5, type: "weapon", subtype: "staff", description: "", tradeable: true, craft: { skill: "weaponcrafting", level: 5, items: [{ code: "red_slimeball", quantity: 2 }, { code: "ash_plank", quantity: 5 }], quantity: 1 } },
    ] as Item[]);

    // Missing one material
    const bankMissing: SimpleItem[] = [{ code: "red_slimeball", quantity: 3 }];
    expect(gameData.getCraftableItems("weaponcrafting", 5, bankMissing)).toHaveLength(0);

    // Both materials present
    const bankFull: SimpleItem[] = [
      { code: "red_slimeball", quantity: 3 },
      { code: "ash_plank", quantity: 5 },
    ];
    expect(gameData.getCraftableItems("weaponcrafting", 5, bankFull)).toHaveLength(1);
  });

  test("getNpcItemForProduct returns NPC listing for a buyable product", () => {
    const gameData = new GameData();
    const npcItems: NpcItem[] = [
      { code: "cloth", npc: "tailor", currency: "wool", buy_price: 3, sell_price: null },
      { code: "hard_leather", npc: "tailor", currency: "cowhide", buy_price: 3, sell_price: null },
    ];
    gameData.loadNpcItems(npcItems);

    const result = gameData.getNpcItemForProduct("cloth");
    expect(result).toBeDefined();
    expect(result!.npc).toBe("tailor");
    expect(result!.currency).toBe("wool");
    expect(result!.buy_price).toBe(3);
  });

  test("getNpcItemForProduct returns undefined for unknown product", () => {
    const gameData = new GameData();
    gameData.loadNpcItems([]);
    expect(gameData.getNpcItemForProduct("nonexistent")).toBeUndefined();
  });

  test("getItemsForSkill returns all recipes for a skill up to level", () => {
    const gameData = new GameData();
    gameData.load([], [], [], [
      { name: "Copper Dagger", code: "copper_dagger", level: 1, type: "weapon", subtype: "sword", description: "", tradeable: true, craft: { skill: "weaponcrafting", level: 1, items: [{ code: "copper_bar", quantity: 6 }], quantity: 1 } },
      { name: "Iron Sword", code: "iron_sword", level: 10, type: "weapon", subtype: "sword", description: "", tradeable: true, craft: { skill: "weaponcrafting", level: 10, items: [{ code: "iron_bar", quantity: 6 }], quantity: 1 } },
      { name: "Copper Helmet", code: "copper_helmet", level: 1, type: "helmet", subtype: "helmet", description: "", tradeable: true, craft: { skill: "gearcrafting", level: 1, items: [{ code: "copper_bar", quantity: 6 }], quantity: 1 } },
    ] as Item[]);

    const recipes = gameData.getItemsForSkill("weaponcrafting", 5);
    expect(recipes).toHaveLength(1);
    expect(recipes[0].code).toBe("copper_dagger");
  });
});
