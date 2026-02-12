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
    return handleItemTask(state, board, gameData);
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
  gameData: GameData
): Goal {
  const taskItem = state.task;
  const bankItems = board.bank.items;

  // Check if the item is craftable
  const item = gameData.getItemByCode(taskItem);
  if (item?.craft) {
    // Check if bank has materials to craft it
    const craftable = gameData.getCraftableItems(
      item.craft.skill!,
      item.craft.level ?? 0,
      bankItems
    );
    if (craftable.some((c) => c.code === taskItem)) {
      return { type: "craft", item: taskItem, quantity: 1 };
    }

    // If not craftable, try to gather the missing materials
    const materials = item.craft.items ?? [];
    const bankMap = new Map<string, number>();
    for (const bi of bankItems) bankMap.set(bi.code, bi.quantity);

    for (const mat of materials) {
      const have = bankMap.get(mat.code) ?? 0;
      if (have < mat.quantity) {
        // Try to find a resource that drops this material
        const resource = gameData.findResourceForDrop(mat.code);
        if (resource) {
          const skillLevel = getSkillLevel(state, resource.skill);
          if (resource.level <= skillLevel) {
            const maps = gameData.findMapsWithResource(resource.code);
            if (maps.length > 0) {
              return { type: "gather", resource: resource.code };
            }
          }
        }
      }
    }
  }

  // Check if the item is a resource drop (raw gathered item)
  const resource = gameData.findResourceForDrop(taskItem);
  if (resource) {
    const skillLevel = getSkillLevel(state, resource.skill);
    if (resource.level <= skillLevel) {
      const maps = gameData.findMapsWithResource(resource.code);
      if (maps.length > 0) {
        return { type: "gather", resource: resource.code };
      }
    }
  }

  // Check if the item is a monster drop
  const monster = gameData.findMonsterForDrop(taskItem);
  if (monster && monster.level <= state.level) {
    const maps = gameData.findMapsWithMonster(monster.code);
    if (maps.length > 0) {
      return { type: "fight", monster: monster.code };
    }
  }

  // Can't figure out how to get this item — fall back
  return maxAllSkills(state, board, gameData);
}

function getSkillLevel(state: Character, skill: string): number {
  const map: Record<string, number> = {
    mining: state.mining_level,
    woodcutting: state.woodcutting_level,
    fishing: state.fishing_level,
    alchemy: state.alchemy_level,
  };
  return map[skill] ?? 0;
}
