import type { Character, Goal, SimpleItem } from "../types";
import type { GameData } from "../agent/game-data";

export interface SkillBottleneck {
  skill: string;
  level: number; // average across team
  type: "gathering" | "crafting" | "combat";
}

export interface PipelineStage {
  type: "gather" | "craft" | "fight";
  skill: string;
  resource?: string;
  item?: string;
  quantity?: number;
  monster?: string;
}

const SKILL_EXTRACTORS: Array<{
  skill: string;
  type: "gathering" | "crafting" | "combat";
  getLevel: (c: Character) => number;
}> = [
  { skill: "mining", type: "gathering", getLevel: (c) => c.mining_level },
  { skill: "woodcutting", type: "gathering", getLevel: (c) => c.woodcutting_level },
  { skill: "fishing", type: "gathering", getLevel: (c) => c.fishing_level },
  { skill: "alchemy", type: "gathering", getLevel: (c) => c.alchemy_level },
  { skill: "weaponcrafting", type: "crafting", getLevel: (c) => c.weaponcrafting_level },
  { skill: "gearcrafting", type: "crafting", getLevel: (c) => c.gearcrafting_level },
  { skill: "jewelrycrafting", type: "crafting", getLevel: (c) => c.jewelrycrafting_level },
  { skill: "cooking", type: "crafting", getLevel: (c) => c.cooking_level },
  { skill: "combat", type: "combat", getLevel: (c) => c.level },
];

export function getTeamBottleneck(characters: Character[]): SkillBottleneck[] {
  if (characters.length === 0) return [];

  const bottlenecks: SkillBottleneck[] = SKILL_EXTRACTORS.map(({ skill, type, getLevel }) => {
    const total = characters.reduce((sum, c) => sum + getLevel(c), 0);
    const avg = Math.round(total / characters.length);
    return { skill, level: avg, type };
  });

  bottlenecks.sort((a, b) => a.level - b.level);
  return bottlenecks;
}

export function buildPipelineStages(
  targetSkill: string,
  maxLevel: number,
  bankItems: SimpleItem[],
  gameData: GameData
): PipelineStage[] {
  const bankMap = new Map<string, number>();
  for (const bi of bankItems) bankMap.set(bi.code, bi.quantity);

  const stages: PipelineStage[] = [];

  // Combat skill → just fight monsters
  if (targetSkill === "combat") {
    const monsters = gameData.getMonstersByLevel(maxLevel).sort((a, b) => b.level - a.level);
    if (monsters.length > 0) {
      stages.push({ type: "fight", skill: "combat", monster: monsters[0].code });
    }
    return stages;
  }

  // Gathering skill → gather resource + refine
  const isGathering = ["mining", "woodcutting", "fishing", "alchemy"].includes(targetSkill);
  if (isGathering) {
    // Find the highest-level craftable item for this gathering skill (refining)
    const craftableItems = gameData.getItemsForSkill(targetSkill, maxLevel);
    craftableItems.sort((a, b) => (b.craft!.level ?? 0) - (a.craft!.level ?? 0));

    if (craftableItems.length > 0) {
      const bestRecipe = craftableItems[0];
      const materials = bestRecipe.craft?.items ?? [];

      // Check if bank has enough materials to refine
      const hasEnoughForRefine = materials.every(
        (mat) => (bankMap.get(mat.code) ?? 0) >= mat.quantity * 5 // enough for at least 5 crafts
      );

      if (hasEnoughForRefine) {
        // Just refine — bank is stocked
        stages.push({
          type: "craft",
          skill: targetSkill,
          item: bestRecipe.code,
          quantity: 1,
        });
      } else {
        // Need to gather raw materials first
        for (const mat of materials) {
          const resource = gameData.findResourceForDrop(mat.code);
          if (resource && resource.skill === targetSkill) {
            const maps = gameData.findMapsWithResource(resource.code);
            if (maps.length > 0) {
              stages.push({
                type: "gather",
                skill: targetSkill,
                resource: resource.code,
              });
            }
          }
        }
        // Then refine
        stages.push({
          type: "craft",
          skill: targetSkill,
          item: bestRecipe.code,
          quantity: 1,
        });
      }
    } else {
      // No craftable items — just gather highest-level resource
      const resources = gameData.getResourcesForSkill(targetSkill)
        .filter((r) => r.level <= maxLevel)
        .sort((a, b) => b.level - a.level);
      if (resources.length > 0) {
        stages.push({
          type: "gather",
          skill: targetSkill,
          resource: resources[0].code,
        });
      }
    }
    return stages;
  }

  // Crafting skill → need materials from gathering/fighting, then craft
  const craftableItems = gameData.getItemsForSkill(targetSkill, maxLevel);
  craftableItems.sort((a, b) => (b.craft!.level ?? 0) - (a.craft!.level ?? 0));

  if (craftableItems.length === 0) return stages;

  const bestRecipe = craftableItems[0];
  const materials = bestRecipe.craft?.items ?? [];

  for (const mat of materials) {
    const bankQty = bankMap.get(mat.code) ?? 0;
    if (bankQty >= mat.quantity * 5) continue; // enough in bank, skip this material

    // Try to find source for this material
    // 1. Resource drop (gathering)
    const resource = gameData.findResourceForDrop(mat.code);
    if (resource) {
      const maps = gameData.findMapsWithResource(resource.code);
      if (maps.length > 0) {
        stages.push({ type: "gather", skill: resource.skill, resource: resource.code });
        continue;
      }
    }

    // 2. Craftable intermediate (e.g., copper_bar from copper_ore)
    const intermediateItem = gameData.getItemByCode(mat.code);
    if (intermediateItem?.craft?.items) {
      // Add stages for the intermediate
      const intermediateMaterials = intermediateItem.craft.items;
      for (const iMat of intermediateMaterials) {
        const iResource = gameData.findResourceForDrop(iMat.code);
        if (iResource) {
          const maps = gameData.findMapsWithResource(iResource.code);
          if (maps.length > 0) {
            // Only add gather if bank doesn't have enough
            const iBankQty = bankMap.get(iMat.code) ?? 0;
            if (iBankQty < iMat.quantity * 5) {
              stages.push({ type: "gather", skill: iResource.skill, resource: iResource.code });
            }
          }
        }
      }
      stages.push({
        type: "craft",
        skill: intermediateItem.craft.skill!,
        item: mat.code,
        quantity: 1,
      });
      continue;
    }

    // 3. Monster drop
    const monster = gameData.findMonsterForDrop(mat.code);
    if (monster) {
      stages.push({ type: "fight", skill: "combat", monster: monster.code });
    }
  }

  // Final stage: craft the target item — only if bank has at least some materials
  const hasAnyMaterial = materials.some(
    (mat) => (bankMap.get(mat.code) ?? 0) >= mat.quantity
  );
  if (hasAnyMaterial) {
    stages.push({
      type: "craft",
      skill: targetSkill,
      item: bestRecipe.code,
      quantity: 1,
    });
  }

  // Deduplicate stages by key
  const seen = new Set<string>();
  return stages.filter((stage) => {
    const key = stageKey(stage);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stageKey(stage: PipelineStage): string {
  if (stage.type === "gather") return `gather:${stage.resource}`;
  if (stage.type === "craft") return `craft:${stage.item}`;
  if (stage.type === "fight") return `fight:${stage.monster}`;
  return `${stage.type}`;
}

export function assignCharacterToStage(
  name: string,
  state: Character,
  stages: PipelineStage[],
  currentAssignments: Map<string, string>,
  previousAssignment?: string
): Goal {
  if (stages.length === 0) {
    return { type: "idle", reason: "no pipeline stages available" };
  }

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

  // Count how many OTHER characters are assigned to each stage
  const stageCounts = new Map<string, number>();
  for (const [charName, assignment] of currentAssignments) {
    if (charName === name) continue; // exclude self
    stageCounts.set(assignment, (stageCounts.get(assignment) ?? 0) + 1);
  }

  // Score each stage for this character
  // Lower score = more needed (lower skill level = more XP benefit)
  let bestStage: PipelineStage | null = null;
  let bestScore = Infinity;

  for (const stage of stages) {
    const key = stageKey(stage);
    const assignedCount = stageCounts.get(key) ?? 0;

    // Skill level for this stage — lower = more XP benefit for this character
    const charSkillLevel = skillLevels[stage.skill] ?? 1;

    // Base score: character's skill level (lower = better assignment)
    let score = charSkillLevel;

    // Penalize stages that already have characters on them (spread work)
    // But don't block — just prefer less-covered stages
    score += assignedCount * 3;

    // Anti-thrash: if this character was previously on this stage, discount score
    if (previousAssignment === key) {
      score *= 0.7; // 30% discount for staying put
    }

    if (score < bestScore) {
      bestScore = score;
      bestStage = stage;
    }
  }

  if (!bestStage) {
    return { type: "idle", reason: "no suitable pipeline stage" };
  }

  return stageToGoal(bestStage);
}

function stageToGoal(stage: PipelineStage): Goal {
  switch (stage.type) {
    case "gather":
      return { type: "gather", resource: stage.resource! };
    case "craft":
      return { type: "craft", item: stage.item!, quantity: stage.quantity ?? 1 };
    case "fight":
      return { type: "fight", monster: stage.monster! };
  }
}
