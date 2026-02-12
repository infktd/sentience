import { describe, test, expect, mock } from "bun:test";
import { FightSimulator } from "./simulator";
import { ApiClient } from "../api/client";
import { GameData } from "../agent/game-data";
import type { Character, SimulationResponse, Monster, GameMap } from "../types";

function makeChar(overrides: Partial<Character> = {}): Character {
  return {
    name: "alice", account: "test", skin: "men1", level: 5,
    xp: 0, max_xp: 100, gold: 0, speed: 0,
    mining_level: 1, mining_xp: 0, mining_max_xp: 100,
    woodcutting_level: 1, woodcutting_xp: 0, woodcutting_max_xp: 100,
    fishing_level: 1, fishing_xp: 0, fishing_max_xp: 100,
    weaponcrafting_level: 1, weaponcrafting_xp: 0, weaponcrafting_max_xp: 100,
    gearcrafting_level: 1, gearcrafting_xp: 0, gearcrafting_max_xp: 100,
    jewelrycrafting_level: 1, jewelrycrafting_xp: 0, jewelrycrafting_max_xp: 100,
    cooking_level: 1, cooking_xp: 0, cooking_max_xp: 100,
    alchemy_level: 1, alchemy_xp: 0, alchemy_max_xp: 100,
    hp: 160, max_hp: 160, haste: 0, critical_strike: 0, wisdom: 0,
    prospecting: 0, initiative: 0, threat: 0,
    attack_fire: 0, attack_earth: 0, attack_water: 0, attack_air: 0,
    dmg: 0, dmg_fire: 0, dmg_earth: 0, dmg_water: 0, dmg_air: 0,
    res_fire: 0, res_earth: 0, res_water: 0, res_air: 0,
    effects: [], x: 0, y: 0, layer: "overworld", map_id: 0,
    cooldown: 0, cooldown_expiration: new Date().toISOString(),
    weapon_slot: "copper_dagger", rune_slot: "", shield_slot: "", helmet_slot: "copper_helmet",
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

function makeSimResponse(wins: number, total: number, avgHp = 130, avgTurns = 15): SimulationResponse {
  const results = [];
  for (let i = 0; i < total; i++) {
    results.push({
      result: i < wins ? "win" as const : "loss" as const,
      turns: avgTurns,
      character_results: [{ final_hp: i < wins ? avgHp : 0, utility1_slot_quantity: 0, utility2_slot_quantity: 0 }],
    });
  }
  return { results };
}

function makeMockApi(response: SimulationResponse): ApiClient {
  const api = {
    simulateFight: mock(() => Promise.resolve(response)),
  } as unknown as ApiClient;
  return api;
}

describe("FightSimulator", () => {
  test("getCacheKey includes level and equipment", () => {
    const char = makeChar();
    const key1 = FightSimulator.getCacheKey(char, "chicken");
    expect(key1).toContain("5"); // level
    expect(key1).toContain("copper_dagger");
    expect(key1).toContain("copper_helmet");
    expect(key1).toContain("chicken");

    // Different monster = different key
    const key2 = FightSimulator.getCacheKey(char, "wolf");
    expect(key2).not.toBe(key1);

    // Different equipment = different key
    const char2 = makeChar({ weapon_slot: "iron_sword" });
    const key3 = FightSimulator.getCacheKey(char2, "chicken");
    expect(key3).not.toBe(key1);

    // Different level = different key
    const char3 = makeChar({ level: 10 });
    const key4 = FightSimulator.getCacheKey(char3, "chicken");
    expect(key4).not.toBe(key1);
  });

  test("simulate calls API and returns computed result", async () => {
    const response = makeSimResponse(90, 100, 130, 15);
    const api = makeMockApi(response);
    const sim = new FightSimulator(api);
    const char = makeChar();

    const result = await sim.simulate(char, "chicken");

    expect(result.winRate).toBe(0.9);
    expect(result.avgTurns).toBe(15);
    expect(api.simulateFight).toHaveBeenCalledTimes(1);
  });

  test("simulate returns cached result on second call", async () => {
    const response = makeSimResponse(95, 100);
    const api = makeMockApi(response);
    const sim = new FightSimulator(api);
    const char = makeChar();

    const result1 = await sim.simulate(char, "chicken");
    const result2 = await sim.simulate(char, "chicken");

    expect(result1).toBe(result2); // same object reference
    expect(api.simulateFight).toHaveBeenCalledTimes(1); // only called once
  });

  test("simulate calls API again for different monster", async () => {
    const response = makeSimResponse(80, 100);
    const api = makeMockApi(response);
    const sim = new FightSimulator(api);
    const char = makeChar();

    await sim.simulate(char, "chicken");
    await sim.simulate(char, "wolf");

    expect(api.simulateFight).toHaveBeenCalledTimes(2);
  });

  test("getCached returns undefined before simulation", () => {
    const api = makeMockApi(makeSimResponse(100, 100));
    const sim = new FightSimulator(api);
    const char = makeChar();

    expect(sim.getCached(char, "chicken")).toBeUndefined();
  });

  test("getCached returns result after simulation", async () => {
    const response = makeSimResponse(95, 100);
    const api = makeMockApi(response);
    const sim = new FightSimulator(api);
    const char = makeChar();

    await sim.simulate(char, "chicken");
    const cached = sim.getCached(char, "chicken");

    expect(cached).toBeDefined();
    expect(cached!.winRate).toBe(0.95);
  });

  test("findBestMonster returns highest-level safe monster", async () => {
    let callCount = 0;
    const api = {
      simulateFight: mock((_simChar: unknown, monster: string) => {
        callCount++;
        // wolf (level 5): 80% win rate — too dangerous
        // chicken (level 1): 95% win rate — safe
        if (monster === "wolf") return Promise.resolve(makeSimResponse(80, 100));
        return Promise.resolve(makeSimResponse(95, 100));
      }),
    } as unknown as ApiClient;

    const gameData = new GameData();
    gameData.load(
      [
        { map_id: 1, name: "Coop", skin: "coop", x: 0, y: 1, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "monster", code: "chicken" } } },
        { map_id: 2, name: "Forest", skin: "forest", x: 1, y: 1, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "monster", code: "wolf" } } },
      ] as GameMap[],
      [],
      [
        { name: "Chicken", code: "chicken", level: 1, type: "normal", hp: 60, attack_fire: 4, attack_earth: 0, attack_water: 0, attack_air: 0, res_fire: 0, res_earth: 0, res_water: 0, res_air: 0, critical_strike: 0, initiative: 0, min_gold: 0, max_gold: 2, drops: [] },
        { name: "Wolf", code: "wolf", level: 5, type: "normal", hp: 120, attack_fire: 0, attack_earth: 8, attack_water: 0, attack_air: 0, res_fire: 0, res_earth: 0, res_water: 0, res_air: 0, critical_strike: 0, initiative: 0, min_gold: 1, max_gold: 5, drops: [] },
      ] as Monster[],
    );

    const sim = new FightSimulator(api);
    const char = makeChar();
    const best = await sim.findBestMonster(char, gameData);

    expect(best).not.toBeNull();
    expect(best!.monster.code).toBe("chicken"); // wolf was too dangerous
    expect(best!.result.winRate).toBe(0.95);
  });

  test("findBestMonster returns null when no monster is safe", async () => {
    const api = {
      simulateFight: mock(() => Promise.resolve(makeSimResponse(50, 100))),
    } as unknown as ApiClient;

    const gameData = new GameData();
    gameData.load(
      [
        { map_id: 1, name: "Coop", skin: "coop", x: 0, y: 1, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "monster", code: "chicken" } } },
      ] as GameMap[],
      [],
      [
        { name: "Chicken", code: "chicken", level: 1, type: "normal", hp: 60, attack_fire: 4, attack_earth: 0, attack_water: 0, attack_air: 0, res_fire: 0, res_earth: 0, res_water: 0, res_air: 0, critical_strike: 0, initiative: 0, min_gold: 0, max_gold: 2, drops: [] },
      ] as Monster[],
    );

    const sim = new FightSimulator(api);
    const char = makeChar();
    const best = await sim.findBestMonster(char, gameData);

    expect(best).toBeNull();
  });

  test("findBestMonster prefers highest-level safe monster", async () => {
    const api = {
      simulateFight: mock((_simChar: unknown, monster: string) => {
        // All safe, should pick highest level
        if (monster === "wolf") return Promise.resolve(makeSimResponse(95, 100, 100, 20));
        return Promise.resolve(makeSimResponse(100, 100, 150, 10));
      }),
    } as unknown as ApiClient;

    const gameData = new GameData();
    gameData.load(
      [
        { map_id: 1, name: "Coop", skin: "coop", x: 0, y: 1, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "monster", code: "chicken" } } },
        { map_id: 2, name: "Forest", skin: "forest", x: 1, y: 1, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "monster", code: "wolf" } } },
      ] as GameMap[],
      [],
      [
        { name: "Chicken", code: "chicken", level: 1, type: "normal", hp: 60, attack_fire: 4, attack_earth: 0, attack_water: 0, attack_air: 0, res_fire: 0, res_earth: 0, res_water: 0, res_air: 0, critical_strike: 0, initiative: 0, min_gold: 0, max_gold: 2, drops: [] },
        { name: "Wolf", code: "wolf", level: 5, type: "normal", hp: 120, attack_fire: 0, attack_earth: 8, attack_water: 0, attack_air: 0, res_fire: 0, res_earth: 0, res_water: 0, res_air: 0, critical_strike: 0, initiative: 0, min_gold: 1, max_gold: 5, drops: [] },
      ] as Monster[],
    );

    const sim = new FightSimulator(api);
    const char = makeChar();
    const best = await sim.findBestMonster(char, gameData);

    expect(best).not.toBeNull();
    expect(best!.monster.code).toBe("wolf"); // highest level that's safe
  });
});
