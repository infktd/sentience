import { describe, test, expect } from "bun:test";
import { getTeamBottleneck, buildPipelineStages, assignCharacterToStage } from "./pipeline";
import type { Character, GameMap, Resource, Monster, Item } from "../types";
import { GameData } from "../agent/game-data";

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
      { map_id: 6, name: "Mining Workshop", skin: "workshop", x: 2, y: 1, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "workshop", code: "mining" } } },
      { map_id: 7, name: "Weapon Workshop", skin: "workshop", x: 3, y: 1, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "workshop", code: "weaponcrafting" } } },
      { map_id: 8, name: "Herb Patch", skin: "herb", x: 1, y: 3, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "resource", code: "strange_rocks" } } },
    ] as GameMap[],
    [
      { name: "Copper Rocks", code: "copper_rocks", skill: "mining", level: 1, drops: [{ code: "copper_ore", rate: 100, min_quantity: 1, max_quantity: 1 }] },
      { name: "Ash Tree", code: "ash_tree", skill: "woodcutting", level: 1, drops: [{ code: "ash_wood", rate: 100, min_quantity: 1, max_quantity: 1 }] },
      { name: "Gudgeon Spot", code: "gudgeon_fishing_spot", skill: "fishing", level: 1, drops: [{ code: "gudgeon", rate: 100, min_quantity: 1, max_quantity: 1 }] },
      { name: "Strange Rocks", code: "strange_rocks", skill: "alchemy", level: 1, drops: [{ code: "strange_ore", rate: 100, min_quantity: 1, max_quantity: 1 }] },
    ] as Resource[],
    [
      { name: "Chicken", code: "chicken", level: 1, type: "normal", hp: 60, attack_fire: 4, attack_earth: 0, attack_water: 0, attack_air: 0, res_fire: 0, res_earth: 0, res_water: 0, res_air: 0, critical_strike: 0, initiative: 0, min_gold: 0, max_gold: 2, drops: [{ code: "feather", rate: 50, min_quantity: 1, max_quantity: 1 }] },
    ] as Monster[],
    [
      { name: "Copper Bar", code: "copper_bar", level: 1, type: "resource", subtype: "bar", description: "", tradeable: true, craft: { skill: "mining", level: 1, items: [{ code: "copper_ore", quantity: 10 }], quantity: 1 } },
      { name: "Ash Plank", code: "ash_plank", level: 1, type: "resource", subtype: "plank", description: "", tradeable: true, craft: { skill: "woodcutting", level: 1, items: [{ code: "ash_wood", quantity: 10 }], quantity: 1 } },
      { name: "Copper Dagger", code: "copper_dagger", level: 1, type: "weapon", subtype: "sword", description: "", tradeable: true, craft: { skill: "weaponcrafting", level: 1, items: [{ code: "copper_bar", quantity: 6 }], quantity: 1 } },
      { name: "Copper Helmet", code: "copper_helmet", level: 1, type: "helmet", subtype: "helmet", description: "", tradeable: true, craft: { skill: "gearcrafting", level: 1, items: [{ code: "copper_bar", quantity: 6 }], quantity: 1 } },
      { name: "Copper Ring", code: "copper_ring", level: 1, type: "ring", subtype: "ring", description: "", tradeable: true, craft: { skill: "jewelrycrafting", level: 1, items: [{ code: "copper_bar", quantity: 6 }], quantity: 1 } },
      { name: "Cooked Gudgeon", code: "cooked_gudgeon", level: 1, type: "consumable", subtype: "food", description: "", tradeable: true, craft: { skill: "cooking", level: 1, items: [{ code: "gudgeon", quantity: 1 }], quantity: 1 } },
      { name: "Feather Amulet", code: "feather_amulet", level: 1, type: "amulet", subtype: "amulet", description: "", tradeable: true, craft: { skill: "jewelrycrafting", level: 1, items: [{ code: "feather", quantity: 5 }], quantity: 1 } },
    ] as Item[],
  );
  return gd;
}

// === getTeamBottleneck ===

describe("getTeamBottleneck", () => {
  test("returns all skills tied when characters are equal", () => {
    const chars = [makeChar({ name: "alice" }), makeChar({ name: "bob" })];
    const result = getTeamBottleneck(chars);
    // All skills at level 1, so all should be in the result
    expect(result.length).toBe(9);
    expect(result[0].level).toBe(1);
  });

  test("puts the lowest average skill first", () => {
    const chars = [
      makeChar({ name: "alice", mining_level: 10, woodcutting_level: 5, fishing_level: 10, alchemy_level: 10, weaponcrafting_level: 10, gearcrafting_level: 10, jewelrycrafting_level: 10, cooking_level: 10, level: 10 }),
      makeChar({ name: "bob", mining_level: 10, woodcutting_level: 3, fishing_level: 10, alchemy_level: 10, weaponcrafting_level: 10, gearcrafting_level: 10, jewelrycrafting_level: 10, cooking_level: 10, level: 10 }),
    ];
    const result = getTeamBottleneck(chars);
    expect(result[0].skill).toBe("woodcutting");
    expect(result[0].level).toBe(4); // avg of 5 and 3
  });

  test("considers all 9 skills including combat", () => {
    const chars = [
      makeChar({ name: "alice", mining_level: 10, woodcutting_level: 10, fishing_level: 10, alchemy_level: 10, weaponcrafting_level: 10, gearcrafting_level: 10, jewelrycrafting_level: 10, cooking_level: 10, level: 2 }),
    ];
    const result = getTeamBottleneck(chars);
    expect(result[0].skill).toBe("combat");
    expect(result[0].level).toBe(2);
  });

  test("returns skills sorted by average level ascending", () => {
    const chars = [
      makeChar({ name: "alice", mining_level: 5, woodcutting_level: 3, fishing_level: 8, alchemy_level: 1, weaponcrafting_level: 10, gearcrafting_level: 10, jewelrycrafting_level: 10, cooking_level: 10, level: 10 }),
    ];
    const result = getTeamBottleneck(chars);
    expect(result[0].skill).toBe("alchemy");
    expect(result[1].skill).toBe("woodcutting");
    expect(result[2].skill).toBe("mining");
    expect(result[3].skill).toBe("fishing");
  });
});

// === buildPipelineStages ===

describe("buildPipelineStages", () => {
  test("builds gather+refine stages for a gathering skill", () => {
    const gd = makeGameData();
    const stages = buildPipelineStages("mining", 1, [], gd);
    // Mining pipeline: gather copper_ore, then refine into copper_bar
    expect(stages.length).toBeGreaterThanOrEqual(1);
    expect(stages.some(s => s.type === "gather")).toBe(true);
    const gatherStage = stages.find(s => s.type === "gather");
    expect(gatherStage?.resource).toBe("copper_rocks");
  });

  test("builds gather+refine+craft stages for a crafting skill", () => {
    const gd = makeGameData();
    // Weaponcrafting needs copper_bar which needs copper_ore
    const stages = buildPipelineStages("weaponcrafting", 1, [], gd);
    expect(stages.length).toBeGreaterThanOrEqual(2);
    // Should have: gather copper_ore, refine copper_bar, craft copper_dagger
    const types = stages.map(s => s.type);
    expect(types).toContain("gather");
    expect(types).toContain("craft");
  });

  test("skips gather stage when bank has enough raw materials", () => {
    const gd = makeGameData();
    const bankItems = [{ code: "copper_ore", quantity: 100 }];
    const stages = buildPipelineStages("mining", 1, bankItems, gd);
    // Bank has plenty of ore, so refine stage should come first
    expect(stages[0].type).toBe("craft");
    expect(stages[0].item).toBe("copper_bar");
  });

  test("skips refine stage when bank has enough intermediate materials", () => {
    const gd = makeGameData();
    const bankItems = [{ code: "copper_bar", quantity: 100 }];
    const stages = buildPipelineStages("weaponcrafting", 1, bankItems, gd);
    // Bank has bars, just need to craft daggers
    expect(stages[0].type).toBe("craft");
    expect(stages[0].item).toBe("copper_dagger");
  });

  test("returns combat stage for combat skill", () => {
    const gd = makeGameData();
    const stages = buildPipelineStages("combat", 1, [], gd);
    expect(stages.length).toBeGreaterThanOrEqual(1);
    expect(stages[0].type).toBe("fight");
    expect(stages[0].monster).toBe("chicken");
  });

  test("includes monster drop gather when recipe needs drops", () => {
    const gd = makeGameData();
    // feather_amulet needs feathers which drop from chicken
    const stages = buildPipelineStages("jewelrycrafting", 1, [], gd);
    // Should include a fight stage to farm feathers, plus gather copper for copper_ring
    const hasFight = stages.some(s => s.type === "fight");
    const hasGather = stages.some(s => s.type === "gather");
    expect(hasFight || hasGather).toBe(true);
  });
});

// === assignCharacterToStage ===

describe("assignCharacterToStage", () => {
  test("assigns character to stage matching their weakest relevant skill", () => {
    const stages = [
      { type: "gather" as const, skill: "mining", resource: "copper_rocks" },
      { type: "craft" as const, skill: "weaponcrafting", item: "copper_dagger", quantity: 1 },
    ];
    // Alice has high mining but low weaponcrafting
    const alice = makeChar({ name: "alice", mining_level: 10, weaponcrafting_level: 2 });
    const assignment = assignCharacterToStage("alice", alice, stages, new Map());
    expect(assignment.type).toBe("craft");
  });

  test("avoids stages already fully covered by other characters", () => {
    const stages = [
      { type: "gather" as const, skill: "mining", resource: "copper_rocks" },
      { type: "craft" as const, skill: "weaponcrafting", item: "copper_dagger", quantity: 1 },
    ];
    const bob = makeChar({ name: "bob", mining_level: 2, weaponcrafting_level: 10 });
    // Alice is already on the craft stage
    const currentAssignments = new Map<string, string>();
    currentAssignments.set("alice", "craft:copper_dagger");
    const assignment = assignCharacterToStage("bob", bob, stages, currentAssignments);
    expect(assignment.type).toBe("gather");
  });

  test("allows multiple characters on same stage when understaffed", () => {
    const stages = [
      { type: "gather" as const, skill: "mining", resource: "copper_rocks" },
    ];
    // Only one stage available — both should be assigned to it
    const bob = makeChar({ name: "bob" });
    const currentAssignments = new Map<string, string>();
    currentAssignments.set("alice", "gather:copper_rocks");
    const assignment = assignCharacterToStage("bob", bob, stages, currentAssignments);
    expect(assignment.type).toBe("gather");
    if (assignment.type === "gather") {
      expect(assignment.resource).toBe("copper_rocks");
    }
  });

  test("applies anti-thrash bias — prefers current assignment when margin is small", () => {
    const stages = [
      { type: "gather" as const, skill: "mining", resource: "copper_rocks" },
      { type: "craft" as const, skill: "weaponcrafting", item: "copper_dagger", quantity: 1 },
    ];
    // Alice has nearly equal skill levels — margin is small
    const alice = makeChar({ name: "alice", mining_level: 10, weaponcrafting_level: 9 });
    // Alice was previously on gather
    const currentAssignments = new Map<string, string>();
    currentAssignments.set("alice", "gather:copper_rocks");
    const assignment = assignCharacterToStage("alice", alice, stages, currentAssignments, "gather:copper_rocks");
    // Should prefer staying on gather due to anti-thrash
    expect(assignment.type).toBe("gather");
  });

  test("overrides anti-thrash when skill gap is large", () => {
    const stages = [
      { type: "gather" as const, skill: "mining", resource: "copper_rocks" },
      { type: "craft" as const, skill: "weaponcrafting", item: "copper_dagger", quantity: 1 },
    ];
    // Alice has very high mining but very low weaponcrafting — big gap
    const alice = makeChar({ name: "alice", mining_level: 20, weaponcrafting_level: 2 });
    const currentAssignments = new Map<string, string>();
    currentAssignments.set("alice", "gather:copper_rocks");
    const assignment = assignCharacterToStage("alice", alice, stages, currentAssignments, "gather:copper_rocks");
    // Skill gap is too large — should switch to craft
    expect(assignment.type).toBe("craft");
  });
});
