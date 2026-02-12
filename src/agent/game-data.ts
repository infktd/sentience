import type { GameMap, Resource, Monster, Item, ItemType, SimpleItem, NpcItem, Goal } from "../types";

const EQUIPMENT_TYPES: Set<ItemType> = new Set([
  "weapon", "shield", "helmet", "body_armor", "leg_armor", "boots",
  "ring", "amulet", "artifact", "rune", "bag",
]);

export class GameData {
  private maps: GameMap[] = [];
  private resources: Map<string, Resource> = new Map();
  private monsters: Map<string, Monster> = new Map();
  private items: Map<string, Item> = new Map();
  private npcItems: Map<string, NpcItem> = new Map(); // keyed by product code

  load(maps: GameMap[], resources: Resource[], monsters: Monster[], items: Item[] = []): void {
    this.maps = maps;
    for (const r of resources) this.resources.set(r.code, r);
    for (const m of monsters) this.monsters.set(m.code, m);
    for (const i of items) this.items.set(i.code, i);
  }

  findMapsWithResource(resourceCode: string): GameMap[] {
    return this.maps.filter(
      (m) =>
        m.interactions.content?.type === "resource" &&
        m.interactions.content.code === resourceCode
    );
  }

  findMapsWithMonster(monsterCode: string): GameMap[] {
    return this.maps.filter(
      (m) =>
        m.interactions.content?.type === "monster" &&
        m.interactions.content.code === monsterCode
    );
  }

  findMapsWithContent(contentType: string, contentCode?: string): GameMap[] {
    return this.maps.filter(
      (m) =>
        m.interactions.content?.type === contentType &&
        (contentCode === undefined || m.interactions.content.code === contentCode)
    );
  }

  findNearestBank(x: number, y: number): GameMap | undefined {
    const banks = this.findMapsWithContent("bank");
    if (banks.length === 0) return undefined;
    return banks.reduce((nearest, bank) => {
      const distA = Math.abs(nearest.x - x) + Math.abs(nearest.y - y);
      const distB = Math.abs(bank.x - x) + Math.abs(bank.y - y);
      return distB < distA ? bank : nearest;
    });
  }

  findNearestMap(
    x: number,
    y: number,
    maps: GameMap[]
  ): GameMap | undefined {
    if (maps.length === 0) return undefined;
    return maps.reduce((nearest, map) => {
      const distA = Math.abs(nearest.x - x) + Math.abs(nearest.y - y);
      const distB = Math.abs(map.x - x) + Math.abs(map.y - y);
      return distB < distA ? map : nearest;
    });
  }

  getResourceByCode(code: string): Resource | undefined {
    return this.resources.get(code);
  }

  getMonsterByCode(code: string): Monster | undefined {
    return this.monsters.get(code);
  }

  getResourcesForSkill(skill: string): Resource[] {
    return [...this.resources.values()].filter((r) => r.skill === skill);
  }

  getMonstersByLevel(maxLevel: number): Monster[] {
    return [...this.monsters.values()].filter((m) => m.level <= maxLevel);
  }

  getItemByCode(code: string): Item | undefined {
    return this.items.get(code);
  }

  getEquippableItems(): Item[] {
    return [...this.items.values()].filter((i) => EQUIPMENT_TYPES.has(i.type));
  }

  getCraftableItems(skill: string, maxLevel: number, bankItems: SimpleItem[]): Item[] {
    const bankMap = new Map<string, number>();
    for (const bi of bankItems) bankMap.set(bi.code, bi.quantity);

    const results: Item[] = [];
    for (const item of this.items.values()) {
      if (!item.craft) continue;
      if (item.craft.skill !== skill) continue;
      if ((item.craft.level ?? 0) > maxLevel) continue;

      const hasAllMaterials = item.craft.items?.every(
        (mat) => (bankMap.get(mat.code) ?? 0) >= mat.quantity
      ) ?? false;

      if (hasAllMaterials) results.push(item);
    }

    results.sort((a, b) => (b.craft!.level ?? 0) - (a.craft!.level ?? 0));
    return results;
  }

  loadNpcItems(npcItems: NpcItem[]): void {
    for (const ni of npcItems) {
      if (ni.buy_price !== null) {
        this.npcItems.set(ni.code, ni);
      }
    }
  }

  getNpcItemForProduct(code: string): NpcItem | undefined {
    return this.npcItems.get(code);
  }

  findNpcMap(npcCode: string): GameMap | undefined {
    return this.maps.find(
      (m) =>
        m.interactions.content?.type === "npc" &&
        m.interactions.content.code === npcCode
    );
  }

  getItemsForSkill(skill: string, maxLevel: number): Item[] {
    return [...this.items.values()].filter(
      (i) => i.craft?.skill === skill && (i.craft.level ?? 0) <= maxLevel
    );
  }

  getMaxCraftQuantity(itemCode: string, bankItems: SimpleItem[], inventoryCapacity: number): number {
    const item = this.items.get(itemCode);
    if (!item?.craft?.items) return 1;

    const bankMap = new Map<string, number>();
    for (const bi of bankItems) bankMap.set(bi.code, bi.quantity);

    // Max based on available materials
    let maxByMaterials = Infinity;
    let materialsPerCraft = 0;
    for (const mat of item.craft.items) {
      const available = bankMap.get(mat.code) ?? 0;
      maxByMaterials = Math.min(maxByMaterials, Math.floor(available / mat.quantity));
      materialsPerCraft += mat.quantity;
    }

    // Max based on inventory space (need to carry all materials)
    const maxByInventory = materialsPerCraft > 0
      ? Math.floor(inventoryCapacity / materialsPerCraft)
      : 1;

    return Math.min(maxByMaterials, maxByInventory);
  }

  findResourceForDrop(itemCode: string): Resource | undefined {
    for (const resource of this.resources.values()) {
      if (resource.drops.some((d) => d.code === itemCode)) {
        return resource;
      }
    }
    return undefined;
  }

  findMonsterForDrop(itemCode: string): Monster | undefined {
    for (const monster of this.monsters.values()) {
      if (monster.drops.some((d) => d.code === itemCode)) {
        return monster;
      }
    }
    return undefined;
  }

  findNeededGatherResource(
    gatheringSkill: string,
    gatheringLevel: number,
    bankItems: SimpleItem[]
  ): Resource | null {
    // Get resources this skill can gather at this level
    const gatherableResources = this.getResourcesForSkill(gatheringSkill)
      .filter((r) => r.level <= gatheringLevel);

    // Map: drop item code → resource that drops it
    const dropToResource = new Map<string, Resource>();
    for (const resource of gatherableResources) {
      for (const drop of resource.drops) {
        dropToResource.set(drop.code, resource);
      }
    }

    const bankMap = new Map<string, number>();
    for (const bi of bankItems) bankMap.set(bi.code, bi.quantity);

    // Find recipes with missing materials that we can gather
    // Prefer the resource that feeds the highest-level recipe
    let bestResource: Resource | null = null;
    let bestRecipeLevel = -1;

    for (const item of this.items.values()) {
      if (!item.craft?.items) continue;
      for (const mat of item.craft.items) {
        const bankQty = bankMap.get(mat.code) ?? 0;
        if (bankQty >= mat.quantity) continue; // already have enough

        const resource = dropToResource.get(mat.code);
        if (resource && (item.craft.level ?? 0) > bestRecipeLevel) {
          bestResource = resource;
          bestRecipeLevel = item.craft.level ?? 0;
        }
      }
    }

    return bestResource;
  }

  getBestUtilityItems(characterLevel: number, bankItems: SimpleItem[]): Item[] {
    const bankMap = new Map<string, number>();
    for (const bi of bankItems) bankMap.set(bi.code, bi.quantity);

    const available: Item[] = [];
    for (const item of this.items.values()) {
      if (item.type !== "utility") continue;
      if (item.level > characterLevel) continue;
      if ((bankMap.get(item.code) ?? 0) === 0) continue;
      available.push(item);
    }

    // Sort: prefer health restore potions first, then by level descending
    available.sort((a, b) => {
      const aRestore = a.effects?.some((e) => e.code === "restore") ? 1 : 0;
      const bRestore = b.effects?.some((e) => e.code === "restore") ? 1 : 0;
      if (aRestore !== bRestore) return bRestore - aRestore;
      return b.level - a.level;
    });

    return available.slice(0, 2);
  }

  /**
   * Recursively resolve an item's full crafting chain into the first actionable goal.
   * Walks the dependency tree: if the item needs materials, and those materials
   * are themselves craftable, it recurses until it finds something the character
   * can actually do right now (gather, craft, fight, or buy).
   */
  resolveItemChain(
    targetCode: string,
    bankItems: SimpleItem[],
    skillLevels: Record<string, number>,
    freeInventory: number,
    visited?: Set<string>
  ): Goal | null {
    visited = visited ?? new Set();
    if (visited.has(targetCode)) return null; // circular dependency
    visited.add(targetCode);

    const bankMap = new Map<string, number>();
    for (const bi of bankItems) bankMap.set(bi.code, bi.quantity);

    const item = this.items.get(targetCode);

    // If item is craftable and character has the skill level, try the crafting path
    if (item?.craft?.items) {
      const craftSkill = item.craft.skill!;
      const craftLevel = item.craft.level ?? 0;
      const charSkillLevel = skillLevels[craftSkill] ?? 0;

      if (charSkillLevel >= craftLevel) {
        // Check if all materials are already in bank
        const allAvailable = item.craft.items.every(
          (mat) => (bankMap.get(mat.code) ?? 0) >= mat.quantity
        );

        if (allAvailable) {
          const qty = this.getMaxCraftQuantity(targetCode, bankItems, freeInventory);
          if (qty > 0) return { type: "craft", item: targetCode, quantity: qty };
        }

        // Missing materials — try to resolve each one
        for (const mat of item.craft.items) {
          const have = bankMap.get(mat.code) ?? 0;
          if (have >= mat.quantity) continue;

          const subGoal = this.resolveItemChain(
            mat.code, bankItems, skillLevels, freeInventory, visited
          );
          if (subGoal) return subGoal;
        }
      }
    }

    // Not craftable (or can't resolve crafting path) — try direct obtainment

    // 1. Gatherable from a resource?
    const resource = this.findResourceForDrop(targetCode);
    if (resource) {
      const gatherLevel = skillLevels[resource.skill] ?? 0;
      if (resource.level <= gatherLevel) {
        const maps = this.findMapsWithResource(resource.code);
        if (maps.length > 0) {
          return { type: "gather", resource: resource.code };
        }
      }
    }

    // 2. Buyable from NPC?
    const npcItem = this.getNpcItemForProduct(targetCode);
    if (npcItem && npcItem.buy_price !== null) {
      const currencyInBank = bankMap.get(npcItem.currency) ?? 0;
      if (currencyInBank >= npcItem.buy_price) {
        return { type: "buy_npc", npc: npcItem.npc, item: targetCode, quantity: 1 };
      }
    }

    // 3. Monster drop?
    const monster = this.findMonsterForDrop(targetCode);
    if (monster) {
      const combatLevel = skillLevels.combat ?? 0;
      if (monster.level <= combatLevel) {
        const maps = this.findMapsWithMonster(monster.code);
        if (maps.length > 0) {
          return { type: "fight", monster: monster.code };
        }
      }
    }

    return null; // Can't resolve this item
  }

  findTasksMaster(taskType: string): GameMap | undefined {
    return this.maps.find(
      (m) =>
        m.interactions.content?.type === "tasks_master" &&
        m.interactions.content.code === taskType
    );
  }
}
