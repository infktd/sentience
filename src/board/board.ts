import type { SimpleItem, GEOrder } from "../types";

export interface CharacterBoardState {
  currentAction: string;
  target: string;
  position: { x: number; y: number };
  skillLevels: Record<string, number>;
  inventoryUsed: number;
  inventoryMax: number;
}

export interface BankBoardState {
  items: SimpleItem[];
  gold: number;
  lastUpdated: number;
}

export interface BoardSnapshot {
  characters: Record<string, CharacterBoardState>;
  bank: BankBoardState;
  geOrders: GEOrder[];
}

export class Board {
  private characters: Record<string, CharacterBoardState> = {};
  private bank: BankBoardState = { items: [], gold: 0, lastUpdated: 0 };
  private geOrders: GEOrder[] = [];

  updateCharacter(name: string, state: CharacterBoardState): void {
    this.characters[name] = { ...state };
  }

  updateBank(items: SimpleItem[], gold: number): void {
    this.bank = {
      items: items.map((i) => ({ ...i })),
      gold,
      lastUpdated: Date.now(),
    };
  }

  updateGEOrders(orders: GEOrder[]): void {
    this.geOrders = orders.map((o) => ({ ...o }));
  }

  getSnapshot(): BoardSnapshot {
    return JSON.parse(
      JSON.stringify({ characters: this.characters, bank: this.bank, geOrders: this.geOrders })
    );
  }

  getOtherCharacters(excludeName: string): CharacterBoardState[] {
    return Object.entries(this.characters)
      .filter(([name]) => name !== excludeName)
      .map(([, state]) => JSON.parse(JSON.stringify(state)));
  }
}
