import type { GameMap, Resource, Monster, Item, ItemType, SimpleItem, NpcItem, Goal, ActiveEvent, TaskDefinition, Character, ItemSlot, GEOrder } from "../types";
import { scoreItem, type ActivityType } from "../equipment/evaluator";

const EQUIPMENT_TYPES: Set<ItemType> = new Set([
  "weapon", "shield", "helmet", "body_armor", "leg_armor", "boots",
  "ring", "amulet", "artifact", "rune", "bag",
]);

export class GameData {
  private maps: GameMap[] = [];
  private eventMaps: GameMap[] = []; // maps added by active events
  private resources: Map<string, Resource> = new Map();
  private monsters: Map<string, Monster> = new Map();
  private items: Map<string, Item> = new Map();
  private npcItems: Map<string, NpcItem> = new Map(); // keyed by product code
  private tasks: TaskDefinition[] = [];

  load(maps: GameMap[], resources: Resource[], monsters: Monster[], items: Item[] = []): void {
    this.maps = maps;
    for (const r of resources) this.resources.set(r.code, r);
    for (const m of monsters) this.monsters.set(m.code, m);
    for (const i of items) this.items.set(i.code, i);
  }

  private getAllMaps(): GameMap[] {
    if (this.eventMaps.length === 0) return this.maps;
    return [...this.maps, ...this.eventMaps];
  }

  applyEvents(events: ActiveEvent[]): void {
    if (events.length === 0) {
      this.eventMaps = [];
      return;
    }
    // Event maps replace any previously applied event maps
    this.eventMaps = events.map((e) => e.map);
  }

  findMapsWithResource(resourceCode: string): GameMap[] {
    return this.getAllMaps().filter(
      (m) =>
        m.interactions.content?.type === "resource" &&
        m.interactions.content.code === resourceCode
    );
  }

  findMapsWithMonster(monsterCode: string): GameMap[] {
    return this.getAllMaps().filter(
      (m) =>
        m.interactions.content?.type === "monster" &&
        m.interactions.content.code === monsterCode
    );
  }

  findMapsWithContent(contentType: string, contentCode?: string): GameMap[] {
    return this.getAllMaps().filter(
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

  loadTasks(taskDefs: TaskDefinition[]): void {
    this.tasks = taskDefs;
  }

  getTaskDefinitions(): TaskDefinition[] {
    return this.tasks;
  }

  /**
   * Check if a task is achievable by a character.
   * For monster tasks: monster must exist and character level must be high enough.
   * For item tasks: resolveItemChain must be able to find a path.
   */
  isTaskAchievable(
    task: { code: string; type: "monsters" | "items" },
    skillLevels: Record<string, number>,
    bankItems: SimpleItem[]
  ): boolean {
    if (task.type === "monsters") {
      const monster = this.monsters.get(task.code);
      if (!monster) return false;
      const combatLevel = skillLevels.combat ?? 0;
      // Must be within 5 levels to have a reasonable shot
      if (monster.level > combatLevel + 5) return false;
      const maps = this.findMapsWithMonster(task.code);
      return maps.length > 0;
    }

    if (task.type === "items") {
      const goal = this.resolveItemChain(task.code, bankItems, skillLevels, 100);
      return goal !== null;
    }

    return false;
  }

  /**
   * Determine which task type the character is best suited for.
   * Characters with higher combat vs crafting/gathering go to monsters.
   */
  evaluateBestTaskType(character: Character): "monsters" | "items" {
    const combatLevel = character.level;
    const avgCraftGather = (
      character.mining_level +
      character.woodcutting_level +
      character.fishing_level +
      character.alchemy_level +
      character.weaponcrafting_level +
      character.gearcrafting_level +
      character.jewelrycrafting_level +
      character.cooking_level
    ) / 8;

    return combatLevel >= avgCraftGather ? "monsters" : "items";
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
    return this.getAllMaps().find(
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

  private static readonly SLOT_TO_ITEM_TYPE: Record<string, ItemType> = {
    weapon: "weapon",
    shield: "shield",
    helmet: "helmet",
    body_armor: "body_armor",
    leg_armor: "leg_armor",
    boots: "boots",
    ring1: "ring",
    ring2: "ring",
    amulet: "amulet",
  };

  private static readonly CHAR_SLOT_FIELDS: Record<string, keyof Character> = {
    weapon: "weapon_slot",
    shield: "shield_slot",
    helmet: "helmet_slot",
    body_armor: "body_armor_slot",
    leg_armor: "leg_armor_slot",
    boots: "boots_slot",
    ring1: "ring1_slot",
    ring2: "ring2_slot",
    amulet: "amulet_slot",
  };

  /**
   * Find a craftable equipment upgrade for a character.
   * Scans all equipment slots, compares current score to craftable items.
   * Returns a craft/gather/fight goal if an upgrade path exists, null otherwise.
   */
  findCraftableUpgrade(
    character: Character,
    activity: ActivityType | ActivityType[],
    bankItems: SimpleItem[],
    freeInventory: number
  ): Goal | null {
    const activities = Array.isArray(activity) ? activity : [activity];
    const skillLevels: Record<string, number> = {
      mining: character.mining_level,
      woodcutting: character.woodcutting_level,
      fishing: character.fishing_level,
      alchemy: character.alchemy_level,
      weaponcrafting: character.weaponcrafting_level,
      gearcrafting: character.gearcrafting_level,
      jewelrycrafting: character.jewelrycrafting_level,
      cooking: character.cooking_level,
      combat: character.level,
    };

    let bestUpgradeGoal: Goal | null = null;
    let bestImprovement = 0;

    for (const act of activities) {
      for (const [slot, itemType] of Object.entries(GameData.SLOT_TO_ITEM_TYPE)) {
        const field = GameData.CHAR_SLOT_FIELDS[slot];
        const currentCode = field ? (character[field] as string) : "";
        const currentItem = currentCode ? this.getItemByCode(currentCode) : undefined;
        const currentScore = currentItem ? scoreItem(currentItem, act) : 0;

        // Scan all craftable items of this type
        for (const item of this.items.values()) {
          if (item.type !== itemType) continue;
          if (!item.craft?.items) continue;
          if (item.level > character.level) continue;
          if ((item.craft.level ?? 0) > (skillLevels[item.craft.skill!] ?? 0)) continue;

          const candidateScore = scoreItem(item, act);
          if (candidateScore <= 0) continue;

          const improvement = candidateScore - currentScore;
          // Must be 20%+ improvement (or empty slot with positive score)
          const meetsThreshold = currentScore === 0
            ? candidateScore > 0
            : improvement / currentScore >= 0.2;

          if (meetsThreshold && improvement > bestImprovement) {
            // Try to resolve the crafting chain
            const goal = this.resolveItemChain(
              item.code, bankItems, skillLevels, freeInventory
            );
            if (goal) {
              bestUpgradeGoal = goal;
              bestImprovement = improvement;
            }
          }
        }
      }
    }

    return bestUpgradeGoal;
  }

  /**
   * Find a GE buy goal for an item. Checks available orders, returns cheapest within budget.
   */
  findGEBuyGoal(
    itemCode: string,
    maxPrice: number,
    quantity: number,
    geOrders: GEOrder[]
  ): Goal | null {
    const matching = geOrders
      .filter((o) => o.code === itemCode && o.price <= maxPrice && o.quantity > 0)
      .sort((a, b) => a.price - b.price);

    if (matching.length === 0) return null;

    const cheapest = matching[0];
    const affordableQty = Math.floor(maxPrice / cheapest.price);
    if (affordableQty <= 0) return null;
    const buyQty = Math.min(quantity, cheapest.quantity, affordableQty);

    return { type: "buy_ge", item: itemCode, maxPrice: cheapest.price, quantity: buyQty };
  }

  /**
   * Find excess bank items worth selling on the GE.
   * Excess = quantity > 10, tradeable, not currency, not needed by any recipe.
   */
  findGESellGoal(bankItems: SimpleItem[], bankGold: number): Goal | null {
    // Build set of items needed by any recipe
    const neededItems = new Set<string>();
    for (const item of this.items.values()) {
      if (!item.craft?.items) continue;
      for (const mat of item.craft.items) {
        neededItems.add(mat.code);
      }
    }

    let bestItem: { code: string; quantity: number; value: number } | null = null;

    for (const bi of bankItems) {
      if (bi.quantity <= 10) continue;
      if (neededItems.has(bi.code)) continue;

      const item = this.items.get(bi.code);
      if (!item) continue;
      if (!item.tradeable) continue;
      if (item.type === "currency") continue;

      const sellQty = Math.min(bi.quantity - 10, 100); // keep 10, max 100 per order
      // Estimate price: use item level as rough proxy (1 gold per level, min 1)
      const price = Math.max(item.level, 1);
      const tax = Math.max(Math.ceil(price * sellQty * 0.03), 1);
      // Need gold to cover tax — skip if can't afford
      if (bankGold < tax) continue;

      const value = price * sellQty;
      if (!bestItem || value > bestItem.value) {
        bestItem = { code: bi.code, quantity: sellQty, value };
      }
    }

    if (!bestItem) return null;

    const price = Math.max(this.items.get(bestItem.code)?.level ?? 1, 1);
    return { type: "sell_ge", item: bestItem.code, price, quantity: bestItem.quantity };
  }

  findTasksMaster(taskType: string): GameMap | undefined {
    return this.getAllMaps().find(
      (m) =>
        m.interactions.content?.type === "tasks_master" &&
        m.interactions.content.code === taskType
    );
  }
}
