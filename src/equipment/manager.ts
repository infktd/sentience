import type { Character, Item, SimpleItem, ItemSlot, ItemType } from "../types";
import type { GameData } from "../agent/game-data";
import { scoreItem, shouldSwap, type ActivityType } from "./evaluator";

export interface EquipmentChange {
  slot: ItemSlot;
  unequipCode: string | null;
  equipCode: string;
  scoreDiff: number;
}

const SLOT_TO_ITEM_TYPE: Record<string, ItemType> = {
  weapon: "weapon",
  shield: "shield",
  helmet: "helmet",
  body_armor: "body_armor",
  leg_armor: "leg_armor",
  boots: "boots",
  ring1: "ring",
  ring2: "ring",
  amulet: "amulet",
  artifact1: "artifact",
  artifact2: "artifact",
  artifact3: "artifact",
  rune: "rune",
  bag: "bag",
};

const CHARACTER_SLOT_FIELDS: Record<string, keyof Character> = {
  weapon: "weapon_slot",
  shield: "shield_slot",
  helmet: "helmet_slot",
  body_armor: "body_armor_slot",
  leg_armor: "leg_armor_slot",
  boots: "boots_slot",
  ring1: "ring1_slot",
  ring2: "ring2_slot",
  amulet: "amulet_slot",
  artifact1: "artifact1_slot",
  artifact2: "artifact2_slot",
  artifact3: "artifact3_slot",
  rune: "rune_slot",
  bag: "bag_slot",
};

function getEquippedCode(character: Character, slot: string): string {
  const field = CHARACTER_SLOT_FIELDS[slot];
  if (!field) return "";
  return character[field] as string;
}

export function getEquipmentChanges(
  character: Character,
  bankItems: SimpleItem[],
  gameData: GameData,
  activity: ActivityType
): EquipmentChange[] {
  const changes: EquipmentChange[] = [];

  for (const [slot, itemType] of Object.entries(SLOT_TO_ITEM_TYPE)) {
    const currentCode = getEquippedCode(character, slot);
    const currentItem = currentCode ? gameData.getItemByCode(currentCode) ?? null : null;

    let bestCandidate: Item | null = null;
    let bestScore = -1;

    for (const bankItem of bankItems) {
      const item = gameData.getItemByCode(bankItem.code);
      if (!item) continue;
      if (item.type !== itemType) continue;
      if (item.level > character.level) continue;

      const score = scoreItem(item, activity);
      if (score > bestScore) {
        bestScore = score;
        bestCandidate = item;
      }
    }

    if (!bestCandidate) continue;

    const result = shouldSwap(currentItem, bestCandidate, activity);
    if (result.swap) {
      changes.push({
        slot: slot as ItemSlot,
        unequipCode: currentCode || null,
        equipCode: bestCandidate.code,
        scoreDiff: result.scoreDiff,
      });
    }
  }

  changes.sort((a, b) => b.scoreDiff - a.scoreDiff);
  return changes;
}
