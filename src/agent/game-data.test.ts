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

  test("getMaxCraftQuantity returns max based on bank materials", () => {
    const gameData = new GameData();
    gameData.load([], [], [], [
      { name: "Copper Bar", code: "copper_bar", level: 1, type: "resource", subtype: "bar", description: "", tradeable: true, craft: { skill: "mining", level: 1, items: [{ code: "copper_ore", quantity: 10 }], quantity: 1 } },
    ] as Item[]);

    // 50 ore → can craft 5 bars (10 ore each)
    const bank: SimpleItem[] = [{ code: "copper_ore", quantity: 50 }];
    expect(gameData.getMaxCraftQuantity("copper_bar", bank, 200)).toBe(5);

    // Limited by inventory: can only carry 30 items
    expect(gameData.getMaxCraftQuantity("copper_bar", bank, 30)).toBe(3);

    // No materials → can't craft
    expect(gameData.getMaxCraftQuantity("copper_bar", [], 200)).toBe(0);
  });

  test("getMaxCraftQuantity handles multi-material recipes", () => {
    const gameData = new GameData();
    gameData.load([], [], [], [
      { name: "Life Ring", code: "life_ring", level: 15, type: "ring", subtype: "ring", description: "", tradeable: true, craft: { skill: "jewelrycrafting", level: 15, items: [{ code: "iron_bar", quantity: 8 }, { code: "cloth", quantity: 2 }], quantity: 1 } },
    ] as Item[]);

    // 16 iron_bar + 10 cloth → limited by iron_bar: 16/8=2
    const bank: SimpleItem[] = [
      { code: "iron_bar", quantity: 16 },
      { code: "cloth", quantity: 10 },
    ];
    expect(gameData.getMaxCraftQuantity("life_ring", bank, 200)).toBe(2);
  });

  test("findResourceForDrop returns resource that drops an item", () => {
    const gameData = new GameData();
    gameData.load(
      [],
      [
        { name: "Copper Rocks", code: "copper_rocks", skill: "mining", level: 1, drops: [{ code: "copper_ore", rate: 100, min_quantity: 1, max_quantity: 1 }] },
        { name: "Ash Tree", code: "ash_tree", skill: "woodcutting", level: 1, drops: [{ code: "ash_wood", rate: 100, min_quantity: 1, max_quantity: 1 }] },
      ] as Resource[],
      []
    );

    const resource = gameData.findResourceForDrop("copper_ore");
    expect(resource).toBeDefined();
    expect(resource!.code).toBe("copper_rocks");
    expect(gameData.findResourceForDrop("nonexistent")).toBeUndefined();
  });

  test("findMonsterForDrop returns monster that drops an item", () => {
    const gameData = new GameData();
    gameData.load(
      [],
      [],
      [
        { name: "Chicken", code: "chicken", level: 1, type: "normal", hp: 60, attack_fire: 4, attack_earth: 0, attack_water: 0, attack_air: 0, res_fire: 0, res_earth: 0, res_water: 0, res_air: 0, critical_strike: 0, initiative: 0, min_gold: 0, max_gold: 2, drops: [{ code: "raw_chicken", rate: 50, min_quantity: 1, max_quantity: 1 }] },
      ] as Monster[]
    );

    const monster = gameData.findMonsterForDrop("raw_chicken");
    expect(monster).toBeDefined();
    expect(monster!.code).toBe("chicken");
    expect(gameData.findMonsterForDrop("nonexistent")).toBeUndefined();
  });

  test("findTasksMaster returns correct tasks master map", () => {
    const gameData = new GameData();
    gameData.load(
      [
        { map_id: 1, name: "City", skin: "city", x: 1, y: 2, layer: "overworld" as const, access: { type: "standard" as const }, interactions: { content: { type: "tasks_master" as const, code: "monsters" } } },
        { map_id: 2, name: "Town", skin: "town", x: 4, y: 13, layer: "overworld" as const, access: { type: "standard" as const }, interactions: { content: { type: "tasks_master" as const, code: "items" } } },
      ] as GameMap[],
      [],
      []
    );

    const monstersMaster = gameData.findTasksMaster("monsters");
    expect(monstersMaster).toBeDefined();
    expect(monstersMaster!.x).toBe(1);
    expect(monstersMaster!.y).toBe(2);

    const itemsMaster = gameData.findTasksMaster("items");
    expect(itemsMaster).toBeDefined();
    expect(itemsMaster!.x).toBe(4);
    expect(itemsMaster!.y).toBe(13);

    expect(gameData.findTasksMaster("nonexistent")).toBeUndefined();
  });

  test("findNeededGatherResource returns resource for a missing craft material", () => {
    const gameData = new GameData();
    gameData.load(
      [],
      [
        { name: "Copper Rocks", code: "copper_rocks", skill: "mining", level: 1, drops: [{ code: "copper_ore", rate: 100, min_quantity: 1, max_quantity: 1 }] },
        { name: "Iron Rocks", code: "iron_rocks", skill: "mining", level: 10, drops: [{ code: "iron_ore", rate: 100, min_quantity: 1, max_quantity: 1 }] },
      ] as Resource[],
      [],
      [
        { name: "Copper Bar", code: "copper_bar", level: 1, type: "resource", subtype: "bar", description: "", tradeable: true, craft: { skill: "mining", level: 1, items: [{ code: "copper_ore", quantity: 10 }], quantity: 1 } },
        { name: "Iron Bar", code: "iron_bar", level: 10, type: "resource", subtype: "bar", description: "", tradeable: true, craft: { skill: "mining", level: 10, items: [{ code: "iron_ore", quantity: 10 }], quantity: 1 } },
      ] as Item[]
    );

    // Bank has enough copper but no iron → should suggest iron_rocks
    const bank: SimpleItem[] = [{ code: "copper_ore", quantity: 50 }];
    const result = gameData.findNeededGatherResource("mining", 10, bank);
    expect(result).toBeDefined();
    expect(result!.code).toBe("iron_rocks");
  });

  test("findNeededGatherResource prefers highest recipe level", () => {
    const gameData = new GameData();
    gameData.load(
      [],
      [
        { name: "Copper Rocks", code: "copper_rocks", skill: "mining", level: 1, drops: [{ code: "copper_ore", rate: 100, min_quantity: 1, max_quantity: 1 }] },
        { name: "Iron Rocks", code: "iron_rocks", skill: "mining", level: 10, drops: [{ code: "iron_ore", rate: 100, min_quantity: 1, max_quantity: 1 }] },
      ] as Resource[],
      [],
      [
        { name: "Copper Bar", code: "copper_bar", level: 1, type: "resource", subtype: "bar", description: "", tradeable: true, craft: { skill: "mining", level: 1, items: [{ code: "copper_ore", quantity: 10 }], quantity: 1 } },
        { name: "Iron Sword", code: "iron_sword", level: 10, type: "weapon", subtype: "sword", description: "", tradeable: true, craft: { skill: "weaponcrafting", level: 10, items: [{ code: "iron_ore", quantity: 6 }], quantity: 1 } },
      ] as Item[]
    );

    // Both materials missing → picks iron_ore because iron_sword is level 10 recipe
    const result = gameData.findNeededGatherResource("mining", 10, []);
    expect(result).toBeDefined();
    expect(result!.code).toBe("iron_rocks");
  });

  test("findNeededGatherResource returns null when bank has all materials", () => {
    const gameData = new GameData();
    gameData.load(
      [],
      [
        { name: "Copper Rocks", code: "copper_rocks", skill: "mining", level: 1, drops: [{ code: "copper_ore", rate: 100, min_quantity: 1, max_quantity: 1 }] },
      ] as Resource[],
      [],
      [
        { name: "Copper Bar", code: "copper_bar", level: 1, type: "resource", subtype: "bar", description: "", tradeable: true, craft: { skill: "mining", level: 1, items: [{ code: "copper_ore", quantity: 10 }], quantity: 1 } },
      ] as Item[]
    );

    const bank: SimpleItem[] = [{ code: "copper_ore", quantity: 100 }];
    const result = gameData.findNeededGatherResource("mining", 1, bank);
    expect(result).toBeNull();
  });

  test("findNeededGatherResource respects gathering level cap", () => {
    const gameData = new GameData();
    gameData.load(
      [],
      [
        { name: "Copper Rocks", code: "copper_rocks", skill: "mining", level: 1, drops: [{ code: "copper_ore", rate: 100, min_quantity: 1, max_quantity: 1 }] },
        { name: "Iron Rocks", code: "iron_rocks", skill: "mining", level: 10, drops: [{ code: "iron_ore", rate: 100, min_quantity: 1, max_quantity: 1 }] },
      ] as Resource[],
      [],
      [
        { name: "Iron Sword", code: "iron_sword", level: 10, type: "weapon", subtype: "sword", description: "", tradeable: true, craft: { skill: "weaponcrafting", level: 10, items: [{ code: "iron_ore", quantity: 6 }], quantity: 1 } },
      ] as Item[]
    );

    // Mining level 5 can't mine iron (level 10) → should return null
    const result = gameData.findNeededGatherResource("mining", 5, []);
    expect(result).toBeNull();
  });

  test("getBestUtilityItems returns best potions sorted by restore priority", () => {
    const gameData = new GameData();
    gameData.load([], [], [], [
      { name: "Small Health Potion", code: "small_health_potion", level: 5, type: "utility", subtype: "potion", description: "", tradeable: true, effects: [{ code: "restore", value: 30, description: "" }] },
      { name: "Earth Boost Potion", code: "earth_boost_potion", level: 10, type: "utility", subtype: "potion", description: "", tradeable: true, effects: [{ code: "boost_dmg_earth", value: 12, description: "" }] },
      { name: "Minor Health Potion", code: "minor_health_potion", level: 20, type: "utility", subtype: "potion", description: "", tradeable: true, effects: [{ code: "restore", value: 70, description: "" }] },
    ] as Item[]);

    // Level 25 character with all 3 in bank
    const bank: SimpleItem[] = [
      { code: "small_health_potion", quantity: 10 },
      { code: "earth_boost_potion", quantity: 5 },
      { code: "minor_health_potion", quantity: 8 },
    ];
    const result = gameData.getBestUtilityItems(25, bank);
    expect(result).toHaveLength(2);
    // Restore potions first, highest level restore first
    expect(result[0].code).toBe("minor_health_potion");
    // Then next best (earth boost or remaining restore)
    expect(result[1].code).toBe("small_health_potion");
  });

  test("getBestUtilityItems respects character level", () => {
    const gameData = new GameData();
    gameData.load([], [], [], [
      { name: "Small Health Potion", code: "small_health_potion", level: 5, type: "utility", subtype: "potion", description: "", tradeable: true, effects: [{ code: "restore", value: 30, description: "" }] },
      { name: "Minor Health Potion", code: "minor_health_potion", level: 20, type: "utility", subtype: "potion", description: "", tradeable: true, effects: [{ code: "restore", value: 70, description: "" }] },
    ] as Item[]);

    const bank: SimpleItem[] = [
      { code: "small_health_potion", quantity: 10 },
      { code: "minor_health_potion", quantity: 8 },
    ];
    // Level 10 can only use the small potion
    const result = gameData.getBestUtilityItems(10, bank);
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("small_health_potion");
  });

  test("getBestUtilityItems returns empty when bank has no potions", () => {
    const gameData = new GameData();
    gameData.load([], [], [], [
      { name: "Small Health Potion", code: "small_health_potion", level: 5, type: "utility", subtype: "potion", description: "", tradeable: true, effects: [{ code: "restore", value: 30, description: "" }] },
    ] as Item[]);

    const result = gameData.getBestUtilityItems(10, []);
    expect(result).toHaveLength(0);
  });

  test("getBestUtilityItems excludes non-utility items", () => {
    const gameData = new GameData();
    gameData.load([], [], [], [
      { name: "Cooked Gudgeon", code: "cooked_gudgeon", level: 1, type: "consumable", subtype: "food", description: "", tradeable: true, effects: [{ code: "heal", value: 75, description: "" }] },
      { name: "Small Health Potion", code: "small_health_potion", level: 5, type: "utility", subtype: "potion", description: "", tradeable: true, effects: [{ code: "restore", value: 30, description: "" }] },
    ] as Item[]);

    const bank: SimpleItem[] = [
      { code: "cooked_gudgeon", quantity: 20 },
      { code: "small_health_potion", quantity: 5 },
    ];
    const result = gameData.getBestUtilityItems(10, bank);
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("small_health_potion");
  });

  // === resolveItemChain tests ===

  test("resolveItemChain: direct gather for raw material", () => {
    const gameData = new GameData();
    gameData.load(
      [
        { map_id: 1, name: "Copper Mine", skin: "mine", x: 2, y: 0, layer: "overworld" as const, access: { type: "standard" as const }, interactions: { content: { type: "resource" as const, code: "copper_rocks" } } },
      ] as GameMap[],
      [{ name: "Copper Rocks", code: "copper_rocks", skill: "mining", level: 1, drops: [{ code: "copper_ore", rate: 100, min_quantity: 1, max_quantity: 1 }] }] as Resource[],
      [],
      []
    );

    const skills = { mining: 5, woodcutting: 1, fishing: 1, alchemy: 1, weaponcrafting: 1, gearcrafting: 1, jewelrycrafting: 1, cooking: 1, combat: 1 };
    const goal = gameData.resolveItemChain("copper_ore", [], skills, 100);
    expect(goal).toEqual({ type: "gather", resource: "copper_rocks" });
  });

  test("resolveItemChain: direct fight for monster drop", () => {
    const gameData = new GameData();
    gameData.load(
      [
        { map_id: 1, name: "Coop", skin: "coop", x: 0, y: 1, layer: "overworld" as const, access: { type: "standard" as const }, interactions: { content: { type: "monster" as const, code: "chicken" } } },
      ] as GameMap[],
      [],
      [{ name: "Chicken", code: "chicken", level: 1, type: "normal", hp: 60, attack_fire: 4, attack_earth: 0, attack_water: 0, attack_air: 0, res_fire: 0, res_earth: 0, res_water: 0, res_air: 0, critical_strike: 0, initiative: 0, min_gold: 0, max_gold: 2, drops: [{ code: "feather", rate: 50, min_quantity: 1, max_quantity: 1 }] }] as Monster[],
      []
    );

    const skills = { mining: 1, woodcutting: 1, fishing: 1, alchemy: 1, weaponcrafting: 1, gearcrafting: 1, jewelrycrafting: 1, cooking: 1, combat: 5 };
    const goal = gameData.resolveItemChain("feather", [], skills, 100);
    expect(goal).toEqual({ type: "fight", monster: "chicken" });
  });

  test("resolveItemChain: depth-2 chain (ore → bar → sword)", () => {
    const gameData = new GameData();
    gameData.load(
      [
        { map_id: 1, name: "Iron Mine", skin: "mine", x: 5, y: 0, layer: "overworld" as const, access: { type: "standard" as const }, interactions: { content: { type: "resource" as const, code: "iron_rocks" } } },
        { map_id: 2, name: "Coop", skin: "coop", x: 0, y: 1, layer: "overworld" as const, access: { type: "standard" as const }, interactions: { content: { type: "monster" as const, code: "chicken" } } },
      ] as GameMap[],
      [{ name: "Iron Rocks", code: "iron_rocks", skill: "mining", level: 10, drops: [{ code: "iron_ore", rate: 100, min_quantity: 1, max_quantity: 1 }] }] as Resource[],
      [{ name: "Chicken", code: "chicken", level: 1, type: "normal", hp: 60, attack_fire: 4, attack_earth: 0, attack_water: 0, attack_air: 0, res_fire: 0, res_earth: 0, res_water: 0, res_air: 0, critical_strike: 0, initiative: 0, min_gold: 0, max_gold: 2, drops: [{ code: "feather", rate: 50, min_quantity: 1, max_quantity: 1 }] }] as Monster[],
      [
        { name: "Iron Bar", code: "iron_bar", level: 10, type: "resource", subtype: "bar", description: "", tradeable: true, craft: { skill: "mining", level: 10, items: [{ code: "iron_ore", quantity: 8 }], quantity: 1 } },
        { name: "Iron Sword", code: "iron_sword", level: 10, type: "weapon", subtype: "sword", description: "", tradeable: true, craft: { skill: "weaponcrafting", level: 10, items: [{ code: "iron_bar", quantity: 6 }, { code: "feather", quantity: 2 }], quantity: 1 } },
      ] as Item[]
    );

    const skills = { mining: 10, woodcutting: 1, fishing: 1, alchemy: 1, weaponcrafting: 10, gearcrafting: 1, jewelrycrafting: 1, cooking: 1, combat: 5 };

    // No materials at all → first missing is iron_bar → needs iron_ore → gather
    const goal1 = gameData.resolveItemChain("iron_sword", [], skills, 100);
    expect(goal1).toEqual({ type: "gather", resource: "iron_rocks" });

    // Has iron_ore → can craft iron_bar
    const withOre: SimpleItem[] = [{ code: "iron_ore", quantity: 50 }];
    const goal2 = gameData.resolveItemChain("iron_sword", withOre, skills, 100);
    expect(goal2?.type).toBe("craft");
    if (goal2?.type === "craft") expect(goal2.item).toBe("iron_bar");

    // Has iron_bar but no feather → fight chicken
    const withBars: SimpleItem[] = [{ code: "iron_bar", quantity: 10 }];
    const goal3 = gameData.resolveItemChain("iron_sword", withBars, skills, 100);
    expect(goal3).toEqual({ type: "fight", monster: "chicken" });

    // Has everything → craft the sword
    const withAll: SimpleItem[] = [{ code: "iron_bar", quantity: 10 }, { code: "feather", quantity: 5 }];
    const goal4 = gameData.resolveItemChain("iron_sword", withAll, skills, 100);
    expect(goal4?.type).toBe("craft");
    if (goal4?.type === "craft") expect(goal4.item).toBe("iron_sword");
  });

  test("resolveItemChain: NPC buy for missing material", () => {
    const gameData = new GameData();
    gameData.load([], [], [], [
      { name: "Life Ring", code: "life_ring", level: 15, type: "ring", subtype: "ring", description: "", tradeable: true, craft: { skill: "jewelrycrafting", level: 15, items: [{ code: "iron_bar", quantity: 8 }, { code: "cloth", quantity: 2 }], quantity: 1 } },
    ] as Item[]);
    gameData.loadNpcItems([
      { code: "cloth", npc: "tailor", currency: "wool", buy_price: 3, sell_price: null },
    ]);

    const skills = { mining: 10, woodcutting: 1, fishing: 1, alchemy: 1, weaponcrafting: 1, gearcrafting: 1, jewelrycrafting: 15, cooking: 1, combat: 1 };
    // Has iron_bar but not cloth, has wool for NPC
    const bank: SimpleItem[] = [{ code: "iron_bar", quantity: 10 }, { code: "wool", quantity: 10 }];
    const goal = gameData.resolveItemChain("life_ring", bank, skills, 100);
    expect(goal?.type).toBe("buy_npc");
    if (goal?.type === "buy_npc") {
      expect(goal.npc).toBe("tailor");
      expect(goal.item).toBe("cloth");
    }
  });

  test("resolveItemChain: returns null when skill too low", () => {
    const gameData = new GameData();
    gameData.load([], [], [], [
      { name: "Iron Sword", code: "iron_sword", level: 10, type: "weapon", subtype: "sword", description: "", tradeable: true, craft: { skill: "weaponcrafting", level: 10, items: [{ code: "iron_bar", quantity: 6 }], quantity: 1 } },
    ] as Item[]);

    const skills = { mining: 1, woodcutting: 1, fishing: 1, alchemy: 1, weaponcrafting: 5, gearcrafting: 1, jewelrycrafting: 1, cooking: 1, combat: 1 };
    // Weaponcrafting 5 < required 10 → can't craft, item not obtainable any other way
    const goal = gameData.resolveItemChain("iron_sword", [], skills, 100);
    expect(goal).toBeNull();
  });

  test("resolveItemChain: returns null for completely unknown item", () => {
    const gameData = new GameData();
    gameData.load([], [], [], []);
    const skills = { mining: 1, combat: 1 };
    const goal = gameData.resolveItemChain("nonexistent_item", [], skills, 100);
    expect(goal).toBeNull();
  });

  test("resolveItemChain: respects gathering level for intermediate materials", () => {
    const gameData = new GameData();
    gameData.load(
      [
        { map_id: 1, name: "Iron Mine", skin: "mine", x: 5, y: 0, layer: "overworld" as const, access: { type: "standard" as const }, interactions: { content: { type: "resource" as const, code: "iron_rocks" } } },
      ] as GameMap[],
      [{ name: "Iron Rocks", code: "iron_rocks", skill: "mining", level: 10, drops: [{ code: "iron_ore", rate: 100, min_quantity: 1, max_quantity: 1 }] }] as Resource[],
      [],
      [
        { name: "Iron Bar", code: "iron_bar", level: 10, type: "resource", subtype: "bar", description: "", tradeable: true, craft: { skill: "mining", level: 10, items: [{ code: "iron_ore", quantity: 8 }], quantity: 1 } },
      ] as Item[]
    );

    // Mining level 5 can't mine iron (level 10) and can't craft iron_bar (level 10)
    const skills = { mining: 5, weaponcrafting: 10, combat: 1 };
    const goal = gameData.resolveItemChain("iron_bar", [], skills, 100);
    expect(goal).toBeNull();
  });

  test("resolveItemChain: handles inventory-full gracefully", () => {
    const gameData = new GameData();
    gameData.load([], [], [], [
      { name: "Copper Bar", code: "copper_bar", level: 1, type: "resource", subtype: "bar", description: "", tradeable: true, craft: { skill: "mining", level: 1, items: [{ code: "copper_ore", quantity: 10 }], quantity: 1 } },
    ] as Item[]);

    const skills = { mining: 5, combat: 1 };
    const bank: SimpleItem[] = [{ code: "copper_ore", quantity: 50 }];
    // Free inventory = 3, needs 10 per craft → qty = 0 → skips craft
    // copper_ore is not gatherable (no resources loaded) → returns null
    const goal = gameData.resolveItemChain("copper_bar", bank, skills, 3);
    expect(goal).toBeNull();
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
