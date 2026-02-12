import type { Character, Goal } from "../types";
import type { BoardSnapshot } from "../board/board";
import type { GameData } from "../agent/game-data";
import { maxAllSkills } from "./max-all-skills";

/**
 * Task-focused strategy: prioritize completing the active task.
 * Falls back to maxAllSkills when the task can't be progressed.
 */
export function taskFocused(
  state: Character,
  board: BoardSnapshot,
  gameData: GameData
): Goal {
  // If no active task, fall back to maxAllSkills
  if (!state.task || !state.task_type) {
    return maxAllSkills(state, board, gameData);
  }

  // Task already complete — agent's task override will handle it
  if (state.task_progress >= state.task_total) {
    return maxAllSkills(state, board, gameData);
  }

  if (state.task_type === "monsters") {
    return handleMonsterTask(state, gameData);
  }

  if (state.task_type === "items") {
    const freeInventory = state.inventory_max_items - state.inventory.reduce((sum, s) => sum + s.quantity, 0);
    return handleItemTask(state, board, gameData, freeInventory);
  }

  // Unknown task type — fall back
  return maxAllSkills(state, board, gameData);
}

function handleMonsterTask(
  state: Character,
  gameData: GameData
): Goal {
  const monster = gameData.getMonsterByCode(state.task);
  if (!monster) return { type: "idle", reason: `unknown task monster: ${state.task}` };

  // Check if there's a map with this monster
  const maps = gameData.findMapsWithMonster(state.task);
  if (maps.length === 0) return { type: "idle", reason: `no map for monster: ${state.task}` };

  // Agent's simulator check will handle safety — just emit the fight goal
  return { type: "fight", monster: state.task };
}

function handleItemTask(
  state: Character,
  board: BoardSnapshot,
  gameData: GameData,
  freeInventory: number
): Goal {
  const skillLevels: Record<string, number> = {
    mining: state.mining_level,
    woodcutting: state.woodcutting_level,
    fishing: state.fishing_level,
    alchemy: state.alchemy_level,
    weaponcrafting: state.weaponcrafting_level,
    gearcrafting: state.gearcrafting_level,
    jewelrycrafting: state.jewelrycrafting_level,
    cooking: state.cooking_level,
    combat: state.level,
  };

  const goal = gameData.resolveItemChain(
    state.task,
    board.bank.items,
    skillLevels,
    freeInventory
  );

  if (goal) return goal;

  // Chain unresolvable — fall back to general training
  return maxAllSkills(state, board, gameData);
}
