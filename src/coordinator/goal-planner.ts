import type { Character, SimpleItem } from "../types";
import type { GameData } from "../agent/game-data";
import type { PipelineStage } from "./pipeline";
import { getTeamBottleneck, buildPipelineStages } from "./pipeline";

export interface MaterialNeed {
  code: string;
  quantityNeeded: number;
  source: "gather" | "craft" | "monster_drop";
  sourceCode: string; // resource code, recipe code, or monster code
}

export interface PlanProgress {
  banked: Map<string, number>;
  inFlight: Map<string, number>;
  crafted: number;
}

export interface ActivePlan {
  targetSkill: string;
  targetRecipe: string;
  materialNeeds: MaterialNeed[];
  stages: PipelineStage[];
  progress: PlanProgress;
  status: "active" | "completed";
  mode: "auto" | "manual";
}

const SKILL_LEVEL_FIELDS: Record<string, keyof Character> = {
  mining: "mining_level",
  woodcutting: "woodcutting_level",
  fishing: "fishing_level",
  alchemy: "alchemy_level",
  weaponcrafting: "weaponcrafting_level",
  gearcrafting: "gearcrafting_level",
  jewelrycrafting: "jewelrycrafting_level",
  cooking: "cooking_level",
  combat: "level",
};

function getSkillLevel(char: Character, skill: string): number {
  const field = SKILL_LEVEL_FIELDS[skill];
  return field ? (char[field] as number) : 1;
}

function getTeamMaxSkillLevel(characters: Character[], skill: string): number {
  let max = 1;
  for (const c of characters) {
    const lvl = getSkillLevel(c, skill);
    if (lvl > max) max = lvl;
  }
  return max;
}

export function buildActivePlan(
  targetSkill: string,
  characters: Character[],
  bankItems: SimpleItem[],
  gameData: GameData
): ActivePlan | null {
  const maxLevel = getTeamMaxSkillLevel(characters, targetSkill);

  // Combat skill — just fight, no recipe
  if (targetSkill === "combat") {
    const stages = buildPipelineStages(targetSkill, maxLevel, bankItems, gameData);
    if (stages.length === 0) return null;

    return {
      targetSkill,
      targetRecipe: stages[0].monster ?? "",
      materialNeeds: [],
      stages,
      progress: { banked: new Map(), inFlight: new Map(), crafted: 0 },
      status: "active",
      mode: "auto",
    };
  }

  // Find best recipe for this skill at team's max level
  const craftableItems = gameData.getItemsForSkill(targetSkill, maxLevel);
  if (craftableItems.length === 0) return null;

  // Sort by craft level descending — pick the highest-level recipe
  craftableItems.sort((a, b) => (b.craft!.level ?? 0) - (a.craft!.level ?? 0));
  const bestRecipe = craftableItems[0];
  const recipeMaterials = bestRecipe.craft?.items ?? [];

  // Build material needs by walking the recipe chain
  const materialNeeds: MaterialNeed[] = [];
  const visited = new Set<string>();

  function walkMaterials(materials: SimpleItem[], depth: number): void {
    if (depth > 10) return; // safety guard
    for (const mat of materials) {
      if (visited.has(mat.code)) continue;
      visited.add(mat.code);

      // Is it gatherable from a resource?
      const resource = gameData.findResourceForDrop(mat.code);
      if (resource) {
        materialNeeds.push({
          code: mat.code,
          quantityNeeded: mat.quantity,
          source: "gather",
          sourceCode: resource.code,
        });
        continue;
      }

      // Is it craftable (intermediate)?
      const item = gameData.getItemByCode(mat.code);
      if (item?.craft?.items) {
        materialNeeds.push({
          code: mat.code,
          quantityNeeded: mat.quantity,
          source: "craft",
          sourceCode: mat.code,
        });
        // Walk sub-materials
        walkMaterials(item.craft.items, depth + 1);
        continue;
      }

      // Is it a monster drop?
      const monster = gameData.findMonsterForDrop(mat.code);
      if (monster) {
        materialNeeds.push({
          code: mat.code,
          quantityNeeded: mat.quantity,
          source: "monster_drop",
          sourceCode: monster.code,
        });
        continue;
      }
    }
  }

  walkMaterials(recipeMaterials, 0);

  // Build pipeline stages
  const stages = buildPipelineStages(targetSkill, maxLevel, bankItems, gameData);

  return {
    targetSkill,
    targetRecipe: bestRecipe.code,
    materialNeeds,
    stages,
    progress: { banked: new Map(), inFlight: new Map(), crafted: 0 },
    status: "active",
    mode: "auto",
  };
}

export function updatePlanProgress(
  plan: ActivePlan,
  bankItems: SimpleItem[],
  characterStates: Map<string, Character>
): void {
  const neededCodes = new Set(plan.materialNeeds.map((n) => n.code));

  // Update banked
  plan.progress.banked = new Map();
  for (const bi of bankItems) {
    if (neededCodes.has(bi.code)) {
      plan.progress.banked.set(bi.code, bi.quantity);
    }
  }

  // Update inFlight from character inventories
  plan.progress.inFlight = new Map();
  for (const char of characterStates.values()) {
    for (const slot of char.inventory) {
      if (!neededCodes.has(slot.code)) continue;
      const current = plan.progress.inFlight.get(slot.code) ?? 0;
      plan.progress.inFlight.set(slot.code, current + slot.quantity);
    }
  }
}

export function shouldCompletePlan(
  plan: ActivePlan,
  currentCharacters: Character[]
): boolean {
  if (currentCharacters.length === 0) return false;

  const bottlenecks = getTeamBottleneck(currentCharacters);
  if (bottlenecks.length === 0) return false;

  // The plan's target skill must no longer be the lowest.
  // If the target skill is still tied for the lowest, the plan continues.
  const lowestLevel = bottlenecks[0].level;
  const targetBottleneck = bottlenecks.find((b) => b.skill === plan.targetSkill);
  if (!targetBottleneck) return true; // skill not found = plan should complete

  // Target is still at the bottom → plan continues
  if (targetBottleneck.level <= lowestLevel) return false;

  // Target has risen above the lowest → bottleneck has shifted
  return true;
}

export function shouldDeposit(
  plan: ActivePlan,
  characterName: string,
  characterState: Character,
  assignments: Map<string, string>, // name → stage key
  bankItems: SimpleItem[]
): boolean {
  const neededCodes = new Set(plan.materialNeeds.map((n) => n.code));

  // Count needed items in this character's inventory
  let neededItemCount = 0;
  const inventoryNeeded = new Map<string, number>();
  for (const slot of characterState.inventory) {
    if (!neededCodes.has(slot.code)) continue;
    neededItemCount += slot.quantity;
    inventoryNeeded.set(slot.code, (inventoryNeeded.get(slot.code) ?? 0) + slot.quantity);
  }

  // No plan-relevant items → never deposit
  if (neededItemCount === 0) return false;

  // Batch threshold: >= 10 needed items
  if (neededItemCount >= 10) return true;

  // Crafter-starved trigger: another character is assigned to craft
  // but bank doesn't have enough for 1x recipe, AND this character has needed items
  const bankMap = new Map<string, number>();
  for (const bi of bankItems) bankMap.set(bi.code, bi.quantity);

  for (const [name, stageKey] of assignments) {
    if (name === characterName) continue; // don't trigger on self
    if (!stageKey.startsWith("craft:")) continue;

    const craftItemCode = stageKey.slice("craft:".length);
    const craftItem = plan.materialNeeds.find(
      (n) => n.source === "craft" && n.code === craftItemCode
    );

    // Also check the target recipe itself
    const item = findCraftRecipeMaterials(plan, craftItemCode);
    if (!item) continue;

    // Check if bank has < 1x recipe materials
    const isStarved = item.some(
      (mat) => (bankMap.get(mat.code) ?? 0) < mat.quantity
    );

    if (!isStarved) continue;

    // Check if this character has any of the starved materials
    for (const mat of item) {
      if ((inventoryNeeded.get(mat.code) ?? 0) > 0) {
        return true;
      }
    }
  }

  return false;
}

function findCraftRecipeMaterials(
  plan: ActivePlan,
  craftItemCode: string
): SimpleItem[] | null {
  // Find the materialNeeds that source from this craft
  // and return the raw materials needed
  for (const need of plan.materialNeeds) {
    if (need.code === craftItemCode && need.source === "craft") {
      // The materials for this craft are the gather/drop needs
      // For now, return all gather needs as they feed into the craft
      return plan.materialNeeds
        .filter((n) => n.source === "gather" || n.source === "monster_drop")
        .map((n) => ({ code: n.code, quantity: n.quantityNeeded }));
    }
  }

  // If the craftItemCode is the targetRecipe itself
  if (craftItemCode === plan.targetRecipe) {
    // Materials are the direct materialNeeds that aren't the target recipe
    return plan.materialNeeds
      .filter((n) => n.code !== craftItemCode)
      .map((n) => ({ code: n.code, quantity: n.quantityNeeded }));
  }

  return null;
}
