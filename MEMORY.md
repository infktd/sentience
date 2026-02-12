# Artifacts MMO Bot - Project Memory

## Project Overview
- Bun-based bot for Artifacts MMO game, automating 5 characters
- Pure TypeScript, no external deps, single process
- API: https://api.artifactsmmo.com (OpenAPI spec at /openapi.json)

## Architecture
- Independent character agents with shared read-only state board
- Strategy: `maxAllSkills` - picks lowest skill, avoids overlap via board
- Agent loop: evaluate → execute → update board → wait cooldown → repeat
- Survival overrides: rest at <40% HP, deposit when inventory nearly full

## Key Files
- `src/index.ts` - Entry point, loads maps/resources/monsters/items/npcItems
- `src/config.ts` - Loads API token from .env
- `src/types/index.ts` - All game types (ItemType union, CraftInfo, etc.)
- `src/api/client.ts` - HTTP client with auth, cooldowns, retries
- `src/board/board.ts` - Shared state board (deep-copy snapshots)
- `src/agent/agent.ts` - Character agent with action loop
- `src/agent/game-data.ts` - Game data cache + getCraftableItems query
- `src/strategy/max-all-skills.ts` - Balanced skill training strategy
- `src/strategy/task-focused.ts` - Task-rushing strategy (falls back to maxAllSkills)
- `src/equipment/evaluator.ts` - Activity-based item scoring
- `src/equipment/manager.ts` - Slot-by-slot equipment upgrade detection
- `src/combat/simulator.ts` - Fight simulator with cache (members-only API)
- `src/logger/logger.ts` - Per-character JSON line logger

## Systems Built
- **Equipment**: Auto-swaps gear on activity change. Scores by combat/gathering effects. 20% threshold.
- **Crafting**: Strategy checks bank for materials, emits craft goals. Gathering skills dual-purpose (refine when bank has raws). Agent does atomic withdraw→move→craft.
- **Inventory**: Deposits when total quantity >= max-5 OR 20 distinct slots. Game uses total quantity cap (100 + 2/level), NOT slot count.
- **NPC Buy**: Generic infrastructure for all NPCs, strategy wired for tailor only. Agent does atomic withdraw currency→move to NPC→buy→deposit. Tailor uses raw materials as currency (wool→cloth, cowhide→hard_leather), not gold. Some merchants are event-based (fish/timber/herbal/gemstone).
- **Combat Safety**: Fight simulator (`src/combat/simulator.ts`) calls `POST /simulation/fight_simulation` (members-only API). Caches by (level+equipment+monster). Agent checks win rate >= 90% before fighting; downgrades to safer monster if needed. Shared simulator instance across all agents.
- **Task System**: Layer 1 (agent): auto-complete/trade/accept/exchange coins as override. Layer 2: `taskFocused` strategy prioritizes task targets (fight monsters, gather/craft items). Falls back to maxAllSkills. Two tasks_masters: monsters at (1,2), items at (4,13). Tasks give gold + tasks_coin; 6 coins = random reward exchange. Item tasks need `POST /task/trade` to turn in items — monster tasks auto-track progress on kill. deposit_all skips task items for active item tasks.
- **Utility Items**: Agent restocks utility potions (health restore, damage boost) before fights. `getBestUtilityItems` picks best potions from bank, prioritizing health restore. Equip API supports `quantity` for stacking utilities (max 100). Simulator already accounts for utility items in combat predictions.
- **Smart Gathering**: `findNeededGatherResource` checks what crafting recipes need materials, gathers those instead of blindly picking highest-level resource. Prefers resource that feeds highest-level recipe.
- **Recipe Chain Resolution**: `resolveItemChain()` recursively walks dependency trees (ore→bar→sword) to find the first actionable step. Handles craft (with skill check), gather, NPC buy, and monster drops. Visited set prevents circular deps. Used by `taskFocused` strategy; `maxAllSkills` uses implicit chains via skill rotation.

## Lessons Learned
- **inventory_max_items is total quantity**: Not slot count. Game has 20-slot hard cap AND total quantity limit (100+2/level).
- **Bun fetch type includes `preconnect`**: Mock casts need `as unknown as typeof fetch`.
- **Writing files directly is fastest**: Use Write tool, not subagents for file creation.
- **Craft recipes have intermediate chains**: ore→bar→weapon. Handled by dual-purpose gathering skills (refine when bank has enough raws).
- **Board target must match strategy skill names**: getTargetSkill returns actual craft skill (e.g., "weaponcrafting") for overlap avoidance.
- **ALL actions blocked during cooldown**: Error 499. Cannot move, gather, or do anything while on cooldown. No action overlapping possible. Client now parses 499 responses to track cooldown, and initializes from character state on startup.
- **Item tasks need task/trade**: Unlike monster tasks (auto-progress), item tasks require `POST /my/{name}/action/task/trade` with {code, quantity} to turn in items. Must be at the tasks_master map tile.
- **Utility vs Consumable items**: `type: "utility"` = potions equipped in utility1/2 slots, auto-used in combat. `type: "consumable"` = food used from inventory. Different systems entirely.

## Autonomy Expansion (v2)
- **Error Recovery**: `Agent.getErrorRecovery()` maps API error codes (475→task_complete, 497→deposit_all, 478/493/473/598/486/490→skip). Only unknown errors use consecutive counter → idle.
- **Event Awareness**: `GameData.applyEvents()` merges event maps. `getAllMaps()` private getter combines base + event maps. Polled every 5min in index.ts. `ActiveEvent` type in types.
- **Task Intelligence**: `isTaskAchievable()` checks monster level / item chain. `evaluateBestTaskType()` picks monsters vs items. `task_cancel` goal type. Smart `task_new` picks preferred task master. `TaskDefinition` type + `loadTasks()`.
- **Skill Balancing**: Crafting branch in `maxAllSkills` uses `resolveItemChain()` when no materials, instead of `continue`. Character goes mine→smelt→craft for missing craft skills.
- **Equipment Self-Crafting**: `findCraftableUpgrade()` scans equipment slots, scores craftable items vs current gear (20% threshold), returns craft/gather chain goal. Called as fallback before idle in `maxAllSkills`.
- **Bank-Aware Startup**: `index.ts` fetches bank items + gold via `getBankItems`/`getBank` at startup before agents start. Board is pre-populated so first strategy decisions use real bank data.
- **Bank Updated on Withdrawals**: All 4 `withdrawItems` call sites in agent.ts now call `board.updateBank()` with the returned bank state, keeping the shared board accurate.
- **Multi-Activity Gear Upgrades**: `findCraftableUpgrade()` accepts `ActivityType | ActivityType[]`. `maxAllSkills` passes `["combat", "gathering:<lowest_skill>"]` so characters get gear upgrades for gathering too.

## Batch Operations + Grand Exchange (v3)
- **Batch Withdrawals**: Craft material withdrawal uses single `withdrawItems(name, items[])` call instead of per-material loop. Equipment swaps use phase-based approach: unequip all → batch deposit → batch withdraw → equip all. Utility restocks similarly batched.
- **Grand Exchange Types**: `GEOrder`, `GEOrderHistory`, `GEOrderCreated`, `GETransaction`, `GEBuyData`, `GESellData`, `GECancelData` in types. `buy_ge` and `sell_ge` goal types.
- **GE API Client**: `getGEOrders(code?, page)`, `getGEOrder(id)`, `buyGE(name, orderId, qty)`, `sellGE(name, code, qty, price)`, `cancelGE(name, orderId)`.
- **GE Board Cache**: `BoardSnapshot.geOrders: GEOrder[]`. `Board.updateGEOrders()`. Polled every 2min in index.ts.
- **GE Buy**: `findGEBuyGoal()` in GameData filters by item code, sorts price asc, caps by budget. Strategy falls back to GE buy when `resolveItemChain` fails for crafting materials. Agent does: withdraw gold → move to GE → buy order → deposit items.
- **GE Sell**: `findGESellGoal()` finds excess bank items (qty > 10, tradeable, not currency, not recipe material). Strategy uses as last fallback before idle. Agent does: withdraw items → move to GE → create sell order. 3% tax applies.
- **GE Error Codes**: 434 (insufficient order qty), 435 (self-trade), 436 (tx in progress), 492 (insufficient gold) → all skip.

## Test Status
- 149 tests passing across 11 files, 277 expect() calls
- `bunx tsc --noEmit` passes with 0 errors
