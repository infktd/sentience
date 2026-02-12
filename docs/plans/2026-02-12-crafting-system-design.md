# Crafting System Design

## Goal

Enable characters to craft items using bank materials, unlocking 5 frozen crafting skills and feeding the equipment system with better gear.

## Decisions

1. **Smart strategy, dumb agent** — Strategy checks bank contents before emitting craft goals. Agent executes withdraw→move→craft atomically in one `executeGoal` call. No mid-action re-evaluation.

2. **Highest-level craftable recipe** — Pick the recipe closest to (but not above) the character's skill level where bank has materials. Best XP per action. Craft 1 at a time so strategy re-evaluates between crafts.

3. **Dual-purpose gathering skills** — When mining/woodcutting/alchemy is the target skill: if bank has enough raw materials to refine (e.g., 10+ copper_ore → copper_bar), craft the intermediate instead of gathering. Otherwise gather. This naturally feeds bars/planks into bank for weaponcrafting/gearcrafting.

## Architecture

### Strategy Changes (`max-all-skills.ts`)

For each skill (lowest first):
- **Gathering skills**: Check if bank has materials for a refining recipe (ore→bar, wood→plank). If yes, emit craft goal. If no, gather as usual.
- **Crafting skills** (weaponcrafting, gearcrafting, jewelrycrafting, cooking): Check bank for highest-level recipe with available materials. If found, emit craft goal. If not, skip.

### GameData Extension (`game-data.ts`)

New method:
```typescript
getCraftableItems(skill: string, maxLevel: number, bankItems: SimpleItem[]): Item[]
```
Returns items craftable for a given skill/level with available bank materials, sorted by craft level descending.

### Agent Enhancement (`agent.ts`)

`executeGoal("craft")` enhanced flow:
1. Look up recipe via `gameData.getItemByCode(goal.item)`
2. Move to bank → withdraw required materials
3. Move to workshop → craft

Atomic execution — no strategy re-evaluation between steps.

### Overlap Handling

Board already tracks `currentAction` and `target` per character. Crafting sets `target` to the skill name. `getOthersTargets` filters it out so other characters skip that skill. No new coordination code needed.

## Not Building

- No multi-depth chain resolution (dual-purpose gathering handles naturally)
- No batch crafting (1 per tick, re-evaluate between)
- No "craft to equip" intelligence (equipment system handles this)
- No recipe prioritization beyond level (no "useful item" scoring)
