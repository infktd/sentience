# NPC System Design

## Goal

Build generic NPC buying infrastructure that works for all NPCs, with strategy logic wired up for the tailor initially.

## NPC Categories

| Type | Location | Currency | Status |
|------|----------|----------|--------|
| Tailor | Permanent (3,3) | Raw materials (wool, cowhide) | Strategy wired |
| Nomadic Merchant | Permanent (3,2) | Gold | Infrastructure only |
| Rune Vendor | Permanent (8,13) | Gold | Infrastructure only |
| Special traders | Permanent locations | Special currencies | Infrastructure only |
| Event merchants | Temporary (poll /events/active) | Gold | Future — needs event polling |

## Architecture

### Infrastructure (generic, all NPCs)
- `NpcItem` type: `{ code, npc, currency, buy_price, sell_price }`
- `ApiClient.buyNpc()`: POST to `/my/{name}/action/npc/buy`
- `GameData`: NPC item cache, `getNpcItemForProduct()` query
- `Goal`: `{ type: "buy_npc"; npc: string; item: string; quantity: number }`
- `Agent.executeGoal("buy_npc")`: withdraw currency → move to NPC → buy

### Strategy (tailor only, for now)
When evaluating a crafting skill:
1. Check `getCraftableItems()` — if craftable, emit craft goal (existing)
2. If not, check recipes for this skill. For each missing material:
   - Is it buyable from an NPC?
   - Does the bank have enough of the NPC's currency?
3. If yes, emit `buy_npc` goal to acquire the missing material
4. Next tick: material is in bank → craft goal fires

### Agent buy_npc Flow (atomic)
1. Look up NPC item for currency requirements
2. If currency is not gold: move to bank → withdraw currency materials
3. Move to NPC map tile
4. Buy item
5. Move to bank → deposit purchased item

## Key Details
- Tailor uses raw materials as currency (wool→cloth), not gold
- Character must have currency items in inventory when buying
- NPC location found via `findMapsWithContent("npc")` filtered by code
- Buy 1 at a time, strategy re-evaluates between purchases
