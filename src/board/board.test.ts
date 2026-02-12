import { describe, test, expect } from "bun:test";
import { Board } from "./board";

describe("Board", () => {
  test("initializes with empty state", () => {
    const board = new Board();
    expect(board.getSnapshot()).toEqual({
      characters: {},
      bank: { items: [], gold: 0, lastUpdated: 0 },
      geOrders: [],
    });
  });

  test("updates character state", () => {
    const board = new Board();
    board.updateCharacter("alice", {
      currentAction: "gathering",
      target: "copper_ore",
      position: { x: 1, y: 2 },
      skillLevels: { mining: 5 },
      inventoryUsed: 3,
      inventoryMax: 20,
    });
    const snapshot = board.getSnapshot();
    expect(snapshot.characters["alice"].currentAction).toBe("gathering");
    expect(snapshot.characters["alice"].target).toBe("copper_ore");
  });

  test("updates bank state", () => {
    const board = new Board();
    board.updateBank([{ code: "copper_ore", quantity: 50 }], 1000);
    const snapshot = board.getSnapshot();
    expect(snapshot.bank.items).toEqual([{ code: "copper_ore", quantity: 50 }]);
    expect(snapshot.bank.gold).toBe(1000);
    expect(snapshot.bank.lastUpdated).toBeGreaterThan(0);
  });

  test("getSnapshot returns a deep copy", () => {
    const board = new Board();
    board.updateCharacter("bob", {
      currentAction: "idle",
      target: "",
      position: { x: 0, y: 0 },
      skillLevels: {},
      inventoryUsed: 0,
      inventoryMax: 20,
    });
    const snap1 = board.getSnapshot();
    snap1.characters["bob"].currentAction = "mutated";
    const snap2 = board.getSnapshot();
    expect(snap2.characters["bob"].currentAction).toBe("idle");
  });

  test("getOtherCharacters excludes self", () => {
    const board = new Board();
    board.updateCharacter("alice", {
      currentAction: "gathering",
      target: "copper_ore",
      position: { x: 0, y: 0 },
      skillLevels: {},
      inventoryUsed: 0,
      inventoryMax: 20,
    });
    board.updateCharacter("bob", {
      currentAction: "fighting",
      target: "chicken",
      position: { x: 1, y: 1 },
      skillLevels: {},
      inventoryUsed: 0,
      inventoryMax: 20,
    });
    const others = board.getOtherCharacters("alice");
    expect(others).toHaveLength(1);
    expect(others[0].currentAction).toBe("fighting");
  });
});
