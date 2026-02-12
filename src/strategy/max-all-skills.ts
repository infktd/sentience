import type { Character, Goal, SimpleItem } from "../types";
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

function findNpcBuyGoal(
  skill: string,
  maxLevel: number,
  bankItems: SimpleItem[],
  gameData: GameData
): Goal | null {
  const bankMap = new Map<string, number>();
  for (const bi of bankItems) bankMap.set(bi.code, bi.quantity);

  const recipes = gameData.getItemsForSkill(skill, maxLevel);
  // Sort by craft level descending — prefer highest level recipe
  recipes.sort((a, b) => (b.craft!.level ?? 0) - (a.craft!.level ?? 0));

  for (const recipe of recipes) {
    const materials = recipe.craft?.items ?? [];
    // Find the first missing material that an NPC can provide
    for (const mat of materials) {
      const bankQty = bankMap.get(mat.code) ?? 0;
      if (bankQty >= mat.quantity) continue; // already have enough

      const npcItem = gameData.getNpcItemForProduct(mat.code);
      if (!npcItem || npcItem.buy_price === null) continue;

      // Check if bank has enough of the NPC's currency
      const currencyInBank = bankMap.get(npcItem.currency) ?? 0;
      if (currencyInBank >= npcItem.buy_price) {
        return { type: "buy_npc", npc: npcItem.npc, item: mat.code, quantity: 1 };
      }
    }
  }
  return null;
}

export function maxAllSkills(
  state: Character,
  board: BoardSnapshot,
  gameData: GameData
): Goal {
  const skills = getSkillLevels(state);
  const othersTargets = getOthersTargets(board, state.name);
  const bankItems = board.bank.items;
  const freeInventory = state.inventory_max_items - state.inventory.reduce((sum, s) => sum + s.quantity, 0);

  // Sort by level ascending (lowest first)
  const sorted = [...skills].sort((a, b) => a.level - b.level);

  for (const entry of sorted) {
    // Skip if another character is already working on this skill
    if (othersTargets.has(entry.skill)) continue;

    if (entry.type === "gathering") {
      // Check if bank has enough raw materials to refine
      const craftable = gameData.getCraftableItems(entry.skill, entry.level, bankItems);
      if (craftable.length > 0) {
        const qty = gameData.getMaxCraftQuantity(craftable[0].code, bankItems, freeInventory);
        if (qty > 0) return { type: "craft", item: craftable[0].code, quantity: qty };
      }

      // Check if any crafting recipe needs materials we can gather
      const neededResource = gameData.findNeededGatherResource(
        entry.skill,
        entry.level,
        bankItems
      );
      if (neededResource) {
        const neededMaps = gameData.findMapsWithResource(neededResource.code);
        if (neededMaps.length > 0) {
          return { type: "gather", resource: neededResource.code };
        }
      }

      // Otherwise gather highest-level resource for XP
      const resources = gameData
        .getResourcesForSkill(entry.skill)
        .filter((r) => r.level <= entry.level)
        .sort((a, b) => b.level - a.level);

      if (resources.length === 0) continue;

      const maps = gameData.findMapsWithResource(resources[0].code);
      if (maps.length === 0) continue;

      return { type: "gather", resource: resources[0].code };
    }

    if (entry.type === "combat") {
      const monsters = gameData
        .getMonstersByLevel(entry.level)
        .sort((a, b) => b.level - a.level);

      if (monsters.length === 0) continue;

      const maps = gameData.findMapsWithMonster(monsters[0].code);
      if (maps.length === 0) continue;

      return { type: "fight", monster: monsters[0].code };
    }

    if (entry.type === "crafting") {
      // Check bank for craftable recipes
      const craftable = gameData.getCraftableItems(entry.skill, entry.level, bankItems);
      if (craftable.length > 0) {
        const qty = gameData.getMaxCraftQuantity(craftable[0].code, bankItems, freeInventory);
        if (qty > 0) return { type: "craft", item: craftable[0].code, quantity: qty };
      }

      // Check if any recipe is almost craftable — missing only NPC-buyable materials
      const npcBuy = findNpcBuyGoal(entry.skill, entry.level, bankItems, gameData);
      if (npcBuy) return npcBuy;

      // No materials available — skip to next skill
      continue;
    }
  }

  return { type: "idle", reason: "no valid goal found" };
}
