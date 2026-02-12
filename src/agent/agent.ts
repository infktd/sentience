import type { Character, Goal } from "../types";
import type { BoardSnapshot } from "../board/board";
import type { GameData } from "./game-data";
import type { ApiClient } from "../api/client";
import type { Board } from "../board/board";
import type { Logger } from "../logger/logger";
import { ApiRequestError } from "../api/client";

export type Strategy = (
  state: Character,
  board: BoardSnapshot,
  gameData: GameData
) => Goal;

export class Agent {
  private name: string;
  private state: Character | null = null;
  private strategy: Strategy;
  private api: ApiClient;
  private board: Board;
  private gameData: GameData;
  private logger: Logger;
  private running = false;
  private consecutiveFailures = 0;
  private lastFailedGoalType: string | null = null;

  constructor(
    name: string,
    strategy: Strategy,
    api: ApiClient,
    board: Board,
    gameData: GameData,
    logger: Logger
  ) {
    this.name = name;
    this.strategy = strategy;
    this.api = api;
    this.board = board;
    this.gameData = gameData;
    this.logger = logger;
  }

  static checkSurvivalOverride(state: Character): Goal | null {
    // Rest if HP below 40%
    if (state.hp < state.max_hp * 0.4) {
      return { type: "rest" };
    }
    // Deposit if inventory is full
    const usedSlots = state.inventory.filter((s) => s.quantity > 0).length;
    if (usedSlots >= state.inventory_max_items) {
      return { type: "deposit_all" };
    }
    return null;
  }

  async start(): Promise<void> {
    this.running = true;
    this.logger.info("Agent starting", { name: this.name });

    // Fetch initial state
    try {
      this.state = await this.api.getCharacter(this.name);
      this.syncBoard();
      this.logger.info("Initial state loaded", {
        hp: this.state.hp,
        position: { x: this.state.x, y: this.state.y },
        level: this.state.level,
      });
    } catch (err) {
      this.logger.error("Failed to load initial state", {
        error: String(err),
      });
      return;
    }

    // Main loop
    while (this.running) {
      try {
        await this.tick();
      } catch (err) {
        this.logger.error("Unhandled error in agent loop", {
          error: String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });
        // Wait 10s before restarting loop
        await new Promise((r) => setTimeout(r, 10_000));
        // Re-fetch state to recover
        try {
          this.state = await this.api.getCharacter(this.name);
          this.syncBoard();
        } catch {
          this.logger.error("Failed to recover state, will retry");
        }
      }
    }
  }

  stop(): void {
    this.running = false;
    this.logger.info("Agent stopping");
  }

  private async tick(): Promise<void> {
    if (!this.state) return;

    // Wait for cooldown
    await this.api.waitForCooldown(this.name);

    // Check survival overrides
    const override = Agent.checkSurvivalOverride(this.state);
    const boardSnapshot = this.board.getSnapshot();

    let goal: Goal;
    let reason: string;

    if (override) {
      goal = override;
      reason = `survival override: ${goal.type}`;
    } else {
      goal = this.strategy(this.state, boardSnapshot, this.gameData);
      reason = "strategy decision";
    }

    // Stuck detection
    const goalKey = JSON.stringify(goal);
    if (goalKey === this.lastFailedGoalType) {
      if (this.consecutiveFailures >= 3) {
        this.logger.warn("Stuck detected, requesting idle", {
          failedGoal: goal,
          failures: this.consecutiveFailures,
        });
        goal = { type: "idle", reason: "stuck after 3 failures" };
        reason = "stuck detection";
        this.consecutiveFailures = 0;
        this.lastFailedGoalType = null;
      }
    } else {
      this.consecutiveFailures = 0;
      this.lastFailedGoalType = null;
    }

    // Update board with current intent
    const targetSkill = this.getTargetSkill(goal);
    this.board.updateCharacter(this.name, {
      currentAction: goal.type,
      target: targetSkill,
      position: { x: this.state.x, y: this.state.y },
      skillLevels: this.getSkillLevels(),
      inventoryUsed: this.state.inventory.filter((s) => s.quantity > 0).length,
      inventoryMax: this.state.inventory_max_items,
    });

    // Log decision
    this.logger.decision(
      JSON.stringify(goal),
      reason,
      boardSnapshot,
      {
        hp: this.state.hp,
        max_hp: this.state.max_hp,
        x: this.state.x,
        y: this.state.y,
        inventoryUsed: this.state.inventory.filter((s) => s.quantity > 0).length,
        inventoryMax: this.state.inventory_max_items,
      }
    );

    // Execute goal
    try {
      await this.executeGoal(goal);
      this.consecutiveFailures = 0;
      this.lastFailedGoalType = null;
    } catch (err) {
      this.consecutiveFailures++;
      this.lastFailedGoalType = goalKey;

      if (err instanceof ApiRequestError) {
        this.logger.error("Action failed", {
          goal,
          errorCode: err.errorCode,
          errorMessage: err.errorMessage,
        });
      } else {
        throw err; // Re-throw unexpected errors to the outer catch
      }
    }
  }

  private async executeGoal(goal: Goal): Promise<void> {
    switch (goal.type) {
      case "rest": {
        const result = await this.api.rest(this.name);
        this.state = result.character;
        this.logger.info("Rested", { hp_restored: result.hp_restored });
        break;
      }

      case "deposit_all": {
        const itemsToDeposit = this.state!.inventory
          .filter((s) => s.quantity > 0)
          .map((s) => ({ code: s.code, quantity: s.quantity }));
        if (itemsToDeposit.length === 0) break;

        // Move to bank if not there
        const bank = this.gameData.findNearestBank(this.state!.x, this.state!.y);
        if (!bank) {
          this.logger.error("No bank found on any map");
          break;
        }
        if (this.state!.x !== bank.x || this.state!.y !== bank.y) {
          const moveResult = await this.api.move(this.name, bank.x, bank.y);
          this.state = moveResult.character;
        }

        const result = await this.api.depositItems(this.name, itemsToDeposit);
        this.state = result.character;
        this.board.updateBank(result.bank, this.board.getSnapshot().bank.gold);
        this.logger.info("Deposited items", { count: itemsToDeposit.length });
        break;
      }

      case "gather": {
        // Find resource location
        const resource = this.gameData.getResourceByCode(goal.resource);
        if (!resource) {
          this.logger.error("Unknown resource", { resource: goal.resource });
          break;
        }
        const resourceMaps = this.gameData.findMapsWithResource(goal.resource);
        const targetMap = this.gameData.findNearestMap(
          this.state!.x,
          this.state!.y,
          resourceMaps
        );
        if (!targetMap) {
          this.logger.error("No map found for resource", { resource: goal.resource });
          break;
        }

        // Move if needed
        if (this.state!.x !== targetMap.x || this.state!.y !== targetMap.y) {
          const moveResult = await this.api.move(this.name, targetMap.x, targetMap.y);
          this.state = moveResult.character;
          this.syncBoard();
          return; // Next tick will gather
        }

        // Gather
        const gatherResult = await this.api.gather(this.name);
        this.state = gatherResult.character;
        this.logger.info("Gathered", {
          xp: gatherResult.details.xp,
          items: gatherResult.details.items,
        });
        break;
      }

      case "fight": {
        // Find monster location
        const monsterMaps = this.gameData.findMapsWithMonster(goal.monster);
        const fightTargetMap = this.gameData.findNearestMap(
          this.state!.x,
          this.state!.y,
          monsterMaps
        );
        if (!fightTargetMap) {
          this.logger.error("No map found for monster", { monster: goal.monster });
          break;
        }

        // Move if needed
        if (this.state!.x !== fightTargetMap.x || this.state!.y !== fightTargetMap.y) {
          const moveResult = await this.api.move(this.name, fightTargetMap.x, fightTargetMap.y);
          this.state = moveResult.character;
          this.syncBoard();
          return;
        }

        // Fight
        const fightResult = await this.api.fight(this.name);
        const myResult = fightResult.fight.characters.find(
          (c) => c.character_name === this.name
        );
        this.state = fightResult.characters.find((c) => c.name === this.name) ?? this.state!;
        this.logger.info("Fought", {
          opponent: fightResult.fight.opponent,
          result: fightResult.fight.result,
          xp: myResult?.xp ?? 0,
          gold: myResult?.gold ?? 0,
          drops: myResult?.drops ?? [],
        });
        break;
      }

      case "craft": {
        // Find workshop
        const workshops = this.gameData.findMapsWithContent("workshop");
        const craftTargetMap = this.gameData.findNearestMap(
          this.state!.x,
          this.state!.y,
          workshops
        );
        if (!craftTargetMap) {
          this.logger.error("No workshop found");
          break;
        }

        // Move if needed
        if (this.state!.x !== craftTargetMap.x || this.state!.y !== craftTargetMap.y) {
          const moveResult = await this.api.move(this.name, craftTargetMap.x, craftTargetMap.y);
          this.state = moveResult.character;
          this.syncBoard();
          return;
        }

        const craftResult = await this.api.craft(this.name, goal.item, goal.quantity);
        this.state = craftResult.character;
        this.logger.info("Crafted", {
          item: goal.item,
          quantity: goal.quantity,
          xp: craftResult.details.xp,
        });
        break;
      }

      case "move": {
        const moveResult = await this.api.move(this.name, goal.x, goal.y);
        this.state = moveResult.character;
        this.logger.info("Moved", { x: goal.x, y: goal.y });
        break;
      }

      case "equip": {
        this.state = await this.api.equip(this.name, goal.code, goal.slot);
        this.logger.info("Equipped", { code: goal.code, slot: goal.slot });
        break;
      }

      case "unequip": {
        this.state = await this.api.unequip(this.name, goal.slot);
        this.logger.info("Unequipped", { slot: goal.slot });
        break;
      }

      case "idle": {
        this.logger.info("Idling", { reason: goal.reason });
        await new Promise((r) => setTimeout(r, 5000));
        // Re-fetch state in case something changed
        this.state = await this.api.getCharacter(this.name);
        break;
      }
    }

    this.syncBoard();
  }

  private getTargetSkill(goal: Goal): string {
    if (goal.type === "gather") {
      const resource = this.gameData.getResourceByCode(goal.resource);
      return resource?.skill ?? "";
    }
    if (goal.type === "fight") return "combat";
    if (goal.type === "craft") return "crafting";
    return "";
  }

  private getSkillLevels(): Record<string, number> {
    if (!this.state) return {};
    return {
      mining: this.state.mining_level,
      woodcutting: this.state.woodcutting_level,
      fishing: this.state.fishing_level,
      weaponcrafting: this.state.weaponcrafting_level,
      gearcrafting: this.state.gearcrafting_level,
      jewelrycrafting: this.state.jewelrycrafting_level,
      cooking: this.state.cooking_level,
      alchemy: this.state.alchemy_level,
      combat: this.state.level,
    };
  }

  private syncBoard(): void {
    if (!this.state) return;
    this.board.updateCharacter(this.name, {
      currentAction: "evaluating",
      target: "",
      position: { x: this.state.x, y: this.state.y },
      skillLevels: this.getSkillLevels(),
      inventoryUsed: this.state.inventory.filter((s) => s.quantity > 0).length,
      inventoryMax: this.state.inventory_max_items,
    });
  }
}
