# Equipment System Design

**Goal:** Automatically equip the best available gear for each character's current activity, swapping when switching between combat and gathering skills.

**Approach:** Event-triggered evaluation (activity type changes), bank-only item pool (no crafting), threshold-based swapping to avoid churn.

---

## Scoring Model

Each equipment slot is scored based on the character's current activity. Score = sum of all effect values on the item that are relevant to that activity.

**Activity → Relevant Effect Codes:**

| Activity | Effect Codes |
|---|---|
| `combat` | `attack_fire`, `attack_water`, `attack_earth`, `attack_air`, `dmg`, `dmg_fire`, `dmg_water`, `dmg_earth`, `dmg_air`, `res_fire`, `res_water`, `res_earth`, `res_air`, `hp`, `critical_strike`, `haste`, `initiative`, `wisdom`, `prospecting` |
| `gathering:mining` | `mining`, `wisdom`, `prospecting`, `haste` |
| `gathering:woodcutting` | `woodcutting`, `wisdom`, `prospecting`, `haste` |
| `gathering:fishing` | `fishing`, `wisdom`, `prospecting`, `haste` |
| `gathering:alchemy` | `alchemy`, `wisdom`, `prospecting`, `haste` |

**Threshold:** Only swap if the candidate scores at least 20% higher than the current item, with a minimum absolute floor of +5 (to avoid swapping for trivial gains like 0 → 1).

---

## Components

### 1. Equipment Evaluator (`src/equipment/evaluator.ts`)

Pure functions, no side effects, no API calls.

- `scoreItem(item: Item, activity: ActivityType): number` — sum relevant effect values
- `shouldSwap(currentItem: Item | null, candidate: Item, activity: ActivityType): { swap: boolean, scoreDiff: number }` — compare scores with threshold
- `ActivityType` — union type: `"combat" | "gathering:mining" | "gathering:woodcutting" | "gathering:fishing" | "gathering:alchemy"`
- `ACTIVITY_EFFECTS` — map of activity type → set of relevant effect codes

### 2. Equipment Manager (`src/equipment/manager.ts`)

Pure decision function. Takes state in, returns recommended changes out.

- `getEquipmentChanges(character: Character, bankItems: SimpleItem[], gameData: GameData, activity: ActivityType): EquipmentChange[]`
- `EquipmentChange` — `{ slot: ItemSlot, unequipCode: string | null, equipCode: string, scoreDiff: number }`

**Logic:**
1. For each equipment slot, determine what's currently equipped (from character state)
2. Scan bank items for equippable alternatives (filter by item type matching slot, character meets level conditions)
3. Score current vs best candidate for the activity
4. Return swaps that pass threshold, sorted by highest score improvement

### 3. Agent Integration (`src/agent/agent.ts`)

**Event trigger:** Track `lastActivityType` on the agent. When the new goal maps to a different activity type, run equipment evaluation.

**Activity mapping from goals:**
- `fight` → `combat`
- `gather` → `gathering:{resource's skill}` (looked up via `gameData.getResourceByCode()`)
- All other goals → no equipment evaluation

**Execution flow when swaps are needed:**
1. Strategy returns goal, agent detects activity type changed
2. Call `getEquipmentChanges()` with character state + board's bank items
3. Update board: `currentAction: "equipping"`, log `"Swapping gear: N changes for {activity}"`
4. Move to nearest bank
5. For each swap: unequip old → deposit old → withdraw new → equip new
6. Update board with new bank state
7. Proceed to goal's target location

### 4. GameData Extension (`src/agent/game-data.ts`)

- Add `items: Map<string, Item>` cache
- Extend `load()` to accept items array
- Add `getItemByCode(code: string): Item | undefined`
- Add `getEquippableItems(): Item[]` — filters to equipment types only

### 5. Boot Sequence (`src/index.ts`)

- Add items to the `Promise.all` fetch alongside maps/resources/monsters
- Pass items into `gameData.load()`

### 6. Type Tightening (`src/types/index.ts`)

- Change `Item.type` from `string` to `ItemType` for compile-time safety

---

## What This Does NOT Include

- **Crafting upgrades** — only uses items already in the bank
- **Loadout presets** — no saved "combat set" or "mining set", just real-time scoring
- **Grand Exchange purchases** — no buying gear
- **Condition evaluation beyond level** — level is the primary equip requirement; complex conditions (achievements, etc.) are skipped for now

---

## Key Design Decisions

1. **Event-triggered, not every tick** — only evaluate gear when activity type changes
2. **20% + 5 absolute threshold** — prevents churn for marginal gains
3. **Bank-only pool** — characters equip from what's available, no crafting
4. **Board shows "equipping" state** — other characters can see when one is gearing up
5. **Sequential swaps** — each slot change is a separate API call with cooldown; accepted cost when the improvement justifies it
