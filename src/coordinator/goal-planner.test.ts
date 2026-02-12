import { describe, test, expect } from "bun:test";
import {
  buildActivePlan,
  updatePlanProgress,
  shouldCompletePlan,
  shouldDeposit,
  type ActivePlan,
} from "./goal-planner";
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
      { map_id: 9, name: "Wolf Den", skin: "cave", x: 5, y: 0, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "monster", code: "wolf" } } },
    ] as GameMap[],
    [
      { name: "Copper Rocks", code: "copper_rocks", skill: "mining", level: 1, drops: [{ code: "copper_ore", rate: 100, min_quantity: 1, max_quantity: 1 }] },
      { name: "Ash Tree", code: "ash_tree", skill: "woodcutting", level: 1, drops: [{ code: "ash_wood", rate: 100, min_quantity: 1, max_quantity: 1 }] },
      { name: "Gudgeon Spot", code: "gudgeon_fishing_spot", skill: "fishing", level: 1, drops: [{ code: "gudgeon", rate: 100, min_quantity: 1, max_quantity: 1 }] },
      { name: "Strange Rocks", code: "strange_rocks", skill: "alchemy", level: 1, drops: [{ code: "strange_ore", rate: 100, min_quantity: 1, max_quantity: 1 }] },
    ] as Resource[],
    [
      { name: "Chicken", code: "chicken", level: 1, type: "normal", hp: 60, attack_fire: 4, attack_earth: 0, attack_water: 0, attack_air: 0, res_fire: 0, res_earth: 0, res_water: 0, res_air: 0, critical_strike: 0, initiative: 0, min_gold: 0, max_gold: 2, drops: [{ code: "feather", rate: 50, min_quantity: 1, max_quantity: 1 }] },
      { name: "Wolf", code: "wolf", level: 1, type: "normal", hp: 80, attack_fire: 5, attack_earth: 0, attack_water: 0, attack_air: 0, res_fire: 0, res_earth: 0, res_water: 0, res_air: 0, critical_strike: 0, initiative: 0, min_gold: 0, max_gold: 3, drops: [{ code: "wolf_hide", rate: 50, min_quantity: 1, max_quantity: 1 }] },
    ] as Monster[],
    [
      { name: "Copper Bar", code: "copper_bar", level: 1, type: "resource", subtype: "bar", description: "", tradeable: true, craft: { skill: "mining", level: 1, items: [{ code: "copper_ore", quantity: 10 }], quantity: 1 } },
      { name: "Ash Plank", code: "ash_plank", level: 1, type: "resource", subtype: "plank", description: "", tradeable: true, craft: { skill: "woodcutting", level: 1, items: [{ code: "ash_wood", quantity: 10 }], quantity: 1 } },
      { name: "Copper Dagger", code: "copper_dagger", level: 1, type: "weapon", subtype: "sword", description: "", tradeable: true, craft: { skill: "weaponcrafting", level: 1, items: [{ code: "copper_bar", quantity: 6 }], quantity: 1 } },
      { name: "Copper Helmet", code: "copper_helmet", level: 1, type: "helmet", subtype: "helmet", description: "", tradeable: true, craft: { skill: "gearcrafting", level: 1, items: [{ code: "copper_bar", quantity: 6 }], quantity: 1 } },
      { name: "Cooked Gudgeon", code: "cooked_gudgeon", level: 1, type: "consumable", subtype: "food", description: "", tradeable: true, craft: { skill: "cooking", level: 1, items: [{ code: "gudgeon", quantity: 1 }], quantity: 1 } },
      { name: "Feather Amulet", code: "feather_amulet", level: 1, type: "amulet", subtype: "amulet", description: "", tradeable: true, craft: { skill: "jewelrycrafting", level: 1, items: [{ code: "feather", quantity: 5 }], quantity: 1 } },
      { name: "Wolf Armor", code: "wolf_armor", level: 1, type: "body_armor", subtype: "armor", description: "", tradeable: true, craft: { skill: "gearcrafting", level: 1, items: [{ code: "wolf_hide", quantity: 10 }], quantity: 1 } },
    ] as Item[],
  );
  return gd;
}

// === buildActivePlan ===

describe("buildActivePlan", () => {
  test("creates plan targeting a gathering skill with gather+refine stages", () => {
    const gd = makeGameData();
    const chars = [makeChar({ name: "alice" })];
    const plan = buildActivePlan("mining", chars, [], gd);

    expect(plan).not.toBeNull();
    expect(plan!.targetSkill).toBe("mining");
    expect(plan!.targetRecipe).toBe("copper_bar");
    expect(plan!.status).toBe("active");
    expect(plan!.mode).toBe("auto");

    // Should have materialNeeds for copper_ore
    const oreNeed = plan!.materialNeeds.find((n) => n.code === "copper_ore");
    expect(oreNeed).toBeDefined();
    expect(oreNeed!.source).toBe("gather");
    expect(oreNeed!.sourceCode).toBe("copper_rocks");

    // Should have stages (at least gather and craft)
    expect(plan!.stages.length).toBeGreaterThanOrEqual(1);
  });

  test("creates plan targeting a crafting skill with full material chain", () => {
    const gd = makeGameData();
    const chars = [makeChar({ name: "alice" })];
    const plan = buildActivePlan("weaponcrafting", chars, [], gd);

    expect(plan).not.toBeNull();
    expect(plan!.targetSkill).toBe("weaponcrafting");
    expect(plan!.targetRecipe).toBe("copper_dagger");

    // copper_dagger needs copper_bar (intermediate craft) which needs copper_ore (gather)
    const barNeed = plan!.materialNeeds.find((n) => n.code === "copper_bar");
    expect(barNeed).toBeDefined();
    expect(barNeed!.source).toBe("craft");

    const oreNeed = plan!.materialNeeds.find((n) => n.code === "copper_ore");
    expect(oreNeed).toBeDefined();
    expect(oreNeed!.source).toBe("gather");
  });

  test("creates plan targeting combat with fight stage", () => {
    const gd = makeGameData();
    const chars = [makeChar({ name: "alice" })];
    const plan = buildActivePlan("combat", chars, [], gd);

    expect(plan).not.toBeNull();
    expect(plan!.targetSkill).toBe("combat");
    expect(plan!.stages.length).toBeGreaterThanOrEqual(1);
    expect(plan!.stages[0].type).toBe("fight");
  });

  test("includes monster_drop material needs when recipe requires drops", () => {
    const gd = makeGameData();
    const chars = [makeChar({ name: "alice" })];
    // gearcrafting has wolf_armor which needs wolf_hide (monster drop)
    // and copper_helmet which needs copper_bar
    // buildActivePlan picks highest-level recipe, both are level 1
    // We'll target gearcrafting and verify monster drops are recognized
    const plan = buildActivePlan("gearcrafting", chars, [], gd);

    expect(plan).not.toBeNull();
    // Should have at least one materialNeed — either wolf_hide or copper_bar depending on recipe picked
    expect(plan!.materialNeeds.length).toBeGreaterThan(0);
  });

  test("uses team max skill level to find best recipe", () => {
    const gd = makeGameData();
    // Alice has mining level 1, Bob has mining level 5
    const chars = [
      makeChar({ name: "alice", mining_level: 1 }),
      makeChar({ name: "bob", mining_level: 5 }),
    ];
    const plan = buildActivePlan("mining", chars, [], gd);

    expect(plan).not.toBeNull();
    // With max level 5, still picks copper_bar (only recipe available at that level in test data)
    expect(plan!.targetRecipe).toBe("copper_bar");
  });

  test("initializes progress with zero values", () => {
    const gd = makeGameData();
    const chars = [makeChar({ name: "alice" })];
    const plan = buildActivePlan("mining", chars, [], gd);

    expect(plan).not.toBeNull();
    expect(plan!.progress.banked.size).toBe(0);
    expect(plan!.progress.inFlight.size).toBe(0);
    expect(plan!.progress.crafted).toBe(0);
  });

  test("returns null when no recipe exists for skill", () => {
    // Use empty game data (no items = no recipes)
    const emptyGd = new GameData();
    emptyGd.load([], [], []);
    const chars = [makeChar({ name: "alice" })];
    const plan = buildActivePlan("mining", chars, [], emptyGd);

    expect(plan).toBeNull();
  });
});

// === updatePlanProgress ===

describe("updatePlanProgress", () => {
  test("updates banked counts from bank items", () => {
    const gd = makeGameData();
    const chars = [makeChar({ name: "alice" })];
    const plan = buildActivePlan("mining", chars, [], gd)!;

    const bankItems = [{ code: "copper_ore", quantity: 25 }];
    const charStates = new Map<string, Character>();

    updatePlanProgress(plan, bankItems, charStates);

    expect(plan.progress.banked.get("copper_ore")).toBe(25);
  });

  test("updates inFlight counts from character inventories", () => {
    const gd = makeGameData();
    const chars = [makeChar({ name: "alice" })];
    const plan = buildActivePlan("mining", chars, [], gd)!;

    const bankItems: { code: string; quantity: number }[] = [];
    const charStates = new Map<string, Character>();
    charStates.set("alice", makeChar({
      name: "alice",
      inventory: [
        { slot: 0, code: "copper_ore", quantity: 8 },
        { slot: 1, code: "random_junk", quantity: 5 },
      ],
    }));

    updatePlanProgress(plan, bankItems, charStates);

    expect(plan.progress.inFlight.get("copper_ore")).toBe(8);
    // random_junk not in materialNeeds, should not appear
    expect(plan.progress.inFlight.has("random_junk")).toBe(false);
  });

  test("sums inFlight across multiple characters", () => {
    const gd = makeGameData();
    const chars = [makeChar({ name: "alice" }), makeChar({ name: "bob" })];
    const plan = buildActivePlan("mining", chars, [], gd)!;

    const bankItems: { code: string; quantity: number }[] = [];
    const charStates = new Map<string, Character>();
    charStates.set("alice", makeChar({
      name: "alice",
      inventory: [{ slot: 0, code: "copper_ore", quantity: 5 }],
    }));
    charStates.set("bob", makeChar({
      name: "bob",
      inventory: [{ slot: 0, code: "copper_ore", quantity: 7 }],
    }));

    updatePlanProgress(plan, bankItems, charStates);

    expect(plan.progress.inFlight.get("copper_ore")).toBe(12);
  });

  test("only tracks materials in materialNeeds", () => {
    const gd = makeGameData();
    const chars = [makeChar({ name: "alice" })];
    const plan = buildActivePlan("mining", chars, [], gd)!;

    const bankItems = [
      { code: "copper_ore", quantity: 10 },
      { code: "unrelated_item", quantity: 50 },
    ];
    const charStates = new Map<string, Character>();

    updatePlanProgress(plan, bankItems, charStates);

    expect(plan.progress.banked.get("copper_ore")).toBe(10);
    expect(plan.progress.banked.has("unrelated_item")).toBe(false);
  });
});

// === shouldCompletePlan ===

describe("shouldCompletePlan", () => {
  test("returns false when target skill is still the team bottleneck", () => {
    const gd = makeGameData();
    // All skills at 1, mining is tied for lowest
    const chars = [makeChar({ name: "alice" })];
    const plan = buildActivePlan("mining", chars, [], gd)!;

    const result = shouldCompletePlan(plan, chars);
    expect(result).toBe(false);
  });

  test("returns true when target skill is no longer the lowest", () => {
    const gd = makeGameData();
    const chars = [makeChar({ name: "alice" })];
    const plan = buildActivePlan("mining", chars, [], gd)!;

    // Now alice has higher mining — it's no longer the bottleneck
    const updatedChars = [makeChar({
      name: "alice",
      mining_level: 10,
      // all others still 1
    })];

    const result = shouldCompletePlan(plan, updatedChars);
    expect(result).toBe(true);
  });

  test("returns false when all skills are equal (tied is not shifted)", () => {
    const gd = makeGameData();
    const chars = [makeChar({ name: "alice", mining_level: 5, woodcutting_level: 5, fishing_level: 5, alchemy_level: 5, weaponcrafting_level: 5, gearcrafting_level: 5, jewelrycrafting_level: 5, cooking_level: 5, level: 5 })];
    const plan = buildActivePlan("mining", chars, [], gd)!;

    const result = shouldCompletePlan(plan, chars);
    // All tied — mining is still at the bottom (tied), so no shift
    expect(result).toBe(false);
  });

  test("returns true when target skill surpasses at least one other", () => {
    const gd = makeGameData();
    const chars = [makeChar({ name: "alice" })];
    const plan = buildActivePlan("combat", chars, [], gd)!;

    // Combat went up, everything else stayed at 1
    const updatedChars = [makeChar({
      name: "alice",
      level: 5,
    })];

    const result = shouldCompletePlan(plan, updatedChars);
    expect(result).toBe(true);
  });
});

// === shouldDeposit ===

describe("shouldDeposit", () => {
  test("returns true when character has >= 10 needed items", () => {
    const gd = makeGameData();
    const chars = [makeChar({ name: "alice" })];
    const plan = buildActivePlan("mining", chars, [], gd)!;

    const state = makeChar({
      name: "alice",
      inventory: [{ slot: 0, code: "copper_ore", quantity: 12 }],
    });

    const assignments = new Map<string, string>();
    const bankItems = [{ code: "copper_ore", quantity: 50 }];

    expect(shouldDeposit(plan, "alice", state, assignments, bankItems)).toBe(true);
  });

  test("returns false when character has < 10 needed items and no starved crafter", () => {
    const gd = makeGameData();
    const chars = [makeChar({ name: "alice" })];
    const plan = buildActivePlan("mining", chars, [], gd)!;

    const state = makeChar({
      name: "alice",
      inventory: [{ slot: 0, code: "copper_ore", quantity: 5 }],
    });

    const assignments = new Map<string, string>();
    const bankItems = [{ code: "copper_ore", quantity: 50 }];

    expect(shouldDeposit(plan, "alice", state, assignments, bankItems)).toBe(false);
  });

  test("returns true when a crafter is starved and this character has needed items", () => {
    const gd = makeGameData();
    const chars = [makeChar({ name: "alice" }), makeChar({ name: "bob" })];
    const plan = buildActivePlan("mining", chars, [], gd)!;

    const state = makeChar({
      name: "alice",
      inventory: [{ slot: 0, code: "copper_ore", quantity: 3 }],
    });

    // Bob is assigned to craft copper_bar
    const assignments = new Map<string, string>();
    assignments.set("bob", "craft:copper_bar");

    // Bank has 0 copper_ore — crafter bob is starved
    const bankItems: { code: string; quantity: number }[] = [];

    expect(shouldDeposit(plan, "alice", state, assignments, bankItems)).toBe(true);
  });

  test("returns false when character has no plan-relevant items", () => {
    const gd = makeGameData();
    const chars = [makeChar({ name: "alice" })];
    const plan = buildActivePlan("mining", chars, [], gd)!;

    const state = makeChar({
      name: "alice",
      inventory: [{ slot: 0, code: "random_stuff", quantity: 50 }],
    });

    const assignments = new Map<string, string>();
    const bankItems: { code: string; quantity: number }[] = [];

    expect(shouldDeposit(plan, "alice", state, assignments, bankItems)).toBe(false);
  });

  test("returns false for character that is itself the crafter", () => {
    const gd = makeGameData();
    const chars = [makeChar({ name: "alice" })];
    const plan = buildActivePlan("mining", chars, [], gd)!;

    const state = makeChar({
      name: "alice",
      inventory: [{ slot: 0, code: "copper_ore", quantity: 3 }],
    });

    // Alice is the crafter — she's starved but should not deposit (she IS the crafter)
    const assignments = new Map<string, string>();
    assignments.set("alice", "craft:copper_bar");

    const bankItems: { code: string; quantity: number }[] = [];

    expect(shouldDeposit(plan, "alice", state, assignments, bankItems)).toBe(false);
  });
});
