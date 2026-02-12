# Multi-Character Coordinator Design

## Problem

Five characters operate independently with minimal coordination (only skill-overlap avoidance via `getOthersTargets`). This leads to:

1. **Bank contention**: Two characters see the same 5 iron bars and both try to withdraw them
2. **Duplicate effort**: Multiple characters grinding the same resource when they could pipeline
3. **Inefficient leveling**: All 5 crawl 1-50 independently instead of cooperating (gatherer feeds crafter feeds fighter)
4. **No party combat**: Boss fights require 3 characters but there's no grouping mechanism
5. **No team gear management**: Characters craft individual upgrades instead of maintaining team sets

## Goals

- All 5 characters reach level 50 in all 9 skills
- Get there faster through coordination, not permanent specialization
- Characters rotate roles so everyone levels everything
- Enable 3-character boss fights for combat XP
- Maintain minimum gear sets (5 gathering, 3 combat)
- Sell/recycle surplus gear from XP crafting
- Easy disable flag to fall back to independent behavior

## Architecture

### Coordinator as Game Player

The coordinator is **the player** — it maintains persistent goals, tracks progress across ticks, orchestrates deposits, and knows what materials are FOR. It is not a stateless dispatcher that forgets everything between calls.

#### ActivePlan

The coordinator maintains one active plan at a time. A plan targets a bottleneck skill and decomposes into a recipe chain with material tracking.

```typescript
interface ActivePlan {
  targetSkill: string;           // e.g. "weaponcrafting"
  targetRecipe: string;          // e.g. "copper_dagger" (best recipe for skill/level)
  materialNeeds: MaterialNeed[]; // full bill of materials with sources
  stages: PipelineStage[];       // decomposed work stages
  progress: PlanProgress;        // tracks banked + inFlight + crafted
  status: "active" | "completed";
  mode: "auto" | "manual";       // "auto" = bottleneck-driven, "manual" = explicit target
}

interface MaterialNeed {
  code: string;
  quantityNeeded: number;    // per craft batch
  source: "gather" | "craft" | "monster_drop";
  sourceCode: string;        // resource code, recipe code, or monster code
}

interface PlanProgress {
  banked: Map<string, number>;    // materials confirmed in bank
  inFlight: Map<string, number>;  // materials in character inventories (heading to bank)
  crafted: number;                // completed crafts this plan cycle
}
```

#### Plan Lifecycle

1. **Creation**: Coordinator identifies team's bottleneck skill (lowest average), finds best recipe, decomposes into material needs and pipeline stages.
2. **Execution**: Each `getGoal()` call assigns the character to the most-needed stage based on current progress.
3. **Progress tracking**: On every `getGoal()` call, coordinator reads Character state to update `inFlight` counts and `banked` from board snapshot.
4. **Completion**: Plan completes when the target skill is no longer the team's lowest (bottleneck shift). A new plan is created for the next bottleneck.

### Coordinator Core

```typescript
class Coordinator {
  private board: Board;
  private gameData: GameData;
  private strategy: Strategy;
  private enabled: boolean;
  private characterNames: string[];
  private ledger: ReservationLedger;
  private activePlan: ActivePlan | null;
  private characterStates: Map<string, Character>;  // cached from getGoal() calls
  private assignments: Map<string, Goal>;
  private assignmentKeys: Map<string, string>;

  constructor(
    board: Board,
    gameData: GameData,
    strategy: Strategy,
    options?: { enabled?: boolean; characterNames?: string[] }
  )

  // Called by each agent when ready for work
  getGoal(name: string, state: Character): Goal

  // Called when agent completes/fails a goal (clears reservations)
  reportComplete(name: string): void
}
```

**Integration with Agent**: Agent gets an optional `coordinator` field. In `tick()`:

```typescript
const goal = this.coordinator
  ? this.coordinator.getGoal(this.name, this.state)
  : this.strategy(this.state, boardSnapshot, this.gameData);
```

When `coordinator` is null, behavior is identical to today. Toggle at runtime.

**Not clock-driven**: Each agent calls `getGoal()` on its own cooldown schedule. The coordinator sees the latest board state each time, so decisions are always fresh. No synchronization needed.

### getGoal() Flow

```
getGoal(name, state):
  1. Cache character state (update characterStates map)
  2. Update plan progress:
     - Read bank from board snapshot → update progress.banked
     - Read character inventories from characterStates → update progress.inFlight
  3. Check plan lifecycle:
     - If no plan → create plan from bottleneck
     - If plan completed (bottleneck shifted) → create new plan
  4. Assign character to pipeline stage:
     - Pick most-needed stage based on progress gaps
     - Anti-thrash: prefer current assignment when margin is small
     - Anti-duplication: spread characters across stages
  5. Reserve bank items for craft goals
  6. Return goal
```

### Bank Reservations

The coordinator maintains a `ReservationLedger` to prevent bank contention.

```typescript
class ReservationLedger {
  // Replaces any existing reservation for this character
  reserve(character: string, items: SimpleItem[]): void

  // Returns bank items minus all active reservations
  getAvailable(bankItems: SimpleItem[]): SimpleItem[]

  // Called when character gets a new goal or completes current one
  clear(character: string): void

  // Safety: expire reservations older than 5 minutes (crash recovery)
  expireStale(): void
}
```

**Lifecycle**: Reservation is created when a goal is assigned and cleared when the character reports back for a new goal. One reservation per character at any time. 5-minute safety timeout for crash recovery only — normal operation never hits it.

### Deposit Orchestration

Characters need to deposit gathered/farmed materials to the bank so crafters can use them. Two triggers:

1. **Batch threshold**: Character has 10+ items that the plan needs → assign `deposit_all` goal
2. **Crafter-starved**: A character assigned to craft has insufficient bank materials AND another character's inventory contains what's needed → that character gets a `deposit_all` goal immediately

```
On getGoal(name, state):
  // Check if this character should deposit first
  if (characterHasNeededMaterials(name, state) && shouldDeposit(name, state)):
    return { type: "deposit_all" }
  // ... normal stage assignment
```

**shouldDeposit logic**:
- Count items in inventory that match plan's materialNeeds
- If count >= 10 → deposit (batch threshold)
- If any crafter is starved (assigned to craft but bank < 1x recipe) AND this character has the needed materials → deposit (crafter-starved trigger)

### Resource Pipelines

The coordinator assigns characters to different stages of production chains.

**Example** — team needs weaponcrafting XP:

```
Alice:   gather copper_ore    (mining XP)
Bob:     gather copper_ore    (mining XP)
Charlie: smelt copper_bar     (mining XP, uses Alice/Bob's deposits)
Diana:   craft copper_sword   (weaponcrafting XP, uses Charlie's bars)
Eve:     fight monsters       (combat XP, uses Diana's swords)
```

**Assignment logic**:

1. Plan decomposes target recipe into pipeline stages (gather → refine → craft)
2. Progress tracking identifies which stages need more work (low banked materials)
3. Characters assigned to stages where their personal skill is lowest (most XP benefit)
4. Multiple characters can share a stage (2 gatherers feeding 1 crafter)

**Rotation is state-driven, not timer-driven**: When bank fills with ore, coordinator naturally shifts more characters to smelting. When a character's mining outpaces their cooking, coordinator assigns them to cooking. No explicit rotation timer.

**Anti-thrashing bias**: 30% score discount for staying on current assignment. Character only switches when the state genuinely calls for it.

### Plan Completion via Bottleneck Shift

Plans don't have a fixed target quantity. Instead:

1. Plan targets the team's current bottleneck skill
2. Characters execute the pipeline, gaining XP in various skills
3. On every `getGoal()` call, coordinator recalculates team bottleneck
4. When the target skill is no longer the lowest → plan is "completed"
5. New plan created for the new bottleneck skill

This naturally rotates the team through all skills. If mining was the bottleneck, after enough mining XP, cooking might become the new bottleneck, and the coordinator pivots the whole team.

### Monster Drop Coordination

When a crafting recipe requires monster drops (e.g., wolf_fang from wolves), the plan's `materialNeeds` includes them with `source: "monster_drop"`. The pipeline generates fight stages for these materials, and the coordinator can assign multiple fighters to farm the same monster simultaneously.

The coordinator knows what drops are FOR because the plan tracks the full recipe chain. This means:
- Fighters deposit drops → coordinator sees them in bank → shifts characters to crafting
- If drops are scarce, coordinator assigns more fighters
- If drops are plentiful, coordinator shifts fighters to other stages

### Composing Existing Systems

The coordinator does NOT replace existing game intelligence. It composes it:

| Coordinator decides | Existing system decides |
|---|---|
| WHO gathers | WHAT to gather (`findNeededGatherResource`) |
| WHO crafts | WHAT to craft (`getCraftableItems`, `resolveItemChain`) |
| WHO fights | WHAT to fight (combat simulator, `findBestMonster`) |
| WHO upgrades gear | WHAT gear to upgrade (`findCraftableUpgrade`, `getEquipmentChanges`) |
| WHEN to sell surplus | WHAT to sell and at what price (`findGESellGoal`) |

### Team Gear Quotas

The coordinator maintains minimum gear quotas:

| Activity | Sets | Reason |
|---|---|---|
| Gathering | 5 | All characters may need to gather |
| Combat | 3 | Max 3 in a boss fight simultaneously |

**Quota is a floor, not a target.** Characters craft hundreds of items for XP — the coordinator just ensures:

- Never sell/recycle below the quota floor
- Everything above the floor is surplus (sell on GE, recycle, NPC)
- When the team unlocks a new tier (e.g., iron_pickaxe), craft enough for the quota, then old tier becomes surplus

```typescript
interface GearRegistry {
  getQuota(slot: string, activity: "gathering" | "combat"): number
  getSurplus(bankItems: SimpleItem[]): SimpleItem[]
  getDeficit(bankItems: SimpleItem[]): SimpleItem[]
}
```

### Boss Party Combat

The coordinator groups up to 3 characters for boss monster fights.

**When to form a party:**
- Team combat level sufficient for a boss (simulator says 90%+ win rate with 3 characters)
- At least 3 characters are available (not mid-task, not far away)
- Boss XP/drops justify the coordination cost vs. solo grinding

**How it works:**

1. Coordinator identifies a boss target using the multi-character fight simulator
2. Assigns 3 characters a fight goal with party info: `{ type: "fight", monster: "boss_code", party: ["alice", "bob", "charlie"] }`
3. All 3 move to the boss map independently
4. Initiator (first to arrive) checks board for party member positions
5. Once all 3 are on the same tile, initiator calls `POST /my/{name}/action/fight` with `participants: [other1, other2]`
6. All 3 receive XP, gold, and drops independently

**API**: Existing fight endpoint supports `participants` array (max 2 additional = 3 total). Only boss monsters support multi-character fights (error 486 for non-bosses).

### Future: Manual Mode & Webclient

The `ActivePlan.mode` field supports future manual overrides:

- **`"auto"`** (default): Coordinator picks bottleneck skill and recipe automatically
- **`"manual"`**: External system (webclient admin dashboard) sets explicit `targetSkill` and `targetRecipe`

This enables a future webclient that:
- Displays the game map (like Twitch plays)
- Shows coordinator state (active plan, character assignments, progress)
- Allows manual goal overrides (e.g., "gather food overnight")

No implementation needed now — the `mode` field just ensures the architecture supports it.

## Implementation Phases

### Phase 1: Foundation (DONE)
- Coordinator class with enable/disable toggle
- ReservationLedger for bank contention
- Agent integration (optional coordinator field)
- Anti-duplication (gather + fight dedup; craft handled by reservations)
- 17 coordinator tests, 12 reservation tests passing

### Phase 2: Pipelines (DONE — needs goal planner rewrite)
- `getTeamBottleneck()` — identifies lowest average skill across team
- `buildPipelineStages()` — decomposes skill into gather/craft/fight stages
- `assignCharacterToStage()` — scores stages by skill level + coverage + anti-thrash
- Pipeline wired into Coordinator with fallback to strategy
- 15 pipeline tests passing
- **Needs rewrite**: Current implementation is stateless (forgets between calls). Must be upgraded to ActivePlan model with persistent progress tracking.

### Phase 2.5: Goal Planner Rewrite
- ActivePlan with materialNeeds, progress tracking, plan lifecycle
- Character state caching in coordinator
- Deposit orchestration (batch threshold + crafter-starved)
- Plan completion via bottleneck shift detection
- Rewrite coordinator to maintain persistent plan state
- Update pipeline tests for new plan-aware behavior

### Phase 3: Boss Combat
- Multi-character fight simulator integration
- Party goal type with rendezvous logic
- Initiator/participant agent behavior

### Phase 4: Gear Management
- GearRegistry with quotas (5 gathering, 3 combat)
- Surplus detection and sell/recycle
- Tier upgrade lifecycle (craft new tier quota, sell old tier)

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Coordinator bug stalls all 5 characters | Toggle to disable — falls back to independent strategies instantly |
| Bank reservation leak (agent crashes) | 5-minute safety timeout auto-expires stale reservations |
| Thrashing between roles | Anti-thrash bias prefers keeping current assignment (30% discount) |
| Boss rendezvous timeout | Fallback: if party doesn't assemble in N ticks, coordinator reassigns to solo combat |
| Coordinator performance | Plan is cheap (reads board + runs existing GameData queries). No heavy computation. |
| Plan never completes | Bottleneck shift is relative — even slow progress eventually shifts the bottleneck |
| Deposit storms (all characters deposit at once) | Only deposit when batch threshold met OR crafter is starved — not eagerly |

## Testing Strategy

- Unit test ActivePlan creation and progress tracking
- Unit test deposit orchestration triggers
- Unit test plan completion (bottleneck shift detection)
- Unit test Coordinator.getGoal() with various team states and plan progress
- Unit test ReservationLedger (reserve, clear, expire, available calculation)
- Unit test pipeline stage building and character assignment
- Integration test: 5 mock agents with coordinator — verify no bank contention
- Integration test: plan lifecycle from creation through completion to new plan
- All existing tests continue passing (coordinator is additive, not replacing)
