import type { Character, Goal, SimpleItem } from "../types";
import type { Board, BoardSnapshot } from "../board/board";
import type { GameData } from "../agent/game-data";
import type { Strategy } from "../agent/agent";
import type { FightSimulator } from "../combat/simulator";
import { ReservationLedger } from "./reservation-ledger";
import { getTeamBottleneck, assignCharacterToStage } from "./pipeline";
import {
  buildActivePlan,
  updatePlanProgress,
  shouldCompletePlan,
  shouldDeposit,
  type ActivePlan,
} from "./goal-planner";

interface CoordinatorOptions {
  enabled?: boolean;
  characterNames?: string[];
  simulator?: FightSimulator;
}

export class Coordinator {
  private board: Board;
  private gameData: GameData;
  private strategy: Strategy;
  private enabled: boolean;
  private characterNames: string[];
  private ledger = new ReservationLedger();
  private assignments = new Map<string, Goal>();
  private assignmentKeys = new Map<string, string>(); // name → stage key for pipeline tracking
  private activePlan: ActivePlan | null = null;
  private characterStates = new Map<string, Character>();
  private simulator: FightSimulator | null = null;
  private partyGoal: { monster: string; party: string[] } | null = null;

  constructor(
    board: Board,
    gameData: GameData,
    strategy: Strategy,
    options?: CoordinatorOptions
  ) {
    this.board = board;
    this.gameData = gameData;
    this.strategy = strategy;
    this.enabled = options?.enabled ?? true;
    this.characterNames = options?.characterNames ?? [];
    this.simulator = options?.simulator ?? null;
  }

  getGoal(name: string, state: Character): Goal {
    // Clear previous reservation for this character (will be replaced)
    this.ledger.clear(name);

    // Cache character state
    this.characterStates.set(name, state);

    // Build adjusted snapshot with reservations applied
    const rawSnapshot = this.board.getSnapshot();
    const adjustedSnapshot = this.adjustSnapshot(rawSnapshot);

    let goal: Goal;

    // Try pipeline planning when enabled with known team
    if (this.enabled && this.characterNames.length > 0) {
      goal = this.planWithPipeline(name, state, adjustedSnapshot);
    } else {
      goal = this.planWithStrategy(name, state, adjustedSnapshot);
    }

    // Reserve bank items for craft goals
    const reservation = this.computeReservation(goal);
    if (reservation.length > 0) {
      this.ledger.reserve(name, reservation);
    }

    // Track assignment
    this.assignments.set(name, goal);

    return goal;
  }

  reportComplete(name: string): void {
    this.ledger.clear(name);
    this.assignments.delete(name);
    this.assignmentKeys.delete(name);
  }

  getAssignment(name: string): Goal | null {
    return this.assignments.get(name) ?? null;
  }

  getAssignedTargets(): Set<string> {
    const targets = new Set<string>();
    for (const goal of this.assignments.values()) {
      const key = this.goalTargetKey(goal);
      if (key) targets.add(key);
    }
    return targets;
  }

  getActivePlan(): ActivePlan | null {
    return this.activePlan;
  }

  private planWithPipeline(name: string, state: Character, snapshot: BoardSnapshot): Goal {
    // Build team character states from board + current state
    const teamCharacters = this.buildTeamCharacters(name, state, snapshot);
    if (teamCharacters.length === 0) {
      return this.planWithStrategy(name, state, snapshot);
    }

    // Manage ActivePlan lifecycle
    this.managePlanLifecycle(teamCharacters, snapshot);

    if (!this.activePlan) {
      // Couldn't create a plan — fall back to strategy
      return this.planWithStrategy(name, state, snapshot);
    }

    // Check if party is active — return party fight goal
    if (this.partyGoal) {
      return { type: "fight", monster: this.partyGoal.monster, party: this.partyGoal.party };
    }

    // Try to form a boss party when plan targets combat (async — sets partyGoal for next tick)
    if (this.activePlan.targetSkill === "combat" && this.simulator) {
      this.tryFormParty(teamCharacters);
    }

    // Update plan progress
    updatePlanProgress(this.activePlan, snapshot.bank.items, this.characterStates);

    // Check deposit trigger before stage assignment
    if (shouldDeposit(this.activePlan, name, state, this.assignmentKeys, snapshot.bank.items)) {
      return { type: "deposit_all" };
    }

    // Assign character to pipeline stage
    if (this.activePlan.stages.length === 0) {
      return this.planWithStrategy(name, state, snapshot);
    }

    const previousKey = this.assignmentKeys.get(name);
    const goal = assignCharacterToStage(
      name,
      state,
      this.activePlan.stages,
      this.assignmentKeys,
      previousKey
    );

    if (goal.type !== "idle") {
      const key = this.goalStageKey(goal);
      if (key) this.assignmentKeys.set(name, key);
      return goal;
    }

    // Pipeline couldn't produce a goal — fall back to strategy
    return this.planWithStrategy(name, state, snapshot);
  }

  private managePlanLifecycle(teamCharacters: Character[], snapshot: BoardSnapshot): void {
    // If no plan exists, create one
    if (!this.activePlan) {
      this.partyGoal = null;
      this.createPlanFromBottleneck(teamCharacters, snapshot);
      return;
    }

    // Check if current plan should complete (bottleneck shifted)
    if (shouldCompletePlan(this.activePlan, teamCharacters)) {
      this.activePlan = null;
      this.partyGoal = null;
      this.createPlanFromBottleneck(teamCharacters, snapshot);
    }
  }

  private tryFormParty(teamCharacters: Character[]): void {
    // Need at least 3 characters available
    if (teamCharacters.length < 3) return;

    // Already have an active party
    if (this.partyGoal) return;

    // Find best beatable boss
    // Note: findBestBoss is async, but we need a sync check here.
    // We'll use a fire-and-forget pattern: initiate the search and cache the result.
    // For now, use a synchronous approach: try to find a boss synchronously.
    // Since the simulator has a cache, subsequent calls will be fast.
    // We'll use a promise-based approach with a cached result.
    this.findBestBossAndFormParty(teamCharacters);
  }

  private findBestBossAndFormParty(teamCharacters: Character[]): void {
    if (!this.simulator) return;

    // Use the first 3 characters (sorted by name for determinism)
    const sorted = [...teamCharacters].sort((a, b) => a.name.localeCompare(b.name));
    const partyMembers = sorted.slice(0, 3);

    // Fire async boss search — result will be cached for next tick
    this.simulator.findBestBoss(partyMembers, this.gameData).then((result) => {
      if (result && this.activePlan?.targetSkill === "combat") {
        this.partyGoal = {
          monster: result.monster.code,
          party: partyMembers.map((c) => c.name),
        };
      }
    }).catch(() => {
      // Boss search failed — continue with solo combat
    });
  }

  private createPlanFromBottleneck(teamCharacters: Character[], snapshot: BoardSnapshot): void {
    const bottlenecks = getTeamBottleneck(teamCharacters);

    for (const bottleneck of bottlenecks) {
      const plan = buildActivePlan(
        bottleneck.skill,
        teamCharacters,
        snapshot.bank.items,
        this.gameData
      );
      if (plan && plan.stages.length > 0) {
        this.activePlan = plan;
        return;
      }
    }
  }

  private planWithStrategy(name: string, state: Character, snapshot: BoardSnapshot): Goal {
    let goal = this.strategy(state, snapshot, this.gameData);

    // Anti-duplication for strategy-assigned goals
    if (this.enabled && this.isDuplicate(name, goal)) {
      goal = { type: "idle", reason: "coordinator: duplicate target avoided" };
    }

    return goal;
  }

  private buildTeamCharacters(currentName: string, currentState: Character, snapshot: BoardSnapshot): Character[] {
    const characters: Character[] = [];

    // Add current character (we have full state)
    characters.push(currentState);

    // Add other characters from cached states first (more complete), then board
    for (const charName of this.characterNames) {
      if (charName === currentName) continue;

      // Prefer cached full Character state
      const cached = this.characterStates.get(charName);
      if (cached) {
        characters.push(cached);
        continue;
      }

      // Fall back to board snapshot (skill levels only)
      const boardState = snapshot.characters[charName];
      if (!boardState) continue;

      const sl = boardState.skillLevels;
      characters.push({
        name: charName,
        mining_level: sl.mining ?? 1,
        woodcutting_level: sl.woodcutting ?? 1,
        fishing_level: sl.fishing ?? 1,
        alchemy_level: sl.alchemy ?? 1,
        weaponcrafting_level: sl.weaponcrafting ?? 1,
        gearcrafting_level: sl.gearcrafting ?? 1,
        jewelrycrafting_level: sl.jewelrycrafting ?? 1,
        cooking_level: sl.cooking ?? 1,
        level: sl.combat ?? 1,
      } as Character);
    }

    return characters;
  }

  private adjustSnapshot(snapshot: BoardSnapshot): BoardSnapshot {
    return {
      ...snapshot,
      bank: {
        ...snapshot.bank,
        items: this.ledger.getAvailable(snapshot.bank.items),
      },
    };
  }

  private isDuplicate(name: string, goal: Goal): boolean {
    const key = this.goalTargetKey(goal);
    if (!key) return false;

    for (const [charName, assigned] of this.assignments) {
      if (charName === name) continue;
      if (this.goalTargetKey(assigned) === key) return true;
    }
    return false;
  }

  private goalTargetKey(goal: Goal): string | null {
    switch (goal.type) {
      case "gather": return `gather:${goal.resource}`;
      case "fight": return `fight:${goal.monster}`;
      default: return null;
    }
  }

  private goalStageKey(goal: Goal): string | null {
    switch (goal.type) {
      case "gather": return `gather:${goal.resource}`;
      case "craft": return `craft:${goal.item}`;
      case "fight": return `fight:${goal.monster}`;
      default: return null;
    }
  }

  private computeReservation(goal: Goal): SimpleItem[] {
    if (goal.type !== "craft") return [];

    const item = this.gameData.getItemByCode(goal.item);
    if (!item?.craft?.items) return [];

    return item.craft.items.map((mat) => ({
      code: mat.code,
      quantity: mat.quantity * goal.quantity,
    }));
  }
}
