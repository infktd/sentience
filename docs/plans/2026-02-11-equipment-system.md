# Equipment System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Auto-equip best available gear based on current activity (combat vs per-skill gathering), with threshold-based swapping to avoid churn.

**Architecture:** Pure scoring functions evaluate items per activity type. Equipment manager recommends changes. Agent triggers evaluation on activity type transitions and executes swaps at the bank. GameData extended to cache item details.

**Tech Stack:** Bun runtime, TypeScript, no external dependencies.

---

## Story 1: Tighten Item.type to ItemType

**Files:**
- Modify: `src/types/index.ts:339-350`

**Step 1: Change Item.type from string to ItemType**

```typescript
export interface Item {
  name: string;
  code: string;
  level: number;
  type: ItemType;
  subtype: string;
  description: string;
  conditions?: Condition[];
  effects?: SimpleEffect[];
  craft?: CraftInfo | null;
  tradeable: boolean;
}
```

**Step 2: Verify compilation**

Run: `bunx tsc --noEmit`
Expected: no errors

**Step 3: Verify tests still pass**

Run: `bun test`
Expected: all 26 tests pass

**Step 4: Commit**

```bash
git add src/types/index.ts
git commit -m "refactor: tighten Item.type to ItemType union"
```

---

## Story 2: Extend GameData to cache items

**Files:**
- Modify: `src/agent/game-data.ts`
- Modify: `src/agent/game-data.test.ts`

**Step 1: Write failing tests for item cache**

Add to `src/agent/game-data.test.ts`:

```typescript
import type { GameMap, Resource, Monster, Item } from "../types";

// ... existing tests ...

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
```

**Step 2: Run tests to verify they fail**

Run: `bun test src/agent/game-data.test.ts`
Expected: FAIL - load() signature mismatch

**Step 3: Update GameData to support items**

Modify `src/agent/game-data.ts`:

```typescript
import type { GameMap, Resource, Monster, Item, ItemType } from "../types";

const EQUIPMENT_TYPES: Set<ItemType> = new Set([
  "weapon", "shield", "helmet", "body_armor", "leg_armor", "boots",
  "ring", "amulet", "artifact", "rune", "bag",
]);

export class GameData {
  private maps: GameMap[] = [];
  private resources: Map<string, Resource> = new Map();
  private monsters: Map<string, Monster> = new Map();
  private items: Map<string, Item> = new Map();

  load(maps: GameMap[], resources: Resource[], monsters: Monster[], items: Item[] = []): void {
    this.maps = maps;
    for (const r of resources) this.resources.set(r.code, r);
    for (const m of monsters) this.monsters.set(m.code, m);
    for (const i of items) this.items.set(i.code, i);
  }

  // ... all existing methods unchanged ...

  getItemByCode(code: string): Item | undefined {
    return this.items.get(code);
  }

  getEquippableItems(): Item[] {
    return [...this.items.values()].filter((i) => EQUIPMENT_TYPES.has(i.type));
  }
}
```

Note: `load()` uses a default parameter `items: Item[] = []` so all existing callers (tests and index.ts) continue to work without changes.

**Step 4: Run tests**

Run: `bun test src/agent/game-data.test.ts`
Expected: 6 tests pass (4 existing + 2 new)

**Step 5: Run full suite + type check**

Run: `bun test && bunx tsc --noEmit`
Expected: all pass, no errors

**Step 6: Commit**

```bash
git add src/agent/game-data.ts src/agent/game-data.test.ts
git commit -m "feat: extend GameData to cache items with equipment filtering"
```

---

## Story 3: Equipment Evaluator

**Files:**
- Create: `src/equipment/evaluator.ts`
- Create: `src/equipment/evaluator.test.ts`

**Step 1: Write failing tests**

```typescript
// src/equipment/evaluator.test.ts
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

  test("rejects swap from null when candidate scores below absolute floor", () => {
    const candidate = makeItem("junk", [{ code: "attack_fire", value: 2 }]);
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
```

**Step 2: Run tests to verify they fail**

Run: `bun test src/equipment/evaluator.test.ts`
Expected: FAIL - module not found

**Step 3: Implement the evaluator**

```typescript
// src/equipment/evaluator.ts
import type { Item } from "../types";

export type ActivityType =
  | "combat"
  | "gathering:mining"
  | "gathering:woodcutting"
  | "gathering:fishing"
  | "gathering:alchemy";

const COMBAT_EFFECTS = new Set([
  "attack_fire", "attack_water", "attack_earth", "attack_air",
  "dmg", "dmg_fire", "dmg_water", "dmg_earth", "dmg_air",
  "res_fire", "res_water", "res_earth", "res_air",
  "hp", "critical_strike", "haste", "initiative",
  "wisdom", "prospecting",
]);

const GATHERING_UNIVERSAL = new Set(["wisdom", "prospecting", "haste"]);

const GATHERING_EFFECTS: Record<string, Set<string>> = {
  "gathering:mining": new Set(["mining", ...GATHERING_UNIVERSAL]),
  "gathering:woodcutting": new Set(["woodcutting", ...GATHERING_UNIVERSAL]),
  "gathering:fishing": new Set(["fishing", ...GATHERING_UNIVERSAL]),
  "gathering:alchemy": new Set(["alchemy", ...GATHERING_UNIVERSAL]),
};

function getRelevantEffects(activity: ActivityType): Set<string> {
  if (activity === "combat") return COMBAT_EFFECTS;
  return GATHERING_EFFECTS[activity] ?? new Set();
}

const SWAP_PERCENT_THRESHOLD = 0.2;
const SWAP_ABSOLUTE_FLOOR = 5;

export function scoreItem(item: Item, activity: ActivityType): number {
  const relevant = getRelevantEffects(activity);
  if (!item.effects) return 0;
  return item.effects
    .filter((e) => relevant.has(e.code))
    .reduce((sum, e) => sum + e.value, 0);
}

export function shouldSwap(
  current: Item | null,
  candidate: Item,
  activity: ActivityType
): { swap: boolean; scoreDiff: number } {
  const currentScore = current ? scoreItem(current, activity) : 0;
  const candidateScore = scoreItem(candidate, activity);
  const diff = candidateScore - currentScore;

  if (diff <= 0) return { swap: false, scoreDiff: diff };

  // Must exceed both percentage threshold and absolute floor
  const percentImprovement = currentScore > 0 ? diff / currentScore : Infinity;
  const meetsPercent = percentImprovement >= SWAP_PERCENT_THRESHOLD;
  const meetsFloor = candidateScore >= SWAP_ABSOLUTE_FLOOR;

  return { swap: meetsPercent && meetsFloor, scoreDiff: diff };
}
```

**Step 4: Run tests**

Run: `bun test src/equipment/evaluator.test.ts`
Expected: 11 tests pass

**Step 5: Type check**

Run: `bunx tsc --noEmit`
Expected: no errors

**Step 6: Commit**

```bash
git add src/equipment/evaluator.ts src/equipment/evaluator.test.ts
git commit -m "feat: add equipment evaluator with activity-based scoring"
```

---

## Story 4: Equipment Manager

**Files:**
- Create: `src/equipment/manager.ts`
- Create: `src/equipment/manager.test.ts`

**Step 1: Write failing tests**

```typescript
// src/equipment/manager.test.ts
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
```

**Step 2: Run tests to verify they fail**

Run: `bun test src/equipment/manager.test.ts`
Expected: FAIL - module not found

**Step 3: Implement the manager**

```typescript
// src/equipment/manager.ts
import type { Character, Item, SimpleItem, ItemSlot, ItemType } from "../types";
import type { GameData } from "../agent/game-data";
import { scoreItem, shouldSwap, type ActivityType } from "./evaluator";

export interface EquipmentChange {
  slot: ItemSlot;
  unequipCode: string | null;
  equipCode: string;
  scoreDiff: number;
}

const SLOT_TO_ITEM_TYPE: Record<string, ItemType> = {
  weapon: "weapon",
  shield: "shield",
  helmet: "helmet",
  body_armor: "body_armor",
  leg_armor: "leg_armor",
  boots: "boots",
  ring1: "ring",
  ring2: "ring",
  amulet: "amulet",
  artifact1: "artifact",
  artifact2: "artifact",
  artifact3: "artifact",
  rune: "rune",
  bag: "bag",
};

const CHARACTER_SLOT_FIELDS: Record<string, keyof Character> = {
  weapon: "weapon_slot",
  shield: "shield_slot",
  helmet: "helmet_slot",
  body_armor: "body_armor_slot",
  leg_armor: "leg_armor_slot",
  boots: "boots_slot",
  ring1: "ring1_slot",
  ring2: "ring2_slot",
  amulet: "amulet_slot",
  artifact1: "artifact1_slot",
  artifact2: "artifact2_slot",
  artifact3: "artifact3_slot",
  rune: "rune_slot",
  bag: "bag_slot",
};

function getEquippedCode(character: Character, slot: string): string {
  const field = CHARACTER_SLOT_FIELDS[slot];
  if (!field) return "";
  return character[field] as string;
}

export function getEquipmentChanges(
  character: Character,
  bankItems: SimpleItem[],
  gameData: GameData,
  activity: ActivityType
): EquipmentChange[] {
  const changes: EquipmentChange[] = [];

  // Build a set of item codes available in the bank
  const bankCodes = new Set(bankItems.map((i) => i.code));

  for (const [slot, itemType] of Object.entries(SLOT_TO_ITEM_TYPE)) {
    const currentCode = getEquippedCode(character, slot);
    const currentItem = currentCode ? gameData.getItemByCode(currentCode) ?? null : null;

    // Find best candidate from bank for this slot
    let bestCandidate: Item | null = null;
    let bestScore = -1;

    for (const bankItem of bankItems) {
      const item = gameData.getItemByCode(bankItem.code);
      if (!item) continue;
      if (item.type !== itemType) continue;
      if (item.level > character.level) continue;

      const score = scoreItem(item, activity);
      if (score > bestScore) {
        bestScore = score;
        bestCandidate = item;
      }
    }

    if (!bestCandidate) continue;

    const result = shouldSwap(currentItem, bestCandidate, activity);
    if (result.swap) {
      changes.push({
        slot: slot as ItemSlot,
        unequipCode: currentCode || null,
        equipCode: bestCandidate.code,
        scoreDiff: result.scoreDiff,
      });
    }
  }

  // Sort by highest improvement first
  changes.sort((a, b) => b.scoreDiff - a.scoreDiff);
  return changes;
}
```

**Step 4: Run tests**

Run: `bun test src/equipment/manager.test.ts`
Expected: 5 tests pass

**Step 5: Type check**

Run: `bunx tsc --noEmit`
Expected: no errors

**Step 6: Commit**

```bash
git add src/equipment/manager.ts src/equipment/manager.test.ts
git commit -m "feat: add equipment manager with slot-by-slot upgrade detection"
```

---

## Story 5: Agent integration

**Files:**
- Modify: `src/agent/agent.ts`
- Modify: `src/agent/agent.test.ts`

**Step 1: Write failing tests for activity type detection**

Add to `src/agent/agent.test.ts`:

```typescript
import { Agent, type Strategy } from "./agent";

// ... existing tests ...

test("getActivityType returns combat for fight goals", () => {
  expect(Agent.getActivityType({ type: "fight", monster: "chicken" }, undefined)).toBe("combat");
});

test("getActivityType returns gathering skill for gather goals", () => {
  const resource = { name: "Copper Rocks", code: "copper_rocks", skill: "mining" as const, level: 1, drops: [] };
  expect(Agent.getActivityType({ type: "gather", resource: "copper_rocks" }, resource)).toBe("gathering:mining");
});

test("getActivityType returns null for non-equipment goals", () => {
  expect(Agent.getActivityType({ type: "rest" }, undefined)).toBeNull();
  expect(Agent.getActivityType({ type: "deposit_all" }, undefined)).toBeNull();
  expect(Agent.getActivityType({ type: "idle", reason: "test" }, undefined)).toBeNull();
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test src/agent/agent.test.ts`
Expected: FAIL - getActivityType not found

**Step 3: Add getActivityType and equipment integration to Agent**

Add imports at top of `src/agent/agent.ts`:

```typescript
import type { ActivityType } from "../equipment/evaluator";
import { getEquipmentChanges } from "../equipment/manager";
```

Add `lastActivityType` field to the Agent class:

```typescript
private lastActivityType: ActivityType | null = null;
```

Add the static method:

```typescript
static getActivityType(goal: Goal, resource?: { skill: string }): ActivityType | null {
  if (goal.type === "fight") return "combat";
  if (goal.type === "gather") {
    if (resource?.skill) return `gathering:${resource.skill}` as ActivityType;
    return null;
  }
  return null;
}
```

Add equipment swap method:

```typescript
private async handleEquipmentSwaps(activity: ActivityType): Promise<void> {
  const bankItems = this.board.getSnapshot().bank.items;
  const changes = getEquipmentChanges(this.state!, bankItems, this.gameData, activity);

  if (changes.length === 0) return;

  this.logger.info("Swapping gear", {
    activity,
    changes: changes.map((c) => ({ slot: c.slot, from: c.unequipCode, to: c.equipCode })),
  });

  // Update board to show equipping state
  this.board.updateCharacter(this.name, {
    currentAction: "equipping",
    target: activity,
    position: { x: this.state!.x, y: this.state!.y },
    skillLevels: this.getSkillLevels(),
    inventoryUsed: this.state!.inventory.filter((s) => s.quantity > 0).length,
    inventoryMax: this.state!.inventory_max_items,
  });

  // Move to bank
  const bank = this.gameData.findNearestBank(this.state!.x, this.state!.y);
  if (!bank) {
    this.logger.error("No bank found for equipment swap");
    return;
  }
  if (this.state!.x !== bank.x || this.state!.y !== bank.y) {
    const moveResult = await this.api.move(this.name, bank.x, bank.y);
    this.state = moveResult.character;
  }

  // Execute swaps
  for (const change of changes) {
    if (change.unequipCode) {
      this.state = await this.api.unequip(this.name, change.slot);
      await this.api.depositItems(this.name, [{ code: change.unequipCode, quantity: 1 }]);
    }
    await this.api.withdrawItems(this.name, [{ code: change.equipCode, quantity: 1 }]);
    this.state = await this.api.equip(this.name, change.equipCode, change.slot);
  }

  this.syncBoard();
}
```

In the `tick()` method, after deciding the goal and before executing, add the equipment check:

```typescript
// After stuck detection block, before "// Update board with current intent":

// Equipment evaluation on activity type change
const resource = goal.type === "gather"
  ? this.gameData.getResourceByCode(goal.resource)
  : undefined;
const activityType = Agent.getActivityType(goal, resource);
if (activityType && activityType !== this.lastActivityType) {
  try {
    await this.handleEquipmentSwaps(activityType);
  } catch (err) {
    this.logger.error("Equipment swap failed", { error: String(err) });
  }
  this.lastActivityType = activityType;
}
```

**Step 4: Run tests**

Run: `bun test src/agent/agent.test.ts`
Expected: 6 tests pass (3 existing + 3 new)

**Step 5: Full suite + type check**

Run: `bun test && bunx tsc --noEmit`
Expected: all pass, no errors

**Step 6: Commit**

```bash
git add src/agent/agent.ts src/agent/agent.test.ts
git commit -m "feat: integrate equipment swapping into agent loop"
```

---

## Story 6: Boot sequence - load items

**Files:**
- Modify: `src/index.ts`

**Step 1: Add items to boot fetch**

Update the import line:

```typescript
import type { GameMap, Resource, Monster, Item } from "./types";
```

Update the `Promise.all` block:

```typescript
const [maps, resources, monsters, items] = await Promise.all([
  fetchAllPages<GameMap>((page) => api.getMaps(page)),
  fetchAllPages<Resource>((page) => api.getResources(page)),
  fetchAllPages<Monster>((page) => api.getMonsters(page)),
  fetchAllPages<Item>((page) => api.getItems(page)),
]);
gameData.load(maps, resources, monsters, items);
console.log(
  `Game data loaded: ${maps.length} maps, ${resources.length} resources, ${monsters.length} monsters, ${items.length} items`
);
```

**Step 2: Type check**

Run: `bunx tsc --noEmit`
Expected: no errors

**Step 3: Run full test suite**

Run: `bun test`
Expected: all tests pass

**Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: load items at boot for equipment system"
```

---

## Execution Checklist

| Story | Description |
|-------|-------------|
| 1 | Tighten Item.type to ItemType |
| 2 | Extend GameData to cache items |
| 3 | Equipment Evaluator (score + threshold) |
| 4 | Equipment Manager (slot-by-slot recommendations) |
| 5 | Agent integration (activity detection + swap execution) |
| 6 | Boot sequence - load items |
