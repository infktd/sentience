import { describe, test, expect, beforeEach, mock } from "bun:test";
import { Coordinator } from "./coordinator";
import { Board } from "../board/board";
import { GameData } from "../agent/game-data";
import { FightSimulator } from "../combat/simulator";
import type { ApiClient } from "../api/client";
import type { Strategy } from "../agent/agent";
import type { Character, GameMap, Resource, Monster, Item, Goal, SimulationResponse } from "../types";
import type { BoardSnapshot } from "../board/board";
import type { ActivePlan } from "./goal-planner";

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
      { map_id: 6, name: "Workshop", skin: "workshop", x: 2, y: 1, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "workshop", code: "mining" } } },
    ] as GameMap[],
    [
      { name: "Copper Rocks", code: "copper_rocks", skill: "mining", level: 1, drops: [{ code: "copper_ore", rate: 100, min_quantity: 1, max_quantity: 1 }] },
      { name: "Ash Tree", code: "ash_tree", skill: "woodcutting", level: 1, drops: [{ code: "ash_wood", rate: 100, min_quantity: 1, max_quantity: 1 }] },
      { name: "Gudgeon Spot", code: "gudgeon_fishing_spot", skill: "fishing", level: 1, drops: [{ code: "gudgeon", rate: 100, min_quantity: 1, max_quantity: 1 }] },
    ] as Resource[],
    [
      { name: "Chicken", code: "chicken", level: 1, type: "normal", hp: 60, attack_fire: 4, attack_earth: 0, attack_water: 0, attack_air: 0, res_fire: 0, res_earth: 0, res_water: 0, res_air: 0, critical_strike: 0, initiative: 0, min_gold: 0, max_gold: 2, drops: [] },
    ] as Monster[],
    [
      { name: "Copper Bar", code: "copper_bar", level: 1, type: "resource", subtype: "bar", description: "", tradeable: true, craft: { skill: "mining", level: 1, items: [{ code: "copper_ore", quantity: 10 }], quantity: 1 } },
    ] as Item[],
  );
  return gd;
}

describe("Coordinator", () => {
  let board: Board;
  let gameData: GameData;

  beforeEach(() => {
    board = new Board();
    gameData = makeGameData();
  });

  describe("getGoal - basic delegation", () => {
    test("delegates to strategy when enabled", () => {
      const strategy: Strategy = () => ({ type: "gather", resource: "copper_rocks" });
      const coordinator = new Coordinator(board, gameData, strategy);
      const goal = coordinator.getGoal("alice", makeChar());
      expect(goal).toEqual({ type: "gather", resource: "copper_rocks" });
    });

    test("delegates to strategy when disabled falls back gracefully", () => {
      const strategy: Strategy = () => ({ type: "gather", resource: "copper_rocks" });
      const coordinator = new Coordinator(board, gameData, strategy, { enabled: false });
      // When disabled, getGoal should still return a goal via strategy fallback
      const goal = coordinator.getGoal("alice", makeChar());
      expect(goal).toEqual({ type: "gather", resource: "copper_rocks" });
    });
  });

  describe("getGoal - bank reservations", () => {
    test("reserves craft materials when assigning a craft goal", () => {
      // Bank has 10 copper_ore — enough for 1 copper_bar
      board.updateBank(
        [{ code: "copper_ore", quantity: 10 }],
        0
      );

      const strategy: Strategy = (_state, snapshot) => {
        // Strategy checks bank — should see adjusted amounts
        const copperOre = snapshot.bank.items.find((i) => i.code === "copper_ore");
        if (copperOre && copperOre.quantity >= 10) {
          return { type: "craft", item: "copper_bar", quantity: 1 };
        }
        return { type: "gather", resource: "copper_rocks" };
      };

      const coordinator = new Coordinator(board, gameData, strategy);

      // Alice gets craft goal — reserves 10 copper_ore
      const goal1 = coordinator.getGoal("alice", makeChar({ name: "alice" }));
      expect(goal1).toEqual({ type: "craft", item: "copper_bar", quantity: 1 });

      // Bob should see 0 copper_ore available — gets gather instead
      const goal2 = coordinator.getGoal("bob", makeChar({ name: "bob" }));
      expect(goal2).toEqual({ type: "gather", resource: "copper_rocks" });
    });

    test("clears reservation when reportComplete is called", () => {
      board.updateBank([{ code: "copper_ore", quantity: 10 }], 0);

      const strategy: Strategy = (_state, snapshot) => {
        const copperOre = snapshot.bank.items.find((i) => i.code === "copper_ore");
        if (copperOre && copperOre.quantity >= 10) {
          return { type: "craft", item: "copper_bar", quantity: 1 };
        }
        return { type: "gather", resource: "copper_rocks" };
      };

      const coordinator = new Coordinator(board, gameData, strategy);

      // Alice gets craft goal
      coordinator.getGoal("alice", makeChar({ name: "alice" }));

      // Alice completes — reservation clears
      coordinator.reportComplete("alice");

      // Bob should now see copper_ore available
      const goal = coordinator.getGoal("bob", makeChar({ name: "bob" }));
      expect(goal).toEqual({ type: "craft", item: "copper_bar", quantity: 1 });
    });

    test("replaces reservation when character gets new goal", () => {
      board.updateBank([{ code: "copper_ore", quantity: 20 }], 0);

      let callCount = 0;
      const strategy: Strategy = (_state, snapshot) => {
        callCount++;
        const copperOre = snapshot.bank.items.find((i) => i.code === "copper_ore");
        if (copperOre && copperOre.quantity >= 10) {
          return { type: "craft", item: "copper_bar", quantity: 1 };
        }
        return { type: "gather", resource: "copper_rocks" };
      };

      const coordinator = new Coordinator(board, gameData, strategy);

      // Alice gets craft (reserves 10)
      coordinator.getGoal("alice", makeChar({ name: "alice" }));
      // Alice asks again (old reservation cleared, new one created)
      coordinator.getGoal("alice", makeChar({ name: "alice" }));

      // Bob should see 10 remaining (not 0)
      const goal = coordinator.getGoal("bob", makeChar({ name: "bob" }));
      expect(goal).toEqual({ type: "craft", item: "copper_bar", quantity: 1 });
    });
  });

  describe("getGoal - anti-duplication", () => {
    test("does not assign same gather resource to two characters", () => {
      const strategy: Strategy = () => ({ type: "gather", resource: "copper_rocks" });
      const coordinator = new Coordinator(board, gameData, strategy);

      // Alice gets gather copper
      const goal1 = coordinator.getGoal("alice", makeChar({ name: "alice" }));
      expect(goal1).toEqual({ type: "gather", resource: "copper_rocks" });

      // Bob should get a different goal — strategy returns copper_rocks but
      // coordinator should re-invoke strategy or fall back
      const goal2 = coordinator.getGoal("bob", makeChar({ name: "bob" }));
      // Bob should NOT get the exact same gather target
      if (goal2.type === "gather") {
        expect(goal2.resource).not.toBe("copper_rocks");
      }
    });

    test("does not assign same fight monster to two characters", () => {
      const strategy: Strategy = () => ({ type: "fight", monster: "chicken" });
      const coordinator = new Coordinator(board, gameData, strategy);

      const goal1 = coordinator.getGoal("alice", makeChar({ name: "alice" }));
      expect(goal1).toEqual({ type: "fight", monster: "chicken" });

      const goal2 = coordinator.getGoal("bob", makeChar({ name: "bob" }));
      if (goal2.type === "fight") {
        expect(goal2.monster).not.toBe("chicken");
      }
    });

    test("allows same resource after character completes and releases", () => {
      const strategy: Strategy = () => ({ type: "gather", resource: "copper_rocks" });
      const coordinator = new Coordinator(board, gameData, strategy);

      coordinator.getGoal("alice", makeChar({ name: "alice" }));
      coordinator.reportComplete("alice");

      // Bob should now be able to get copper_rocks
      const goal = coordinator.getGoal("bob", makeChar({ name: "bob" }));
      expect(goal).toEqual({ type: "gather", resource: "copper_rocks" });
    });

    test("allows non-duplicatable goals like rest and deposit through unchanged", () => {
      const strategy: Strategy = () => ({ type: "rest" });
      const coordinator = new Coordinator(board, gameData, strategy);

      const goal1 = coordinator.getGoal("alice", makeChar({ name: "alice" }));
      const goal2 = coordinator.getGoal("bob", makeChar({ name: "bob" }));
      expect(goal1).toEqual({ type: "rest" });
      expect(goal2).toEqual({ type: "rest" });
    });
  });

  describe("getGoal - passes adjusted snapshot to strategy", () => {
    test("strategy receives snapshot with reserved items deducted", () => {
      board.updateBank([{ code: "copper_ore", quantity: 15 }], 100);

      let seenQuantity = -1;
      const strategy: Strategy = (_state, snapshot) => {
        const copperOre = snapshot.bank.items.find((i) => i.code === "copper_ore");
        seenQuantity = copperOre?.quantity ?? 0;
        if (seenQuantity >= 10) {
          return { type: "craft", item: "copper_bar", quantity: 1 };
        }
        return { type: "gather", resource: "copper_rocks" };
      };

      const coordinator = new Coordinator(board, gameData, strategy);

      // Alice takes craft (reserves 10 copper_ore)
      coordinator.getGoal("alice", makeChar({ name: "alice" }));

      // Bob's strategy call should see 5 copper_ore (15 - 10)
      coordinator.getGoal("bob", makeChar({ name: "bob" }));
      expect(seenQuantity).toBe(5);
    });
  });

  describe("assignment tracking", () => {
    test("getAssignment returns current goal for character", () => {
      const strategy: Strategy = () => ({ type: "gather", resource: "copper_rocks" });
      const coordinator = new Coordinator(board, gameData, strategy);
      coordinator.getGoal("alice", makeChar({ name: "alice" }));
      expect(coordinator.getAssignment("alice")).toEqual({ type: "gather", resource: "copper_rocks" });
    });

    test("getAssignment returns null for unknown character", () => {
      const strategy: Strategy = () => ({ type: "idle", reason: "test" });
      const coordinator = new Coordinator(board, gameData, strategy);
      expect(coordinator.getAssignment("unknown")).toBeNull();
    });

    test("getAssignedTargets returns set of current targets", () => {
      const calls: string[] = [];
      const strategy: Strategy = (state) => {
        calls.push(state.name);
        if (state.name === "alice") return { type: "gather", resource: "copper_rocks" };
        return { type: "fight", monster: "chicken" };
      };

      const coordinator = new Coordinator(board, gameData, strategy);
      coordinator.getGoal("alice", makeChar({ name: "alice" }));
      coordinator.getGoal("bob", makeChar({ name: "bob" }));

      const targets = coordinator.getAssignedTargets();
      expect(targets.has("gather:copper_rocks")).toBe(true);
      expect(targets.has("fight:chicken")).toBe(true);
    });
  });

  describe("getGoal - pipeline mode", () => {
    test("uses pipeline planning when enabled with multiple characters", () => {
      // Register characters on the board so coordinator knows the team
      board.updateCharacter("alice", {
        currentAction: "evaluating", target: "", position: { x: 0, y: 0 },
        skillLevels: { mining: 1, woodcutting: 1, fishing: 1, alchemy: 1, weaponcrafting: 1, gearcrafting: 1, jewelrycrafting: 1, cooking: 1, combat: 1 },
        inventoryUsed: 0, inventoryMax: 100,
      });
      board.updateCharacter("bob", {
        currentAction: "evaluating", target: "", position: { x: 0, y: 0 },
        skillLevels: { mining: 1, woodcutting: 1, fishing: 1, alchemy: 1, weaponcrafting: 1, gearcrafting: 1, jewelrycrafting: 1, cooking: 1, combat: 1 },
        inventoryUsed: 0, inventoryMax: 100,
      });

      const fallbackStrategy: Strategy = () => ({ type: "idle", reason: "fallback" });
      const coordinator = new Coordinator(board, gameData, fallbackStrategy, {
        enabled: true,
        characterNames: ["alice", "bob"],
      });

      const alice = makeChar({ name: "alice" });
      const goal = coordinator.getGoal("alice", alice);
      // Pipeline should produce a real goal, not idle fallback
      expect(goal.type).not.toBe("idle");
    });

    test("assigns different pipeline stages to different characters", () => {
      board.updateCharacter("alice", {
        currentAction: "evaluating", target: "", position: { x: 0, y: 0 },
        skillLevels: { mining: 5, woodcutting: 5, fishing: 5, alchemy: 5, weaponcrafting: 5, gearcrafting: 5, jewelrycrafting: 5, cooking: 5, combat: 5 },
        inventoryUsed: 0, inventoryMax: 100,
      });
      board.updateCharacter("bob", {
        currentAction: "evaluating", target: "", position: { x: 0, y: 0 },
        skillLevels: { mining: 5, woodcutting: 5, fishing: 5, alchemy: 5, weaponcrafting: 5, gearcrafting: 5, jewelrycrafting: 5, cooking: 5, combat: 5 },
        inventoryUsed: 0, inventoryMax: 100,
      });

      const fallbackStrategy: Strategy = () => ({ type: "idle", reason: "fallback" });
      const coordinator = new Coordinator(board, gameData, fallbackStrategy, {
        enabled: true,
        characterNames: ["alice", "bob"],
      });

      const aliceGoal = coordinator.getGoal("alice", makeChar({ name: "alice", mining_level: 5, woodcutting_level: 5, fishing_level: 5, alchemy_level: 5, weaponcrafting_level: 5, gearcrafting_level: 5, jewelrycrafting_level: 5, cooking_level: 5, level: 5 }));
      const bobGoal = coordinator.getGoal("bob", makeChar({ name: "bob", mining_level: 5, woodcutting_level: 5, fishing_level: 5, alchemy_level: 5, weaponcrafting_level: 5, gearcrafting_level: 5, jewelrycrafting_level: 5, cooking_level: 5, level: 5 }));

      // Both should get real goals
      expect(aliceGoal.type).not.toBe("idle");
      expect(bobGoal.type).not.toBe("idle");
      // They should get different assignments (spread across pipeline)
      const aliceKey = JSON.stringify(aliceGoal);
      const bobKey = JSON.stringify(bobGoal);
      expect(aliceKey).not.toBe(bobKey);
    });

    test("falls back to strategy when pipeline produces no stages", () => {
      // Empty game data — no resources, no monsters
      const emptyGd = new GameData();
      emptyGd.load([], [], []);
      const emptyBoard = new Board();

      const fallbackStrategy: Strategy = () => ({ type: "gather", resource: "copper_rocks" });
      const coordinator = new Coordinator(emptyBoard, emptyGd, fallbackStrategy, {
        enabled: true,
        characterNames: ["alice"],
      });

      const goal = coordinator.getGoal("alice", makeChar({ name: "alice" }));
      expect(goal).toEqual({ type: "gather", resource: "copper_rocks" });
    });

    test("allows multiple fighters on same monster for drop farming", () => {
      // Set up game data where the pipeline needs monster drops
      const dropGd = new GameData();
      dropGd.load(
        [
          { map_id: 1, name: "Wolf Den", skin: "cave", x: 1, y: 1, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "monster", code: "wolf" } } },
          { map_id: 2, name: "Bank", skin: "bank", x: 0, y: 0, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "bank", code: "bank" } } },
          { map_id: 3, name: "Workshop", skin: "workshop", x: 2, y: 0, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "workshop", code: "gearcrafting" } } },
        ] as GameMap[],
        [],
        [{ name: "Wolf", code: "wolf", level: 1, type: "normal", hp: 80, attack_fire: 5, attack_earth: 0, attack_water: 0, attack_air: 0, res_fire: 0, res_earth: 0, res_water: 0, res_air: 0, critical_strike: 0, initiative: 0, min_gold: 0, max_gold: 3, drops: [{ code: "wolf_hide", rate: 50, min_quantity: 1, max_quantity: 1 }] }] as Monster[],
        [{ name: "Wolf Armor", code: "wolf_armor", level: 1, type: "body_armor", subtype: "armor", description: "", tradeable: true, craft: { skill: "gearcrafting", level: 1, items: [{ code: "wolf_hide", quantity: 10 }], quantity: 1 } }] as Item[],
      );

      const dropBoard = new Board();
      const fallbackStrategy: Strategy = () => ({ type: "idle", reason: "fallback" });
      const coordinator = new Coordinator(dropBoard, dropGd, fallbackStrategy, {
        enabled: true,
        characterNames: ["alice", "bob"],
      });

      const aliceGoal = coordinator.getGoal("alice", makeChar({ name: "alice" }));
      const bobGoal = coordinator.getGoal("bob", makeChar({ name: "bob" }));

      // Both should be fighting wolves — anti-duplication should NOT block monster drop farming
      expect(aliceGoal.type).toBe("fight");
      expect(bobGoal.type).toBe("fight");
      if (aliceGoal.type === "fight" && bobGoal.type === "fight") {
        expect(aliceGoal.monster).toBe("wolf");
        expect(bobGoal.monster).toBe("wolf");
      }
    });
  });

  describe("getGoal - ActivePlan integration", () => {
    test("creates an ActivePlan on first getGoal in pipeline mode", () => {
      board.updateCharacter("alice", {
        currentAction: "evaluating", target: "", position: { x: 0, y: 0 },
        skillLevels: { mining: 1, woodcutting: 1, fishing: 1, alchemy: 1, weaponcrafting: 1, gearcrafting: 1, jewelrycrafting: 1, cooking: 1, combat: 1 },
        inventoryUsed: 0, inventoryMax: 100,
      });

      const fallbackStrategy: Strategy = () => ({ type: "idle", reason: "fallback" });
      const coordinator = new Coordinator(board, gameData, fallbackStrategy, {
        enabled: true,
        characterNames: ["alice"],
      });

      coordinator.getGoal("alice", makeChar({ name: "alice" }));

      const plan = coordinator.getActivePlan();
      expect(plan).not.toBeNull();
      expect(plan!.status).toBe("active");
      expect(plan!.targetSkill).toBeDefined();
    });

    test("persists plan across multiple getGoal calls", () => {
      board.updateCharacter("alice", {
        currentAction: "evaluating", target: "", position: { x: 0, y: 0 },
        skillLevels: { mining: 1, woodcutting: 1, fishing: 1, alchemy: 1, weaponcrafting: 1, gearcrafting: 1, jewelrycrafting: 1, cooking: 1, combat: 1 },
        inventoryUsed: 0, inventoryMax: 100,
      });

      const fallbackStrategy: Strategy = () => ({ type: "idle", reason: "fallback" });
      const coordinator = new Coordinator(board, gameData, fallbackStrategy, {
        enabled: true,
        characterNames: ["alice"],
      });

      coordinator.getGoal("alice", makeChar({ name: "alice" }));
      const plan1 = coordinator.getActivePlan();

      coordinator.getGoal("alice", makeChar({ name: "alice" }));
      const plan2 = coordinator.getActivePlan();

      // Same plan object should persist (not recreated each call)
      expect(plan1).toBe(plan2);
    });

    test("creates new plan when bottleneck shifts", () => {
      board.updateCharacter("alice", {
        currentAction: "evaluating", target: "", position: { x: 0, y: 0 },
        skillLevels: { mining: 1, woodcutting: 1, fishing: 1, alchemy: 1, weaponcrafting: 1, gearcrafting: 1, jewelrycrafting: 1, cooking: 1, combat: 1 },
        inventoryUsed: 0, inventoryMax: 100,
      });

      const fallbackStrategy: Strategy = () => ({ type: "idle", reason: "fallback" });
      const coordinator = new Coordinator(board, gameData, fallbackStrategy, {
        enabled: true,
        characterNames: ["alice"],
      });

      // First call creates plan
      coordinator.getGoal("alice", makeChar({ name: "alice" }));
      const plan1 = coordinator.getActivePlan();
      const originalSkill = plan1!.targetSkill;

      // Alice levels up in the target skill — bottleneck shifts
      const leveledChar = makeChar({
        name: "alice",
        mining_level: 10,
        woodcutting_level: 10,
        fishing_level: 10,
        alchemy_level: 10,
        weaponcrafting_level: 10,
        gearcrafting_level: 10,
        jewelrycrafting_level: 10,
        cooking_level: 10,
        level: 1, // combat is now the bottleneck
      });

      coordinator.getGoal("alice", leveledChar);
      const plan2 = coordinator.getActivePlan();

      // Plan should have changed to target the new bottleneck (combat)
      expect(plan2).not.toBe(plan1);
      expect(plan2!.targetSkill).toBe("combat");
    });

    test("triggers deposit when character has >= 10 needed items", () => {
      board.updateCharacter("alice", {
        currentAction: "evaluating", target: "", position: { x: 0, y: 0 },
        skillLevels: { mining: 1, woodcutting: 1, fishing: 1, alchemy: 1, weaponcrafting: 1, gearcrafting: 1, jewelrycrafting: 1, cooking: 1, combat: 1 },
        inventoryUsed: 12, inventoryMax: 100,
      });

      const fallbackStrategy: Strategy = () => ({ type: "idle", reason: "fallback" });
      const coordinator = new Coordinator(board, gameData, fallbackStrategy, {
        enabled: true,
        characterNames: ["alice"],
      });

      // First call to create the plan
      coordinator.getGoal("alice", makeChar({ name: "alice" }));

      // Alice now has 12 copper_ore in inventory — should trigger deposit
      const aliceWithOre = makeChar({
        name: "alice",
        inventory: [{ slot: 0, code: "copper_ore", quantity: 12 }],
      });

      const goal = coordinator.getGoal("alice", aliceWithOre);
      expect(goal.type).toBe("deposit_all");
    });

    test("caches character states for progress tracking", () => {
      board.updateCharacter("alice", {
        currentAction: "evaluating", target: "", position: { x: 0, y: 0 },
        skillLevels: { mining: 1, woodcutting: 1, fishing: 1, alchemy: 1, weaponcrafting: 1, gearcrafting: 1, jewelrycrafting: 1, cooking: 1, combat: 1 },
        inventoryUsed: 0, inventoryMax: 100,
      });
      board.updateCharacter("bob", {
        currentAction: "evaluating", target: "", position: { x: 0, y: 0 },
        skillLevels: { mining: 1, woodcutting: 1, fishing: 1, alchemy: 1, weaponcrafting: 1, gearcrafting: 1, jewelrycrafting: 1, cooking: 1, combat: 1 },
        inventoryUsed: 0, inventoryMax: 100,
      });

      const fallbackStrategy: Strategy = () => ({ type: "idle", reason: "fallback" });
      const coordinator = new Coordinator(board, gameData, fallbackStrategy, {
        enabled: true,
        characterNames: ["alice", "bob"],
      });

      const alice = makeChar({
        name: "alice",
        inventory: [{ slot: 0, code: "copper_ore", quantity: 5 }],
      });
      coordinator.getGoal("alice", alice);

      // Plan should track alice's inventory as inFlight
      const plan = coordinator.getActivePlan();
      expect(plan).not.toBeNull();
      expect(plan!.progress.inFlight.get("copper_ore")).toBe(5);
    });

    test("does not create plan when not in pipeline mode", () => {
      const strategy: Strategy = () => ({ type: "gather", resource: "copper_rocks" });
      const coordinator = new Coordinator(board, gameData, strategy);

      coordinator.getGoal("alice", makeChar({ name: "alice" }));
      expect(coordinator.getActivePlan()).toBeNull();
    });
  });

  describe("getGoal - party formation", () => {
    function makePartyGameData(): GameData {
      const gd = new GameData();
      gd.load(
        [
          { map_id: 1, name: "Boss Coop", skin: "coop", x: 3, y: 3, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "monster", code: "boss_chicken" } } },
          { map_id: 2, name: "Coop", skin: "coop", x: 0, y: 1, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "monster", code: "chicken" } } },
          { map_id: 3, name: "Bank", skin: "bank", x: 4, y: 1, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "bank", code: "bank" } } },
        ] as GameMap[],
        [],
        [
          { name: "Boss Chicken", code: "boss_chicken", level: 5, type: "boss", hp: 300, attack_fire: 20, attack_earth: 0, attack_water: 0, attack_air: 0, res_fire: 0, res_earth: 0, res_water: 0, res_air: 0, critical_strike: 0, initiative: 0, min_gold: 10, max_gold: 50, drops: [] },
          { name: "Chicken", code: "chicken", level: 1, type: "normal", hp: 60, attack_fire: 4, attack_earth: 0, attack_water: 0, attack_air: 0, res_fire: 0, res_earth: 0, res_water: 0, res_air: 0, critical_strike: 0, initiative: 0, min_gold: 0, max_gold: 2, drops: [] },
        ] as Monster[],
        []
      );
      return gd;
    }

    function makeSimResponse(wins: number, total: number): SimulationResponse {
      const results = [];
      for (let i = 0; i < total; i++) {
        results.push({
          result: i < wins ? "win" as const : "loss" as const,
          turns: 15,
          character_results: [{ final_hp: 100, utility1_slot_quantity: 0, utility2_slot_quantity: 0 }],
        });
      }
      return { results };
    }

    function makeMockSimulator(winRate = 0.95): FightSimulator {
      const api = {
        simulateFight: mock(() => Promise.resolve(makeSimResponse(Math.round(winRate * 100), 100))),
      } as unknown as ApiClient;
      return new FightSimulator(api);
    }

    test("forms party when >= 3 characters available and combat plan active", async () => {
      const partyGd = makePartyGameData();
      const partyBoard = new Board();

      const names = ["alice", "bob", "charlie"];

      const fallbackStrategy: Strategy = () => ({ type: "idle", reason: "fallback" });
      const simulator = makeMockSimulator(0.95);
      const coordinator = new Coordinator(partyBoard, partyGd, fallbackStrategy, {
        enabled: true,
        characterNames: names,
        simulator,
      });

      // Combat is bottleneck (level 1), all others at 10
      for (const name of names) {
        partyBoard.updateCharacter(name, {
          currentAction: "evaluating", target: "", position: { x: 0, y: 0 },
          skillLevels: { mining: 10, woodcutting: 10, fishing: 10, alchemy: 10, weaponcrafting: 10, gearcrafting: 10, jewelrycrafting: 10, cooking: 10, combat: 1 },
          inventoryUsed: 0, inventoryMax: 100,
        });
      }

      const combatChar = (name: string) => makeChar({ name, level: 1, mining_level: 10, woodcutting_level: 10, fishing_level: 10, alchemy_level: 10, weaponcrafting_level: 10, gearcrafting_level: 10, jewelrycrafting_level: 10, cooking_level: 10 });

      // First tick: triggers async boss search
      coordinator.getGoal("alice", combatChar("alice"));
      // Let the async boss search resolve
      await new Promise((r) => setTimeout(r, 10));

      // Second tick: partyGoal should be set now
      const aliceGoal = coordinator.getGoal("alice", combatChar("alice"));
      const bobGoal = coordinator.getGoal("bob", combatChar("bob"));
      const charlieGoal = coordinator.getGoal("charlie", combatChar("charlie"));

      // All three should get fight goals with party field
      expect(aliceGoal.type).toBe("fight");
      expect(bobGoal.type).toBe("fight");
      expect(charlieGoal.type).toBe("fight");
      if (aliceGoal.type === "fight") {
        expect(aliceGoal.party).toBeDefined();
        expect(aliceGoal.party!.length).toBe(3);
        expect(aliceGoal.monster).toBe("boss_chicken");
      }
    });

    test("does not form party with fewer than 3 characters", async () => {
      const partyGd = makePartyGameData();
      const partyBoard = new Board();

      const names = ["alice", "bob"];
      for (const name of names) {
        partyBoard.updateCharacter(name, {
          currentAction: "evaluating", target: "", position: { x: 0, y: 0 },
          skillLevels: { mining: 10, woodcutting: 10, fishing: 10, alchemy: 10, weaponcrafting: 10, gearcrafting: 10, jewelrycrafting: 10, cooking: 10, combat: 1 },
          inventoryUsed: 0, inventoryMax: 100,
        });
      }

      const fallbackStrategy: Strategy = () => ({ type: "fight", monster: "chicken" });
      const simulator = makeMockSimulator(0.95);
      const coordinator = new Coordinator(partyBoard, partyGd, fallbackStrategy, {
        enabled: true,
        characterNames: names,
        simulator,
      });

      const char = makeChar({ name: "alice", level: 1, mining_level: 10, woodcutting_level: 10, fishing_level: 10, alchemy_level: 10, weaponcrafting_level: 10, gearcrafting_level: 10, jewelrycrafting_level: 10, cooking_level: 10 });
      coordinator.getGoal("alice", char);
      await new Promise((r) => setTimeout(r, 10));
      const goal = coordinator.getGoal("alice", char);

      // Should NOT get a party fight (only 2 characters)
      if (goal.type === "fight") {
        expect(goal.party).toBeUndefined();
      }
    });

    test("does not form party for non-combat plan", async () => {
      const partyGd = makePartyGameData();
      const partyBoard = new Board();

      const names = ["alice", "bob", "charlie"];
      for (const name of names) {
        partyBoard.updateCharacter(name, {
          currentAction: "evaluating", target: "", position: { x: 0, y: 0 },
          skillLevels: { mining: 1, woodcutting: 10, fishing: 10, alchemy: 10, weaponcrafting: 10, gearcrafting: 10, jewelrycrafting: 10, cooking: 10, combat: 10 },
          inventoryUsed: 0, inventoryMax: 100,
        });
      }

      const fallbackStrategy: Strategy = () => ({ type: "gather", resource: "copper_rocks" });
      const simulator = makeMockSimulator(0.95);
      const coordinator = new Coordinator(partyBoard, partyGd, fallbackStrategy, {
        enabled: true,
        characterNames: names,
        simulator,
      });

      // Mining is bottleneck (level 1), not combat — so no boss party
      const char = makeChar({ name: "alice", mining_level: 1, woodcutting_level: 10, fishing_level: 10, alchemy_level: 10, weaponcrafting_level: 10, gearcrafting_level: 10, jewelrycrafting_level: 10, cooking_level: 10, level: 10 });
      coordinator.getGoal("alice", char);
      await new Promise((r) => setTimeout(r, 10));
      const goal = coordinator.getGoal("alice", char);

      if (goal.type === "fight") {
        expect(goal.party).toBeUndefined();
      }
    });

    test("does not form party when no beatable boss exists", async () => {
      const partyGd = makePartyGameData();
      const partyBoard = new Board();

      const names = ["alice", "bob", "charlie"];
      for (const name of names) {
        partyBoard.updateCharacter(name, {
          currentAction: "evaluating", target: "", position: { x: 0, y: 0 },
          skillLevels: { mining: 10, woodcutting: 10, fishing: 10, alchemy: 10, weaponcrafting: 10, gearcrafting: 10, jewelrycrafting: 10, cooking: 10, combat: 1 },
          inventoryUsed: 0, inventoryMax: 100,
        });
      }

      // Simulator says all bosses are too hard
      const failSimulator = makeMockSimulator(0.3);
      const fallbackStrategy: Strategy = () => ({ type: "fight", monster: "chicken" });
      const coordinator = new Coordinator(partyBoard, partyGd, fallbackStrategy, {
        enabled: true,
        characterNames: names,
        simulator: failSimulator,
      });

      const char = makeChar({ name: "alice", level: 1, mining_level: 10, woodcutting_level: 10, fishing_level: 10, alchemy_level: 10, weaponcrafting_level: 10, gearcrafting_level: 10, jewelrycrafting_level: 10, cooking_level: 10 });
      coordinator.getGoal("alice", char);
      await new Promise((r) => setTimeout(r, 10));
      const goal = coordinator.getGoal("alice", char);

      // No beatable boss → falls back to regular combat (solo fight or pipeline)
      if (goal.type === "fight") {
        expect(goal.party).toBeUndefined();
      }
    });
  });
});
