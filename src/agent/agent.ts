import type { Character, Goal, Resource, SimpleItem, GEOrder } from "../types";
import type { BoardSnapshot } from "../board/board";
import type { GameData } from "./game-data";
import type { ApiClient } from "../api/client";
import type { Board } from "../board/board";
import type { Logger } from "../logger/logger";
import { ApiRequestError } from "../api/client";
import type { ActivityType } from "../equipment/evaluator";
import { getEquipmentChanges } from "../equipment/manager";
import type { FightSimulator } from "../combat/simulator";

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
  private simulator: FightSimulator | null = null;
  private running = false;
  private consecutiveFailures = 0;
  private lastFailedGoalType: string | null = null;
  private lastActivityType: ActivityType | null = null;

  constructor(
    name: string,
    strategy: Strategy,
    api: ApiClient,
    board: Board,
    gameData: GameData,
    logger: Logger,
    simulator?: FightSimulator
  ) {
    this.name = name;
    this.strategy = strategy;
    this.api = api;
    this.board = board;
    this.gameData = gameData;
    this.logger = logger;
    this.simulator = simulator ?? null;
  }

  /**
   * Maps API error codes to specific recovery actions.
   * Returns a recovery goal, or null to skip the current goal and return to strategy.
   */
  static getErrorRecovery(
    errorCode: number,
    _state: Character,
    _goal: Goal
  ): { recovery: Goal } | "skip" | null {
    switch (errorCode) {
      case 475: // Task already complete / too many items
        return { recovery: { type: "task_complete" } };
      case 497: // Inventory full
        return { recovery: { type: "deposit_all" } };
      case 478: // Missing items for action
      case 493: // Skill level too low
      case 473: // Can't recycle/action
        return "skip";
      case 598: // Wrong map/location — retry will re-evaluate and move
        return "skip";
      case 486: // Action already in progress — wait cooldown
        return "skip";
      case 490: // Item already equipped
        return "skip";
      case 434: // GE order doesn't have enough items
      case 435: // Can't trade with yourself
      case 436: // GE transaction in progress
      case 492: // Insufficient gold
        return "skip";
      default:
        return null; // Unknown error — fall through to counter
    }
  }

  static getActivityType(goal: Goal, resource?: Resource): ActivityType | null {
    if (goal.type === "fight") return "combat";
    if (goal.type === "gather") {
      if (resource?.skill) return `gathering:${resource.skill}` as ActivityType;
      return null;
    }
    return null;
  }

  static checkSurvivalOverride(state: Character): Goal | null {
    // Rest if HP below 40%
    if (state.hp < state.max_hp * 0.4) {
      return { type: "rest" };
    }
    // Deposit if inventory is nearly full (total quantity or slot count)
    const totalQuantity = state.inventory.reduce((sum, s) => sum + s.quantity, 0);
    const usedSlots = state.inventory.filter((s) => s.quantity > 0).length;
    if (totalQuantity >= state.inventory_max_items - 5 || usedSlots >= 20) {
      return { type: "deposit_all" };
    }
    return null;
  }

  static checkTaskOverride(
    state: Character,
    gameData?: GameData,
    bankItems?: SimpleItem[]
  ): Goal | null {
    // Task completed — go turn it in
    if (state.task && state.task_progress >= state.task_total) {
      return { type: "task_complete" };
    }
    // Item task — trade items when we have a meaningful batch
    if (state.task && state.task_type === "items") {
      const inInventory = state.inventory
        .filter((s) => s.code === state.task)
        .reduce((sum, s) => sum + s.quantity, 0);
      if (inInventory > 0) {
        const remaining = state.task_total - state.task_progress;
        const totalQuantity = state.inventory.reduce((sum, s) => sum + s.quantity, 0);
        const inventoryNearlyFull = totalQuantity >= state.inventory_max_items - 5;
        // Trade when: can finish the task, OR inventory is nearly full
        if (inInventory >= remaining || inventoryNearlyFull) {
          return { type: "task_trade" };
        }
      }
    }
    // No active task — go get one
    if (!state.task) {
      return { type: "task_new" };
    }
    // Check if current task is unachievable — cancel it if possible
    if (gameData && bankItems && state.task && (state.task_type === "monsters" || state.task_type === "items")) {
      const achievable = gameData.isTaskAchievable(
        { code: state.task, type: state.task_type as "monsters" | "items" },
        {
          mining: state.mining_level,
          woodcutting: state.woodcutting_level,
          fishing: state.fishing_level,
          alchemy: state.alchemy_level,
          weaponcrafting: state.weaponcrafting_level,
          gearcrafting: state.gearcrafting_level,
          jewelrycrafting: state.jewelrycrafting_level,
          cooking: state.cooking_level,
          combat: state.level,
        },
        bankItems
      );
      if (!achievable) {
        // Only cancel if character has tasks_coin
        const taskCoins = state.inventory
          .filter((s) => s.code === "tasks_coin")
          .reduce((sum, s) => sum + s.quantity, 0);
        if (taskCoins >= 1) {
          return { type: "task_cancel" };
        }
      }
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

    const boardSnapshot = this.board.getSnapshot();

    let goal: Goal;
    let reason: string;

    // Priority chain for overrides:
    // 1. Rest (critical safety)
    // 2. Task complete/trade (frees inventory, must fire before deposit)
    // 3. Deposit all (inventory overflow)
    // 4. Task new (get a task if none)
    // 5. Strategy
    if (this.state.hp < this.state.max_hp * 0.4) {
      goal = { type: "rest" };
      reason = "survival override: rest";
    } else {
      const taskOverride = Agent.checkTaskOverride(this.state, this.gameData, boardSnapshot.bank.items);
      const isHighPriorityTask = taskOverride && taskOverride.type !== "task_new" && taskOverride.type !== "task_cancel";
      if (isHighPriorityTask) {
        // Task complete or trade — higher priority than deposit
        goal = taskOverride;
        reason = `task management: ${goal.type}`;
      } else {
        const survivalOverride = Agent.checkSurvivalOverride(this.state);
        if (survivalOverride) {
          goal = survivalOverride;
          reason = `survival override: ${goal.type}`;
        } else if (taskOverride) {
          // task_new or task_cancel
          goal = taskOverride;
          reason = `task management: ${goal.type}`;
        } else {
          goal = this.strategy(this.state, boardSnapshot, this.gameData);
          reason = "strategy decision";
        }
      }
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

    // Equipment evaluation on activity type change
    const goalResource = goal.type === "gather"
      ? this.gameData.getResourceByCode(goal.resource)
      : undefined;
    const activityType = Agent.getActivityType(goal, goalResource);
    if (activityType && activityType !== this.lastActivityType) {
      try {
        await this.handleEquipmentSwaps(activityType);
      } catch (err) {
        this.logger.error("Equipment swap failed", { error: String(err) });
      }
      this.lastActivityType = activityType;
    }

    // Update board with current intent
    const targetSkill = this.getTargetSkill(goal);
    this.board.updateCharacter(this.name, {
      currentAction: goal.type,
      target: targetSkill,
      position: { x: this.state.x, y: this.state.y },
      skillLevels: this.getSkillLevels(),
      inventoryUsed: this.state.inventory.reduce((sum, s) => sum + s.quantity, 0),
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
        inventoryUsed: this.state.inventory.reduce((sum, s) => sum + s.quantity, 0),
        inventoryMax: this.state.inventory_max_items,
      }
    );

    // Execute goal
    try {
      await this.executeGoal(goal);
      this.consecutiveFailures = 0;
      this.lastFailedGoalType = null;
    } catch (err) {
      if (err instanceof ApiRequestError) {
        this.logger.error("Action failed", {
          goal,
          errorCode: err.errorCode,
          errorMessage: err.errorMessage,
        });

        const recovery = Agent.getErrorRecovery(err.errorCode, this.state!, goal);
        if (recovery === "skip") {
          // Known recoverable error — skip goal, return to strategy next tick
          this.logger.info("Skipping goal due to recoverable error", {
            errorCode: err.errorCode,
          });
          this.consecutiveFailures = 0;
          this.lastFailedGoalType = null;
        } else if (recovery !== null) {
          // Specific recovery action
          this.logger.info("Executing error recovery", {
            errorCode: err.errorCode,
            recoveryGoal: recovery.recovery.type,
          });
          try {
            await this.api.waitForCooldown(this.name);
            await this.executeGoal(recovery.recovery);
          } catch (recoveryErr) {
            this.logger.error("Recovery action also failed", {
              error: String(recoveryErr),
            });
          }
          this.consecutiveFailures = 0;
          this.lastFailedGoalType = null;
        } else {
          // Unknown error — use counter
          this.consecutiveFailures++;
          this.lastFailedGoalType = goalKey;
        }
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
        // Skip task items for active item tasks — they need to be traded, not deposited
        const activeTaskItem = this.state!.task_type === "items" && this.state!.task
          ? this.state!.task
          : null;
        const itemsToDeposit = this.state!.inventory
          .filter((s) => s.quantity > 0 && s.code !== activeTaskItem)
          .map((s) => ({ code: s.code, quantity: s.quantity }));
        const hasGold = this.state!.gold > 0;
        if (itemsToDeposit.length === 0 && !hasGold) break;

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

        if (itemsToDeposit.length > 0) {
          const result = await this.api.depositItems(this.name, itemsToDeposit);
          this.state = result.character;
          this.board.updateBank(result.bank, this.board.getSnapshot().bank.gold);
          this.logger.info("Deposited items", { count: itemsToDeposit.length });
        }

        // Deposit gold
        if (this.state!.gold > 0) {
          await this.api.waitForCooldown(this.name);
          const goldResult = await this.api.depositGold(this.name, this.state!.gold);
          this.state = goldResult.character;
          this.board.updateBank(
            this.board.getSnapshot().bank.items,
            goldResult.bank.quantity
          );
          this.logger.info("Deposited gold", { amount: goldResult.bank.quantity });
        }
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
        // Restock utility items if needed
        await this.handleUtilityRestock();

        // Safety check via simulator
        let monsterCode = goal.monster;
        if (this.simulator) {
          const simResult = await this.simulator.simulate(this.state!, monsterCode);
          if (simResult.winRate < 0.9) {
            this.logger.warn("Unsafe fight", {
              monster: monsterCode,
              winRate: simResult.winRate,
            });
            // Find a safer monster
            const best = await this.simulator.findBestMonster(this.state!, this.gameData);
            if (!best) {
              this.logger.warn("No safe monster found, skipping combat");
              break;
            }
            monsterCode = best.monster.code;
            this.logger.info("Downgraded fight target", {
              from: goal.monster,
              to: monsterCode,
              winRate: best.result.winRate,
            });
          } else {
            this.logger.info("Fight simulation OK", {
              monster: monsterCode,
              winRate: simResult.winRate,
              avgHpRemaining: simResult.avgFinalHp,
            });
          }
        }

        // Find monster location
        const monsterMaps = this.gameData.findMapsWithMonster(monsterCode);
        const fightTargetMap = this.gameData.findNearestMap(
          this.state!.x,
          this.state!.y,
          monsterMaps
        );
        if (!fightTargetMap) {
          this.logger.error("No map found for monster", { monster: monsterCode });
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
        // Look up recipe for materials
        const recipe = this.gameData.getItemByCode(goal.item);
        const materials = recipe?.craft?.items ?? [];

        // Withdraw materials from bank if needed
        if (materials.length > 0) {
          const qty = goal.quantity;
          // Check if we already have materials in inventory
          const needsWithdraw = materials.some((mat) => {
            const inInventory = this.state!.inventory
              .filter((s) => s.code === mat.code)
              .reduce((sum, s) => sum + s.quantity, 0);
            return inInventory < mat.quantity * qty;
          });

          if (needsWithdraw) {
            // Move to bank
            const bank = this.gameData.findNearestBank(this.state!.x, this.state!.y);
            if (!bank) {
              this.logger.error("No bank found for material withdrawal");
              break;
            }
            if (this.state!.x !== bank.x || this.state!.y !== bank.y) {
              await this.api.waitForCooldown(this.name);
              const moveResult = await this.api.move(this.name, bank.x, bank.y);
              this.state = moveResult.character;
            }

            // Withdraw all needed materials in one batch call
            const materialsToWithdraw: SimpleItem[] = [];
            for (const mat of materials) {
              const inInventory = this.state!.inventory
                .filter((s) => s.code === mat.code)
                .reduce((sum, s) => sum + s.quantity, 0);
              const needed = mat.quantity * qty - inInventory;
              if (needed > 0) {
                materialsToWithdraw.push({ code: mat.code, quantity: needed });
              }
            }
            if (materialsToWithdraw.length > 0) {
              await this.api.waitForCooldown(this.name);
              const withdrawResult = await this.api.withdrawItems(this.name, materialsToWithdraw);
              this.state = withdrawResult.character;
              this.board.updateBank(withdrawResult.bank, this.board.getSnapshot().bank.gold);
            }
          }
        }

        // Find and move to the correct workshop for this skill
        const craftSkill = recipe?.craft?.skill;
        const workshops = craftSkill
          ? this.gameData.findMapsWithContent("workshop", craftSkill)
          : this.gameData.findMapsWithContent("workshop");
        const craftTargetMap = this.gameData.findNearestMap(
          this.state!.x,
          this.state!.y,
          workshops
        );
        if (!craftTargetMap) {
          this.logger.error("No workshop found", { skill: craftSkill });
          break;
        }
        if (this.state!.x !== craftTargetMap.x || this.state!.y !== craftTargetMap.y) {
          await this.api.waitForCooldown(this.name);
          const moveResult = await this.api.move(this.name, craftTargetMap.x, craftTargetMap.y);
          this.state = moveResult.character;
        }

        // Craft
        await this.api.waitForCooldown(this.name);
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

      case "buy_npc": {
        // Look up NPC item for currency info
        const npcItem = this.gameData.getNpcItemForProduct(goal.item);
        if (!npcItem) {
          this.logger.error("Unknown NPC item", { item: goal.item });
          break;
        }

        // Withdraw currency from bank if not gold
        if (npcItem.currency !== "gold") {
          const currencyNeeded = npcItem.buy_price! * goal.quantity;
          const inInventory = this.state!.inventory
            .filter((s) => s.code === npcItem.currency)
            .reduce((sum, s) => sum + s.quantity, 0);

          if (inInventory < currencyNeeded) {
            // Move to bank and withdraw currency
            const bank = this.gameData.findNearestBank(this.state!.x, this.state!.y);
            if (!bank) {
              this.logger.error("No bank found for NPC currency withdrawal");
              break;
            }
            if (this.state!.x !== bank.x || this.state!.y !== bank.y) {
              await this.api.waitForCooldown(this.name);
              const moveResult = await this.api.move(this.name, bank.x, bank.y);
              this.state = moveResult.character;
            }
            const needed = currencyNeeded - inInventory;
            await this.api.waitForCooldown(this.name);
            const withdrawResult = await this.api.withdrawItems(this.name, [{ code: npcItem.currency, quantity: needed }]);
            this.state = withdrawResult.character;
            this.board.updateBank(withdrawResult.bank, this.board.getSnapshot().bank.gold);
          }
        }

        // Move to NPC
        const npcMaps = this.gameData.findNpcMap(goal.npc);
        if (!npcMaps) {
          this.logger.error("NPC not found on map", { npc: goal.npc });
          break;
        }
        if (this.state!.x !== npcMaps.x || this.state!.y !== npcMaps.y) {
          await this.api.waitForCooldown(this.name);
          const moveResult = await this.api.move(this.name, npcMaps.x, npcMaps.y);
          this.state = moveResult.character;
        }

        // Buy from NPC
        await this.api.waitForCooldown(this.name);
        const buyResult = await this.api.buyNpc(this.name, goal.item, goal.quantity);
        this.state = buyResult.character;
        this.logger.info("Bought from NPC", {
          npc: goal.npc,
          item: goal.item,
          quantity: goal.quantity,
          currency: buyResult.transaction.currency,
          totalPrice: buyResult.transaction.total_price,
        });

        // Deposit purchased items to bank
        const bankForDeposit = this.gameData.findNearestBank(this.state!.x, this.state!.y);
        if (bankForDeposit) {
          if (this.state!.x !== bankForDeposit.x || this.state!.y !== bankForDeposit.y) {
            await this.api.waitForCooldown(this.name);
            const moveResult = await this.api.move(this.name, bankForDeposit.x, bankForDeposit.y);
            this.state = moveResult.character;
          }
          const itemsToDeposit = this.state!.inventory
            .filter((s) => s.code === goal.item && s.quantity > 0)
            .map((s) => ({ code: s.code, quantity: s.quantity }));
          if (itemsToDeposit.length > 0) {
            await this.api.waitForCooldown(this.name);
            const depositResult = await this.api.depositItems(this.name, itemsToDeposit);
            this.state = depositResult.character;
            this.board.updateBank(depositResult.bank, this.board.getSnapshot().bank.gold);
          }
        }
        break;
      }

      case "task_complete": {
        // Move to the correct tasks_master for this task type
        const taskMasterMap = this.gameData.findTasksMaster(this.state!.task_type);
        if (!taskMasterMap) {
          this.logger.error("Tasks master not found", { taskType: this.state!.task_type });
          break;
        }
        if (this.state!.x !== taskMasterMap.x || this.state!.y !== taskMasterMap.y) {
          const moveResult = await this.api.move(this.name, taskMasterMap.x, taskMasterMap.y);
          this.state = moveResult.character;
        }

        // Complete the task
        await this.api.waitForCooldown(this.name);
        const completeResult = await this.api.taskComplete(this.name);
        this.state = completeResult.character;
        this.logger.info("Task completed", {
          rewards: completeResult.rewards,
        });

        // Exchange coins if we have 6+
        const taskCoins = this.state!.inventory
          .filter((s) => s.code === "tasks_coin")
          .reduce((sum, s) => sum + s.quantity, 0);
        if (taskCoins >= 6) {
          await this.api.waitForCooldown(this.name);
          const exchangeResult = await this.api.taskExchange(this.name);
          this.state = exchangeResult.character;
          this.logger.info("Exchanged task coins", {
            rewards: exchangeResult.rewards,
          });
        }

        // Accept new task
        await this.api.waitForCooldown(this.name);
        const newTaskResult = await this.api.taskNew(this.name);
        this.state = newTaskResult.character;
        this.logger.info("New task accepted", {
          task: newTaskResult.task.code,
          type: newTaskResult.task.type,
          total: newTaskResult.task.total,
        });
        break;
      }

      case "task_trade": {
        // Trade task items to the tasks master
        const tradeItemCode = this.state!.task;
        const inInventory = this.state!.inventory
          .filter((s) => s.code === tradeItemCode)
          .reduce((sum, s) => sum + s.quantity, 0);
        const remaining = this.state!.task_total - this.state!.task_progress;
        const tradeQty = Math.min(inInventory, remaining);
        if (tradeQty <= 0) break;

        // Move to the correct tasks_master for item tasks
        const tradeMasterMap = this.gameData.findTasksMaster(this.state!.task_type);
        if (!tradeMasterMap) {
          this.logger.error("Tasks master not found for trade", { taskType: this.state!.task_type });
          break;
        }
        if (this.state!.x !== tradeMasterMap.x || this.state!.y !== tradeMasterMap.y) {
          const moveResult = await this.api.move(this.name, tradeMasterMap.x, tradeMasterMap.y);
          this.state = moveResult.character;
        }

        // Trade items
        await this.api.waitForCooldown(this.name);
        const tradeResult = await this.api.taskTrade(this.name, tradeItemCode, tradeQty);
        this.state = tradeResult.character;
        this.logger.info("Traded task items", {
          item: tradeResult.trade.code,
          quantity: tradeResult.trade.quantity,
          progress: this.state!.task_progress,
          total: this.state!.task_total,
        });
        break;
      }

      case "task_new": {
        // Pick task type based on character strengths
        const bestTaskType = this.gameData.evaluateBestTaskType(this.state!);
        const preferredMaster = this.gameData.findTasksMaster(bestTaskType);
        const masters = preferredMaster
          ? [preferredMaster]
          : [
              this.gameData.findTasksMaster("monsters"),
              this.gameData.findTasksMaster("items"),
            ].filter((m) => m !== undefined);
        const nearestMaster = this.gameData.findNearestMap(
          this.state!.x,
          this.state!.y,
          masters
        );
        if (!nearestMaster) {
          this.logger.error("No tasks master found");
          break;
        }
        if (this.state!.x !== nearestMaster.x || this.state!.y !== nearestMaster.y) {
          const moveResult = await this.api.move(this.name, nearestMaster.x, nearestMaster.y);
          this.state = moveResult.character;
        }

        await this.api.waitForCooldown(this.name);
        const taskResult = await this.api.taskNew(this.name);
        this.state = taskResult.character;
        this.logger.info("New task accepted", {
          task: taskResult.task.code,
          type: taskResult.task.type,
          total: taskResult.task.total,
        });
        break;
      }

      case "task_cancel": {
        // Cancel unachievable task (costs 1 tasks_coin)
        const cancelMasterMap = this.gameData.findTasksMaster(this.state!.task_type);
        if (!cancelMasterMap) {
          this.logger.error("Tasks master not found for cancel", { taskType: this.state!.task_type });
          break;
        }
        if (this.state!.x !== cancelMasterMap.x || this.state!.y !== cancelMasterMap.y) {
          const moveResult = await this.api.move(this.name, cancelMasterMap.x, cancelMasterMap.y);
          this.state = moveResult.character;
        }
        await this.api.waitForCooldown(this.name);
        const cancelResult = await this.api.taskCancel(this.name);
        this.state = cancelResult.character;
        this.logger.info("Task cancelled");
        break;
      }

      case "buy_ge": {
        // Find cheapest matching order
        const geOrders = this.board.getSnapshot().geOrders;
        const matching = geOrders
          .filter((o: GEOrder) => o.code === goal.item && o.price <= goal.maxPrice && o.quantity > 0)
          .sort((a: GEOrder, b: GEOrder) => a.price - b.price);

        if (matching.length === 0) {
          this.logger.warn("No GE orders available", { item: goal.item });
          break;
        }

        const order = matching[0];
        const buyQty = Math.min(goal.quantity, order.quantity);
        const totalCost = order.price * buyQty;

        // Withdraw gold from bank if needed
        if (this.state!.gold < totalCost) {
          const bank = this.gameData.findNearestBank(this.state!.x, this.state!.y);
          if (!bank) {
            this.logger.error("No bank found for gold withdrawal");
            break;
          }
          if (this.state!.x !== bank.x || this.state!.y !== bank.y) {
            const moveResult = await this.api.move(this.name, bank.x, bank.y);
            this.state = moveResult.character;
          }
          const goldNeeded = totalCost - this.state!.gold;
          if (goldNeeded > 0) {
            await this.api.waitForCooldown(this.name);
            const goldResult = await this.api.withdrawGold(this.name, goldNeeded);
            this.state = goldResult.character;
            this.board.updateBank(
              this.board.getSnapshot().bank.items,
              goldResult.bank.quantity
            );
          }
        }

        // Move to GE
        const geMaps = this.gameData.findMapsWithContent("grand_exchange");
        const geMap = this.gameData.findNearestMap(this.state!.x, this.state!.y, geMaps);
        if (!geMap) {
          this.logger.error("No grand exchange found on map");
          break;
        }
        if (this.state!.x !== geMap.x || this.state!.y !== geMap.y) {
          await this.api.waitForCooldown(this.name);
          const moveResult = await this.api.move(this.name, geMap.x, geMap.y);
          this.state = moveResult.character;
        }

        // Buy from GE
        await this.api.waitForCooldown(this.name);
        const buyResult = await this.api.buyGE(this.name, order.id, buyQty);
        this.state = buyResult.character;
        this.logger.info("Bought from GE", {
          item: goal.item,
          quantity: buyQty,
          price: order.price,
          totalCost: buyResult.order.total_price,
        });

        // Deposit purchased items to bank
        const bankAfterBuy = this.gameData.findNearestBank(this.state!.x, this.state!.y);
        if (bankAfterBuy) {
          if (this.state!.x !== bankAfterBuy.x || this.state!.y !== bankAfterBuy.y) {
            await this.api.waitForCooldown(this.name);
            const moveResult = await this.api.move(this.name, bankAfterBuy.x, bankAfterBuy.y);
            this.state = moveResult.character;
          }
          const boughtItems = this.state!.inventory
            .filter((s) => s.code === goal.item && s.quantity > 0)
            .map((s) => ({ code: s.code, quantity: s.quantity }));
          if (boughtItems.length > 0) {
            await this.api.waitForCooldown(this.name);
            const depositResult = await this.api.depositItems(this.name, boughtItems);
            this.state = depositResult.character;
            this.board.updateBank(depositResult.bank, this.board.getSnapshot().bank.gold);
          }
        }
        break;
      }

      case "sell_ge": {
        // Move to bank and withdraw items to sell
        const bankForSell = this.gameData.findNearestBank(this.state!.x, this.state!.y);
        if (!bankForSell) {
          this.logger.error("No bank found for GE sell withdrawal");
          break;
        }
        if (this.state!.x !== bankForSell.x || this.state!.y !== bankForSell.y) {
          const moveResult = await this.api.move(this.name, bankForSell.x, bankForSell.y);
          this.state = moveResult.character;
        }

        await this.api.waitForCooldown(this.name);
        const sellWithdrawResult = await this.api.withdrawItems(this.name, [
          { code: goal.item, quantity: goal.quantity },
        ]);
        this.state = sellWithdrawResult.character;
        this.board.updateBank(sellWithdrawResult.bank, this.board.getSnapshot().bank.gold);

        // Move to GE
        const sellGeMaps = this.gameData.findMapsWithContent("grand_exchange");
        const sellGeMap = this.gameData.findNearestMap(this.state!.x, this.state!.y, sellGeMaps);
        if (!sellGeMap) {
          this.logger.error("No grand exchange found on map");
          break;
        }
        if (this.state!.x !== sellGeMap.x || this.state!.y !== sellGeMap.y) {
          await this.api.waitForCooldown(this.name);
          const moveResult = await this.api.move(this.name, sellGeMap.x, sellGeMap.y);
          this.state = moveResult.character;
        }

        // Create sell order
        await this.api.waitForCooldown(this.name);
        const sellResult = await this.api.sellGE(this.name, goal.item, goal.quantity, goal.price);
        this.state = sellResult.character;
        this.logger.info("Posted GE sell order", {
          item: goal.item,
          quantity: goal.quantity,
          price: goal.price,
          tax: sellResult.order.tax,
        });
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

  private async handleEquipmentSwaps(activity: ActivityType): Promise<void> {
    const bankItems = this.board.getSnapshot().bank.items;
    const changes = getEquipmentChanges(this.state!, bankItems, this.gameData, activity);

    if (changes.length === 0) return;

    this.logger.info("Swapping gear", {
      activity,
      changes: changes.map((c) => ({ slot: c.slot, from: c.unequipCode, to: c.equipCode })),
    });

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

    // Phase 1: Unequip all old items (sequential — API requires one-by-one)
    for (const change of changes) {
      if (change.unequipCode) {
        this.state = await this.api.unequip(this.name, change.slot);
      }
    }

    // Phase 2: Batch deposit all old items
    const itemsToDeposit = changes
      .filter((c) => c.unequipCode)
      .map((c) => ({ code: c.unequipCode!, quantity: 1 }));
    if (itemsToDeposit.length > 0) {
      await this.api.waitForCooldown(this.name);
      const depositResult = await this.api.depositItems(this.name, itemsToDeposit);
      this.state = depositResult.character;
      this.board.updateBank(depositResult.bank, this.board.getSnapshot().bank.gold);
    }

    // Phase 3: Batch withdraw all new items
    const itemsToWithdraw = changes.map((c) => ({ code: c.equipCode, quantity: 1 }));
    await this.api.waitForCooldown(this.name);
    const withdrawResult = await this.api.withdrawItems(this.name, itemsToWithdraw);
    this.state = withdrawResult.character;
    this.board.updateBank(withdrawResult.bank, this.board.getSnapshot().bank.gold);

    // Phase 4: Equip all new items (sequential — API requires one-by-one)
    for (const change of changes) {
      await this.api.waitForCooldown(this.name);
      this.state = await this.api.equip(this.name, change.equipCode, change.slot);
    }

    this.syncBoard();
  }

  private async handleUtilityRestock(): Promise<void> {
    if (!this.state) return;

    const slot1Empty = this.state.utility1_slot_quantity === 0;
    const slot2Empty = this.state.utility2_slot_quantity === 0;
    if (!slot1Empty && !slot2Empty) return;

    const bankItems = this.board.getSnapshot().bank.items;
    const bestItems = this.gameData.getBestUtilityItems(this.state.level, bankItems);
    if (bestItems.length === 0) return;

    const slotsToRestock: Array<{ slot: "utility1" | "utility2"; currentCode: string }> = [];
    if (slot1Empty) slotsToRestock.push({ slot: "utility1", currentCode: this.state.utility1_slot });
    if (slot2Empty) slotsToRestock.push({ slot: "utility2", currentCode: this.state.utility2_slot });

    this.logger.info("Restocking utility items", {
      slots: slotsToRestock.map((s) => s.slot),
      available: bestItems.map((i) => i.code),
    });

    // Move to bank
    const bank = this.gameData.findNearestBank(this.state.x, this.state.y);
    if (!bank) return;
    if (this.state.x !== bank.x || this.state.y !== bank.y) {
      const moveResult = await this.api.move(this.name, bank.x, bank.y);
      this.state = moveResult.character;
    }

    // Track how much of each item we've claimed
    const bankMap = new Map<string, number>();
    for (const bi of bankItems) bankMap.set(bi.code, bi.quantity);

    // Phase 1: Unequip all old utility items
    for (const { slot, currentCode } of slotsToRestock) {
      if (currentCode) {
        await this.api.waitForCooldown(this.name);
        this.state = await this.api.unequip(this.name, slot);
      }
    }

    // Phase 2: Batch deposit anything that ended up in inventory
    const toDeposit = this.state!.inventory
      .filter((s) => s.quantity > 0)
      .map((s) => ({ code: s.code, quantity: s.quantity }));
    if (toDeposit.length > 0) {
      await this.api.waitForCooldown(this.name);
      const depositResult = await this.api.depositItems(this.name, toDeposit);
      this.state = depositResult.character;
    }

    // Phase 3: Determine what to withdraw for each slot, batch withdraw
    const slotAssignments: Array<{ slot: "utility1" | "utility2"; code: string; qty: number }> = [];
    let itemIndex = 0;
    for (const { slot } of slotsToRestock) {
      if (itemIndex >= bestItems.length) itemIndex = 0;
      const item = bestItems[itemIndex];
      const availableQty = bankMap.get(item.code) ?? 0;
      const qty = Math.min(availableQty, 50);
      if (qty <= 0) {
        itemIndex++;
        continue;
      }
      slotAssignments.push({ slot, code: item.code, qty });
      bankMap.set(item.code, availableQty - qty);
      itemIndex++;
    }

    if (slotAssignments.length > 0) {
      const itemsToWithdraw = slotAssignments.map((a) => ({ code: a.code, quantity: a.qty }));
      await this.api.waitForCooldown(this.name);
      const withdrawResult = await this.api.withdrawItems(this.name, itemsToWithdraw);
      this.state = withdrawResult.character;
      this.board.updateBank(withdrawResult.bank, this.board.getSnapshot().bank.gold);

      // Phase 4: Equip each utility item
      for (const { slot, code, qty } of slotAssignments) {
        await this.api.waitForCooldown(this.name);
        this.state = await this.api.equip(this.name, code, slot, qty);
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
    if (goal.type === "craft") {
      const item = this.gameData.getItemByCode(goal.item);
      return item?.craft?.skill ?? "crafting";
    }
    if (goal.type === "buy_npc") return goal.npc;
    if (goal.type === "buy_ge" || goal.type === "sell_ge") return "grand_exchange";
    if (goal.type === "task_complete" || goal.type === "task_new" || goal.type === "task_trade" || goal.type === "task_cancel") return "task";
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
      inventoryUsed: this.state.inventory.reduce((sum, s) => sum + s.quantity, 0),
      inventoryMax: this.state.inventory_max_items,
    });
  }
}
