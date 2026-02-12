import type { Item } from "../types";

export type ActivityType =
  | "combat"
  | "gathering:mining"
  | "gathering:woodcutting"
  | "gathering:fishing"
  | "gathering:alchemy";

const COMBAT_EFFECTS = new Set([
  "attack_fire", "attack_water", "attack_earth", "attack_air",
  "dmg", "dmg_fire", "dmg_water", "dmg_earth", "dmg_air",
  "res_fire", "res_water", "res_earth", "res_air",
  "hp", "critical_strike", "haste", "initiative",
  "wisdom", "prospecting",
]);

const GATHERING_UNIVERSAL = new Set(["wisdom", "prospecting", "haste"]);

const GATHERING_EFFECTS: Record<string, Set<string>> = {
  "gathering:mining": new Set(["mining", ...GATHERING_UNIVERSAL]),
  "gathering:woodcutting": new Set(["woodcutting", ...GATHERING_UNIVERSAL]),
  "gathering:fishing": new Set(["fishing", ...GATHERING_UNIVERSAL]),
  "gathering:alchemy": new Set(["alchemy", ...GATHERING_UNIVERSAL]),
};

function getRelevantEffects(activity: ActivityType): Set<string> {
  if (activity === "combat") return COMBAT_EFFECTS;
  return GATHERING_EFFECTS[activity] ?? new Set();
}

const SWAP_PERCENT_THRESHOLD = 0.2;
const SWAP_ABSOLUTE_FLOOR = 5;

export function scoreItem(item: Item, activity: ActivityType): number {
  const relevant = getRelevantEffects(activity);
  if (!item.effects) return 0;
  return item.effects
    .filter((e) => relevant.has(e.code))
    .reduce((sum, e) => sum + e.value, 0);
}

export function shouldSwap(
  current: Item | null,
  candidate: Item,
  activity: ActivityType
): { swap: boolean; scoreDiff: number } {
  const currentScore = current ? scoreItem(current, activity) : 0;
  const candidateScore = scoreItem(candidate, activity);
  const diff = candidateScore - currentScore;

  if (diff <= 0) return { swap: false, scoreDiff: diff };

  // Empty slot: any positive candidate score is worth equipping
  if (!current) return { swap: candidateScore > 0, scoreDiff: diff };

  // Occupied slot: must exceed percentage threshold and absolute floor
  const percentImprovement = diff / currentScore;
  const meetsPercent = percentImprovement >= SWAP_PERCENT_THRESHOLD;
  const meetsFloor = diff >= SWAP_ABSOLUTE_FLOOR;

  return { swap: meetsPercent && meetsFloor, scoreDiff: diff };
}
