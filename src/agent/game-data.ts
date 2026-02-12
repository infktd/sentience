import type { GameMap, Resource, Monster, Item, ItemType } from "../types";

const EQUIPMENT_TYPES: Set<ItemType> = new Set([
  "weapon", "shield", "helmet", "body_armor", "leg_armor", "boots",
  "ring", "amulet", "artifact", "rune", "bag",
]);

export class GameData {
  private maps: GameMap[] = [];
  private resources: Map<string, Resource> = new Map();
  private monsters: Map<string, Monster> = new Map();
  private items: Map<string, Item> = new Map();

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

  findMapsWithContent(contentType: string): GameMap[] {
    return this.maps.filter(
      (m) => m.interactions.content?.type === contentType
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
}
