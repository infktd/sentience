import type { GameMap, Resource, Monster, Item, ItemType, SimpleItem, NpcItem } from "../types";

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
}
