import type { Character, Goal } from "../types";
import type { BoardSnapshot } from "../board/board";
import type { GameData } from "../agent/game-data";

interface SkillEntry {
  skill: string;
  level: number;
  type: "gathering" | "crafting" | "combat";
}

function getSkillLevels(state: Character): SkillEntry[] {
  return [
    { skill: "mining", level: state.mining_level, type: "gathering" },
    { skill: "woodcutting", level: state.woodcutting_level, type: "gathering" },
    { skill: "fishing", level: state.fishing_level, type: "gathering" },
    { skill: "alchemy", level: state.alchemy_level, type: "gathering" },
    { skill: "weaponcrafting", level: state.weaponcrafting_level, type: "crafting" },
    { skill: "gearcrafting", level: state.gearcrafting_level, type: "crafting" },
    { skill: "jewelrycrafting", level: state.jewelrycrafting_level, type: "crafting" },
    { skill: "cooking", level: state.cooking_level, type: "crafting" },
    { skill: "combat", level: state.level, type: "combat" },
  ];
}

function getOthersTargets(board: BoardSnapshot, selfName: string): Set<string> {
  const targets = new Set<string>();
  for (const [name, charState] of Object.entries(board.characters)) {
    if (name === selfName) continue;
    if (charState.target) targets.add(charState.target);
  }
  return targets;
}

export function maxAllSkills(
  state: Character,
  board: BoardSnapshot,
  gameData: GameData
): Goal {
  const skills = getSkillLevels(state);
  const othersTargets = getOthersTargets(board, state.name);

  // Sort by level ascending (lowest first)
  const sorted = [...skills].sort((a, b) => a.level - b.level);

  for (const entry of sorted) {
    // Skip if another character is already working on this skill
    if (othersTargets.has(entry.skill)) continue;

    if (entry.type === "gathering") {
      // Find the best resource for this skill at our level
      const resources = gameData
        .getResourcesForSkill(entry.skill)
        .filter((r) => r.level <= entry.level)
        .sort((a, b) => b.level - a.level); // highest level we can do

      if (resources.length === 0) continue;

      // Check that a map exists for this resource
      const maps = gameData.findMapsWithResource(resources[0].code);
      if (maps.length === 0) continue;

      return { type: "gather", resource: resources[0].code };
    }

    if (entry.type === "combat") {
      // Find the strongest monster we can reasonably fight
      const monsters = gameData
        .getMonstersByLevel(entry.level)
        .sort((a, b) => b.level - a.level);

      if (monsters.length === 0) continue;

      // Check that a map exists for this monster
      const maps = gameData.findMapsWithMonster(monsters[0].code);
      if (maps.length === 0) continue;

      return { type: "fight", monster: monsters[0].code };
    }

    if (entry.type === "crafting") {
      // Crafting requires items in inventory - for now, skip and let
      // gathering/combat build up resources. Crafting strategy will
      // be enhanced later to check bank contents and craft when possible.
      continue;
    }
  }

  return { type: "idle", reason: "no valid goal found" };
}
