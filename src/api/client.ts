import type {
  Character,
  MovementData,
  FightData,
  SkillData,
  RestData,
  BankItemData,
  BankGoldData,
  NpcTransactionData,
  NpcItem,
  ApiResponse,
  PaginatedResponse,
  GameMap,
  Resource,
  Monster,
  Item,
  SimpleItem,
  Cooldown,
  ItemSlot,
  Bank,
  SimulationResponse,
  SimulationCharacter,
} from "../types";

const BASE_URL = "https://api.artifactsmmo.com";
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

export class ApiRequestError extends Error {
  constructor(
    public statusCode: number,
    public errorCode: number,
    public errorMessage: string,
    public data?: Record<string, unknown>
  ) {
    super(`API error ${errorCode}: ${errorMessage}`);
    this.name = "ApiRequestError";
  }
}

export class CooldownError extends Error {
  constructor(
    public character: string,
    public expiresAt: number
  ) {
    const remaining = Math.ceil((expiresAt - Date.now()) / 1000);
    super(`${character} is on cooldown for ${remaining}s`);
    this.name = "CooldownError";
  }
}

export class ApiClient {
  private token: string;
  private cooldowns: Map<string, number> = new Map();

  constructor(token: string) {
    this.token = token;
  }

  setCooldown(character: string, expiresAt: number): void {
    this.cooldowns.set(character, expiresAt);
  }

  isOnCooldown(character: string): boolean {
    const expires = this.cooldowns.get(character);
    if (!expires) return false;
    if (Date.now() >= expires) {
      this.cooldowns.delete(character);
      return false;
    }
    return true;
  }

  getCooldownRemaining(character: string): number {
    const expires = this.cooldowns.get(character);
    if (!expires) return 0;
    const remaining = expires - Date.now();
    return remaining > 0 ? remaining : 0;
  }

  async waitForCooldown(character: string): Promise<void> {
    const remaining = this.getCooldownRemaining(character);
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining + 100));
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    retries = MAX_RETRIES
  ): Promise<T> {
    const url = `${BASE_URL}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/json",
    };
    if (body) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 429 && retries > 0) {
      const backoff = INITIAL_BACKOFF_MS * Math.pow(2, MAX_RETRIES - retries);
      await new Promise((resolve) => setTimeout(resolve, backoff));
      return this.request<T>(method, path, body, retries - 1);
    }

    if (response.status >= 500 && retries > 0) {
      const backoff = INITIAL_BACKOFF_MS * Math.pow(2, MAX_RETRIES - retries);
      await new Promise((resolve) => setTimeout(resolve, backoff));
      return this.request<T>(method, path, body, retries - 1);
    }

    const json = await response.json();

    if (!response.ok) {
      const err = json.error ?? { code: response.status, message: "Unknown error" };
      throw new ApiRequestError(response.status, err.code, err.message, err.data);
    }

    return json as T;
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  // === Cooldown helper ===

  private handleCooldown(character: string, cooldown: Cooldown): void {
    const expiresAt = new Date(cooldown.expiration).getTime();
    this.setCooldown(character, expiresAt);
  }

  // === Character Endpoints ===

  async getMyCharacters(): Promise<Character[]> {
    const res = await this.get<{ data: Character[] }>("/my/characters");
    return res.data;
  }

  async getCharacter(name: string): Promise<Character> {
    const res = await this.get<{ data: Character }>(`/characters/${name}`);
    return res.data;
  }

  // === Action Endpoints ===

  async move(name: string, x: number, y: number): Promise<MovementData> {
    await this.waitForCooldown(name);
    const res = await this.post<ApiResponse<MovementData>>(
      `/my/${name}/action/move`,
      { x, y }
    );
    this.handleCooldown(name, res.data.cooldown);
    return res.data;
  }

  async fight(name: string): Promise<FightData> {
    await this.waitForCooldown(name);
    const res = await this.post<ApiResponse<FightData>>(
      `/my/${name}/action/fight`
    );
    this.handleCooldown(name, res.data.cooldown);
    return res.data;
  }

  async gather(name: string): Promise<SkillData> {
    await this.waitForCooldown(name);
    const res = await this.post<ApiResponse<SkillData>>(
      `/my/${name}/action/gathering`
    );
    this.handleCooldown(name, res.data.cooldown);
    return res.data;
  }

  async craft(name: string, code: string, quantity = 1): Promise<SkillData> {
    await this.waitForCooldown(name);
    const res = await this.post<ApiResponse<SkillData>>(
      `/my/${name}/action/crafting`,
      { code, quantity }
    );
    this.handleCooldown(name, res.data.cooldown);
    return res.data;
  }

  async rest(name: string): Promise<RestData> {
    await this.waitForCooldown(name);
    const res = await this.post<ApiResponse<RestData>>(
      `/my/${name}/action/rest`
    );
    this.handleCooldown(name, res.data.cooldown);
    return res.data;
  }

  async equip(name: string, code: string, slot: ItemSlot): Promise<Character> {
    await this.waitForCooldown(name);
    const res = await this.post<ApiResponse<{ cooldown: Cooldown; character: Character }>>(
      `/my/${name}/action/equip`,
      { code, slot }
    );
    this.handleCooldown(name, res.data.cooldown);
    return res.data.character;
  }

  async unequip(name: string, slot: ItemSlot): Promise<Character> {
    await this.waitForCooldown(name);
    const res = await this.post<ApiResponse<{ cooldown: Cooldown; character: Character }>>(
      `/my/${name}/action/unequip`,
      { slot }
    );
    this.handleCooldown(name, res.data.cooldown);
    return res.data.character;
  }

  async depositItems(name: string, items: SimpleItem[]): Promise<BankItemData> {
    await this.waitForCooldown(name);
    const res = await this.post<ApiResponse<BankItemData>>(
      `/my/${name}/action/bank/deposit/item`,
      items
    );
    this.handleCooldown(name, res.data.cooldown);
    return res.data;
  }

  async depositGold(name: string, quantity: number): Promise<BankGoldData> {
    await this.waitForCooldown(name);
    const res = await this.post<ApiResponse<BankGoldData>>(
      `/my/${name}/action/bank/deposit/gold`,
      { quantity }
    );
    this.handleCooldown(name, res.data.cooldown);
    return res.data;
  }

  async withdrawItems(name: string, items: SimpleItem[]): Promise<BankItemData> {
    await this.waitForCooldown(name);
    const res = await this.post<ApiResponse<BankItemData>>(
      `/my/${name}/action/bank/withdraw/item`,
      items
    );
    this.handleCooldown(name, res.data.cooldown);
    return res.data;
  }

  async withdrawGold(name: string, quantity: number): Promise<BankGoldData> {
    await this.waitForCooldown(name);
    const res = await this.post<ApiResponse<BankGoldData>>(
      `/my/${name}/action/bank/withdraw/gold`,
      { quantity }
    );
    this.handleCooldown(name, res.data.cooldown);
    return res.data;
  }

  // === Game Data Endpoints ===

  async getMaps(page = 1, size = 100): Promise<PaginatedResponse<GameMap>> {
    return this.get<PaginatedResponse<GameMap>>(`/maps?page=${page}&size=${size}`);
  }

  async getResources(page = 1, size = 100): Promise<PaginatedResponse<Resource>> {
    return this.get<PaginatedResponse<Resource>>(`/resources?page=${page}&size=${size}`);
  }

  async getMonsters(page = 1, size = 100): Promise<PaginatedResponse<Monster>> {
    return this.get<PaginatedResponse<Monster>>(`/monsters?page=${page}&size=${size}`);
  }

  async getItems(page = 1, size = 100): Promise<PaginatedResponse<Item>> {
    return this.get<PaginatedResponse<Item>>(`/items?page=${page}&size=${size}`);
  }

  async buyNpc(name: string, code: string, quantity = 1): Promise<NpcTransactionData> {
    await this.waitForCooldown(name);
    const res = await this.post<ApiResponse<NpcTransactionData>>(
      `/my/${name}/action/npc/buy`,
      { code, quantity }
    );
    this.handleCooldown(name, res.data.cooldown);
    return res.data;
  }

  async getBankItems(page = 1, size = 100): Promise<PaginatedResponse<SimpleItem>> {
    return this.get<PaginatedResponse<SimpleItem>>(`/my/bank/items?page=${page}&size=${size}`);
  }

  async getBank(): Promise<ApiResponse<Bank>> {
    return this.get<ApiResponse<Bank>>("/my/bank");
  }

  async getNpcItems(page = 1, size = 100): Promise<PaginatedResponse<NpcItem>> {
    return this.get<PaginatedResponse<NpcItem>>(`/npcs/items?page=${page}&size=${size}`);
  }

  // === Simulation ===

  async simulateFight(
    character: SimulationCharacter,
    monster: string,
    iterations = 100
  ): Promise<SimulationResponse> {
    const res = await this.post<ApiResponse<SimulationResponse>>(
      "/simulation/fight_simulation",
      { characters: [character], monster, iterations }
    );
    return res.data;
  }

}
