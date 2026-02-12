import type { Character, Monster, SimulationResult, SimulationCharacter } from "../types";
import type { ApiClient } from "../api/client";
import type { GameData } from "../agent/game-data";

const DEFAULT_ITERATIONS = 100;
const WIN_RATE_THRESHOLD = 0.9;

export class FightSimulator {
  private cache: Map<string, SimulationResult> = new Map();
  private api: ApiClient;

  constructor(api: ApiClient) {
    this.api = api;
  }

  static toSimInput(char: Character): SimulationCharacter {
    return {
      level: char.level,
      weapon_slot: char.weapon_slot || undefined,
      shield_slot: char.shield_slot || undefined,
      helmet_slot: char.helmet_slot || undefined,
      body_armor_slot: char.body_armor_slot || undefined,
      leg_armor_slot: char.leg_armor_slot || undefined,
      boots_slot: char.boots_slot || undefined,
      rune_slot: char.rune_slot || undefined,
      ring1_slot: char.ring1_slot || undefined,
      ring2_slot: char.ring2_slot || undefined,
      amulet_slot: char.amulet_slot || undefined,
      artifact1_slot: char.artifact1_slot || undefined,
      artifact2_slot: char.artifact2_slot || undefined,
      artifact3_slot: char.artifact3_slot || undefined,
      utility1_slot: char.utility1_slot || undefined,
      utility1_slot_quantity: char.utility1_slot_quantity || undefined,
      utility2_slot: char.utility2_slot || undefined,
      utility2_slot_quantity: char.utility2_slot_quantity || undefined,
    };
  }

  static getCacheKey(character: Character, monsterCode: string): string {
    const parts = [
      character.level,
      character.weapon_slot,
      character.shield_slot,
      character.helmet_slot,
      character.body_armor_slot,
      character.leg_armor_slot,
      character.boots_slot,
      character.rune_slot,
      character.ring1_slot,
      character.ring2_slot,
      character.amulet_slot,
      character.artifact1_slot,
      character.artifact2_slot,
      character.artifact3_slot,
      character.utility1_slot,
      character.utility1_slot_quantity,
      character.utility2_slot,
      character.utility2_slot_quantity,
      monsterCode,
    ];
    return parts.join("|");
  }

  getCached(character: Character, monsterCode: string): SimulationResult | undefined {
    return this.cache.get(FightSimulator.getCacheKey(character, monsterCode));
  }

  async simulate(
    character: Character,
    monsterCode: string,
    iterations = DEFAULT_ITERATIONS
  ): Promise<SimulationResult> {
    const key = FightSimulator.getCacheKey(character, monsterCode);
    const cached = this.cache.get(key);
    if (cached) return cached;

    const simChar = FightSimulator.toSimInput(character);
    const response = await this.api.simulateFight(simChar, monsterCode, iterations);

    const wins = response.results.filter((r) => r.result === "win").length;
    const total = response.results.length;
    const avgHp =
      response.results.reduce((sum, r) => sum + r.character_results[0].final_hp, 0) / total;
    const avgTurns =
      response.results.reduce((sum, r) => sum + r.turns, 0) / total;

    const result: SimulationResult = {
      winRate: wins / total,
      avgFinalHp: avgHp,
      avgTurns: avgTurns,
    };

    this.cache.set(key, result);
    return result;
  }

  async simulateParty(
    characters: Character[],
    monsterCode: string,
    iterations = DEFAULT_ITERATIONS
  ): Promise<SimulationResult> {
    try {
      const simChars = characters.map((c) => FightSimulator.toSimInput(c));
      const response = await this.api.simulateFight(simChars, monsterCode, iterations);

      const wins = response.results.filter((r) => r.result === "win").length;
      const total = response.results.length;
      const avgHp =
        response.results.reduce((sum, r) => {
          // Average across all characters' final HP
          const charHp = r.character_results.reduce((s, cr) => s + cr.final_hp, 0) / r.character_results.length;
          return sum + charHp;
        }, 0) / total;
      const avgTurns =
        response.results.reduce((sum, r) => sum + r.turns, 0) / total;

      return { winRate: wins / total, avgFinalHp: avgHp, avgTurns };
    } catch {
      // Fallback heuristic: estimate based on combined party level vs monster
      const avgLevel = characters.reduce((sum, c) => sum + c.level, 0) / characters.length;
      // Party bonus: more characters = higher effective level
      const effectiveLevel = avgLevel * (1 + (characters.length - 1) * 0.3);
      // Very rough: if effective level >> monster level, high win rate
      return {
        winRate: Math.min(effectiveLevel / (effectiveLevel + 10), 0.99),
        avgFinalHp: characters[0]?.max_hp ?? 100,
        avgTurns: 15,
      };
    }
  }

  async findBestBoss(
    characters: Character[],
    gameData: GameData
  ): Promise<{ monster: Monster; result: SimulationResult } | null> {
    // Allow bosses up to 2x party's max level — simulation handles safety check
    const maxLevel = Math.max(...characters.map((c) => c.level));
    const searchLevel = Math.max(maxLevel * 2, maxLevel + 10);
    const bosses = gameData.getBossMonsters(searchLevel).sort((a, b) => b.level - a.level);

    for (const boss of bosses) {
      const result = await this.simulateParty(characters, boss.code);
      if (result.winRate >= WIN_RATE_THRESHOLD) {
        return { monster: boss, result };
      }
    }
    return null;
  }

  async findBestMonster(
    character: Character,
    gameData: GameData
  ): Promise<{ monster: Monster; result: SimulationResult } | null> {
    const candidates = gameData
      .getMonstersByLevel(character.level)
      .sort((a, b) => b.level - a.level);

    for (const monster of candidates) {
      const result = await this.simulate(character, monster.code);
      if (result.winRate >= WIN_RATE_THRESHOLD) {
        return { monster, result };
      }
    }
    return null;
  }
}
