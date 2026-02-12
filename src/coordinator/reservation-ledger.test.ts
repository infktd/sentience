import { describe, test, expect, beforeEach } from "bun:test";
import { ReservationLedger } from "./reservation-ledger";

describe("ReservationLedger", () => {
  let ledger: ReservationLedger;

  beforeEach(() => {
    ledger = new ReservationLedger();
  });

  describe("reserve and getAvailable", () => {
    test("returns full bank when no reservations exist", () => {
      const bank = [
        { code: "iron_ore", quantity: 10 },
        { code: "copper_ore", quantity: 5 },
      ];
      const available = ledger.getAvailable(bank);
      expect(available).toEqual([
        { code: "iron_ore", quantity: 10 },
        { code: "copper_ore", quantity: 5 },
      ]);
    });

    test("subtracts reserved items from available", () => {
      const bank = [
        { code: "iron_ore", quantity: 10 },
        { code: "copper_ore", quantity: 5 },
      ];
      ledger.reserve("alice", [{ code: "iron_ore", quantity: 3 }]);
      const available = ledger.getAvailable(bank);
      expect(available).toEqual([
        { code: "iron_ore", quantity: 7 },
        { code: "copper_ore", quantity: 5 },
      ]);
    });

    test("subtracts multiple reservations from different characters", () => {
      const bank = [{ code: "iron_ore", quantity: 10 }];
      ledger.reserve("alice", [{ code: "iron_ore", quantity: 3 }]);
      ledger.reserve("bob", [{ code: "iron_ore", quantity: 4 }]);
      const available = ledger.getAvailable(bank);
      expect(available).toEqual([{ code: "iron_ore", quantity: 3 }]);
    });

    test("replaces previous reservation for same character", () => {
      const bank = [{ code: "iron_ore", quantity: 10 }];
      ledger.reserve("alice", [{ code: "iron_ore", quantity: 8 }]);
      ledger.reserve("alice", [{ code: "iron_ore", quantity: 2 }]);
      const available = ledger.getAvailable(bank);
      expect(available).toEqual([{ code: "iron_ore", quantity: 8 }]);
    });

    test("clamps available to zero when overreserved", () => {
      const bank = [{ code: "iron_ore", quantity: 5 }];
      ledger.reserve("alice", [{ code: "iron_ore", quantity: 3 }]);
      ledger.reserve("bob", [{ code: "iron_ore", quantity: 3 }]);
      const available = ledger.getAvailable(bank);
      expect(available).toEqual([{ code: "iron_ore", quantity: 0 }]);
    });

    test("omits items not in bank from available", () => {
      const bank = [{ code: "iron_ore", quantity: 10 }];
      ledger.reserve("alice", [{ code: "gold_bar", quantity: 5 }]);
      const available = ledger.getAvailable(bank);
      expect(available).toEqual([{ code: "iron_ore", quantity: 10 }]);
    });

    test("handles reservation with multiple item types", () => {
      const bank = [
        { code: "iron_ore", quantity: 10 },
        { code: "coal", quantity: 8 },
      ];
      ledger.reserve("alice", [
        { code: "iron_ore", quantity: 3 },
        { code: "coal", quantity: 2 },
      ]);
      const available = ledger.getAvailable(bank);
      expect(available).toEqual([
        { code: "iron_ore", quantity: 7 },
        { code: "coal", quantity: 6 },
      ]);
    });
  });

  describe("clear", () => {
    test("removes reservation for a character", () => {
      const bank = [{ code: "iron_ore", quantity: 10 }];
      ledger.reserve("alice", [{ code: "iron_ore", quantity: 5 }]);
      ledger.clear("alice");
      const available = ledger.getAvailable(bank);
      expect(available).toEqual([{ code: "iron_ore", quantity: 10 }]);
    });

    test("does not affect other characters reservations", () => {
      const bank = [{ code: "iron_ore", quantity: 10 }];
      ledger.reserve("alice", [{ code: "iron_ore", quantity: 3 }]);
      ledger.reserve("bob", [{ code: "iron_ore", quantity: 4 }]);
      ledger.clear("alice");
      const available = ledger.getAvailable(bank);
      expect(available).toEqual([{ code: "iron_ore", quantity: 6 }]);
    });

    test("clearing non-existent reservation is a no-op", () => {
      const bank = [{ code: "iron_ore", quantity: 10 }];
      ledger.clear("alice");
      const available = ledger.getAvailable(bank);
      expect(available).toEqual([{ code: "iron_ore", quantity: 10 }]);
    });
  });

  describe("expireStale", () => {
    test("expires reservations older than the timeout", () => {
      const bank = [{ code: "iron_ore", quantity: 10 }];
      ledger.reserve("alice", [{ code: "iron_ore", quantity: 5 }]);

      // Manually inject a stale timestamp (ledger uses Date.now internally)
      // We test via the constructor timeout parameter
      const shortLedger = new ReservationLedger(0); // 0ms timeout = everything is stale
      shortLedger.reserve("alice", [{ code: "iron_ore", quantity: 5 }]);
      shortLedger.expireStale();
      const available = shortLedger.getAvailable(bank);
      expect(available).toEqual([{ code: "iron_ore", quantity: 10 }]);
    });

    test("keeps fresh reservations", () => {
      const bank = [{ code: "iron_ore", quantity: 10 }];
      const longLedger = new ReservationLedger(300_000); // 5 min timeout
      longLedger.reserve("alice", [{ code: "iron_ore", quantity: 5 }]);
      longLedger.expireStale();
      const available = longLedger.getAvailable(bank);
      expect(available).toEqual([{ code: "iron_ore", quantity: 5 }]);
    });
  });
});
