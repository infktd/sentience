import type { SimpleItem } from "../types";

interface Reservation {
  items: SimpleItem[];
  createdAt: number;
}

export class ReservationLedger {
  private reservations = new Map<string, Reservation>();
  private timeoutMs: number;

  constructor(timeoutMs = 300_000) {
    this.timeoutMs = timeoutMs;
  }

  reserve(character: string, items: SimpleItem[]): void {
    this.reservations.set(character, {
      items: items.map((i) => ({ ...i })),
      createdAt: Date.now(),
    });
  }

  getAvailable(bankItems: SimpleItem[]): SimpleItem[] {
    // Sum all reserved quantities by item code
    const reserved = new Map<string, number>();
    for (const reservation of this.reservations.values()) {
      for (const item of reservation.items) {
        reserved.set(item.code, (reserved.get(item.code) ?? 0) + item.quantity);
      }
    }

    return bankItems.map((bankItem) => {
      const reservedQty = reserved.get(bankItem.code) ?? 0;
      return {
        code: bankItem.code,
        quantity: Math.max(0, bankItem.quantity - reservedQty),
      };
    });
  }

  clear(character: string): void {
    this.reservations.delete(character);
  }

  expireStale(): void {
    const now = Date.now();
    for (const [character, reservation] of this.reservations) {
      if (now - reservation.createdAt >= this.timeoutMs) {
        this.reservations.delete(character);
      }
    }
  }
}
