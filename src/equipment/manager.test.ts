import { describe, test, expect } from "bun:test";
import { getEquipmentChanges } from "./manager";
import { GameData } from "../agent/game-data";
import type { Character, Item, SimpleItem } from "../types";

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    name: "alice", account: "test", skin: "men1", level: 10,
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
    weapon_slot: "copper_sword", rune_slot: "", shield_slot: "", helmet_slot: "",
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

function makeGameDataWithItems(items: Item[]): GameData {
  const gd = new GameData();
  gd.load([], [], [], items);
  return gd;
}

describe("getEquipmentChanges", () => {
  test("recommends swapping weapon when bank has better item for activity", () => {
    const items: Item[] = [
      { name: "Copper Sword", code: "copper_sword", level: 1, type: "weapon", subtype: "sword", description: "", tradeable: true, effects: [{ code: "attack_fire", value: 6, description: "" }] },
      { name: "Iron Sword", code: "iron_sword", level: 5, type: "weapon", subtype: "sword", description: "", tradeable: true, effects: [{ code: "attack_fire", value: 20, description: "" }] },
    ];
    const gd = makeGameDataWithItems(items);
    const bankItems: SimpleItem[] = [{ code: "iron_sword", quantity: 1 }];
    const char = makeCharacter({ weapon_slot: "copper_sword" });

    const changes = getEquipmentChanges(char, bankItems, gd, "combat");
    expect(changes).toHaveLength(1);
    expect(changes[0].slot).toBe("weapon");
    expect(changes[0].equipCode).toBe("iron_sword");
    expect(changes[0].unequipCode).toBe("copper_sword");
  });

  test("returns empty when current gear is already optimal", () => {
    const items: Item[] = [
      { name: "Iron Sword", code: "iron_sword", level: 5, type: "weapon", subtype: "sword", description: "", tradeable: true, effects: [{ code: "attack_fire", value: 20, description: "" }] },
      { name: "Copper Sword", code: "copper_sword", level: 1, type: "weapon", subtype: "sword", description: "", tradeable: true, effects: [{ code: "attack_fire", value: 6, description: "" }] },
    ];
    const gd = makeGameDataWithItems(items);
    const bankItems: SimpleItem[] = [{ code: "copper_sword", quantity: 1 }];
    const char = makeCharacter({ weapon_slot: "iron_sword" });

    const changes = getEquipmentChanges(char, bankItems, gd, "combat");
    expect(changes).toHaveLength(0);
  });

  test("skips items above character level", () => {
    const items: Item[] = [
      { name: "Copper Sword", code: "copper_sword", level: 1, type: "weapon", subtype: "sword", description: "", tradeable: true, effects: [{ code: "attack_fire", value: 6, description: "" }] },
      { name: "Dragon Sword", code: "dragon_sword", level: 50, type: "weapon", subtype: "sword", description: "", tradeable: true, effects: [{ code: "attack_fire", value: 100, description: "" }] },
    ];
    const gd = makeGameDataWithItems(items);
    const bankItems: SimpleItem[] = [{ code: "dragon_sword", quantity: 1 }];
    const char = makeCharacter({ weapon_slot: "copper_sword", level: 10 });

    const changes = getEquipmentChanges(char, bankItems, gd, "combat");
    expect(changes).toHaveLength(0);
  });

  test("recommends equipping into empty slot", () => {
    const items: Item[] = [
      { name: "Iron Helmet", code: "iron_helmet", level: 5, type: "helmet", subtype: "helmet", description: "", tradeable: true, effects: [{ code: "hp", value: 15, description: "" }] },
    ];
    const gd = makeGameDataWithItems(items);
    const bankItems: SimpleItem[] = [{ code: "iron_helmet", quantity: 1 }];
    const char = makeCharacter({ helmet_slot: "" });

    const changes = getEquipmentChanges(char, bankItems, gd, "combat");
    expect(changes).toHaveLength(1);
    expect(changes[0].slot).toBe("helmet");
    expect(changes[0].unequipCode).toBeNull();
    expect(changes[0].equipCode).toBe("iron_helmet");
  });

  test("prefers mining pickaxe over sword for gathering:mining", () => {
    const items: Item[] = [
      { name: "Copper Sword", code: "copper_sword", level: 1, type: "weapon", subtype: "sword", description: "", tradeable: true, effects: [{ code: "attack_fire", value: 15, description: "" }] },
      { name: "Copper Pickaxe", code: "copper_pickaxe", level: 1, type: "weapon", subtype: "tool", description: "", tradeable: true, effects: [{ code: "mining", value: 10, description: "" }, { code: "attack_earth", value: 5, description: "" }] },
    ];
    const gd = makeGameDataWithItems(items);
    const bankItems: SimpleItem[] = [{ code: "copper_pickaxe", quantity: 1 }];
    const char = makeCharacter({ weapon_slot: "copper_sword" });

    const changes = getEquipmentChanges(char, bankItems, gd, "gathering:mining");
    expect(changes).toHaveLength(1);
    expect(changes[0].equipCode).toBe("copper_pickaxe");
  });
});
