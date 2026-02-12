import { describe, test, expect } from "bun:test";
import { scoreItem, shouldSwap, type ActivityType } from "./evaluator";
import type { Item } from "../types";

function makeItem(code: string, effects: { code: string; value: number }[]): Item {
  return {
    name: code, code, level: 1, type: "weapon", subtype: "sword",
    description: "", tradeable: true,
    effects: effects.map((e) => ({ ...e, description: "" })),
  };
}

describe("scoreItem", () => {
  test("scores combat item with attack and dmg effects", () => {
    const sword = makeItem("fire_sword", [
      { code: "attack_fire", value: 15 },
      { code: "dmg_fire", value: 5 },
    ]);
    expect(scoreItem(sword, "combat")).toBe(20);
  });

  test("scores gathering item for matching skill", () => {
    const pickaxe = makeItem("copper_pickaxe", [
      { code: "mining", value: 10 },
      { code: "attack_earth", value: 5 },
    ]);
    expect(scoreItem(pickaxe, "gathering:mining")).toBe(10);
  });

  test("scores zero for irrelevant effects", () => {
    const sword = makeItem("fire_sword", [
      { code: "attack_fire", value: 15 },
    ]);
    expect(scoreItem(sword, "gathering:fishing")).toBe(0);
  });

  test("includes universal stats for gathering", () => {
    const ring = makeItem("wise_ring", [
      { code: "wisdom", value: 10 },
      { code: "prospecting", value: 5 },
      { code: "haste", value: 3 },
    ]);
    expect(scoreItem(ring, "gathering:mining")).toBe(18);
  });

  test("includes universal stats for combat", () => {
    const ring = makeItem("wise_ring", [
      { code: "wisdom", value: 10 },
      { code: "haste", value: 3 },
    ]);
    expect(scoreItem(ring, "combat")).toBe(13);
  });

  test("handles item with no effects", () => {
    const bare: Item = {
      name: "rock", code: "rock", level: 1, type: "weapon",
      subtype: "blunt", description: "", tradeable: true,
    };
    expect(scoreItem(bare, "combat")).toBe(0);
  });
});

describe("shouldSwap", () => {
  test("recommends swap when candidate scores 20%+ higher", () => {
    const current = makeItem("old_sword", [{ code: "attack_fire", value: 10 }]);
    const candidate = makeItem("new_sword", [{ code: "attack_fire", value: 15 }]);
    const result = shouldSwap(current, candidate, "combat");
    expect(result.swap).toBe(true);
    expect(result.scoreDiff).toBe(5);
  });

  test("rejects swap when improvement is below threshold", () => {
    const current = makeItem("old_sword", [{ code: "attack_fire", value: 10 }]);
    const candidate = makeItem("new_sword", [{ code: "attack_fire", value: 11 }]);
    const result = shouldSwap(current, candidate, "combat");
    expect(result.swap).toBe(false);
  });

  test("recommends swap from null (empty slot)", () => {
    const candidate = makeItem("new_sword", [{ code: "attack_fire", value: 3 }]);
    const result = shouldSwap(null, candidate, "combat");
    expect(result.swap).toBe(true);
  });

  test("equips into empty slot even with low score", () => {
    const candidate = makeItem("junk", [{ code: "attack_fire", value: 2 }]);
    const result = shouldSwap(null, candidate, "combat");
    expect(result.swap).toBe(true);
  });

  test("rejects equip into empty slot when candidate scores zero", () => {
    const candidate = makeItem("junk", [{ code: "mining", value: 5 }]);
    const result = shouldSwap(null, candidate, "combat");
    expect(result.swap).toBe(false);
  });

  test("rejects swap when candidate scores lower", () => {
    const current = makeItem("good_sword", [{ code: "attack_fire", value: 20 }]);
    const candidate = makeItem("bad_sword", [{ code: "attack_fire", value: 5 }]);
    const result = shouldSwap(current, candidate, "combat");
    expect(result.swap).toBe(false);
  });
});
