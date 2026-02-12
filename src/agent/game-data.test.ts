import { describe, test, expect } from "bun:test";
import { GameData } from "./game-data";
import type { GameMap, Resource, Monster } from "../types";

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
});
