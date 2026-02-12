# Core Bot Engine Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the core bot engine that automates 5 Artifacts MMO characters with self-directing strategies and a shared state board.

**Architecture:** Single Bun process running 5 independent character agents. Each agent runs an evaluate→execute→wait loop. Agents share a read-only state board for passive coordination. A pluggable strategy system decides what each agent works on next. See `docs/architecture.md` for full details.

**Tech Stack:** Bun runtime, TypeScript, no external dependencies. API spec at `https://api.artifactsmmo.com/openapi.json` (also saved locally at `openapi.json`).

---

## Epic 1: Project Scaffolding

> **Context for agent:** We have a fresh project with leftover Next.js config. Strip it down to a pure Bun + TypeScript project.

### Story 1.1: Clean up package.json and tsconfig

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Delete: `next.config.ts`

**Step 1: Rewrite package.json**

Remove all Next.js/React/Tailwind dependencies. Keep only what we need:

```json
{
  "name": "artifacts-mmo",
  "type": "module",
  "scripts": {
    "start": "bun run src/index.ts",
    "test": "bun test"
  },
  "devDependencies": {
    "bun-types": "latest",
    "typescript": "latest",
    "@types/node": "latest"
  }
}
```

**Step 2: Rewrite tsconfig.json**

Strip Next.js plugin and DOM libs. Pure server-side Bun config:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "paths": {
      "@/*": ["./src/*"]
    },
    "types": ["bun-types"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules"]
}
```

**Step 3: Delete next.config.ts**

It's no longer needed.

**Step 4: Run `bun install`**

Expected: clean install with only bun-types and typescript.

**Step 5: Commit**

```bash
git add package.json tsconfig.json
git rm next.config.ts
git commit -m "chore: strip Next.js, set up pure Bun project"
```

---

### Story 1.2: Create directory structure and .gitignore

**Files:**
- Create: `.gitignore`
- Create: `src/index.ts` (placeholder)

**Step 1: Create .gitignore**

```
node_modules/
logs/
.env
openapi.json
*.log
```

**Step 2: Create directory structure**

```bash
mkdir -p src/api src/agent src/strategy src/board src/logger src/types logs
```

**Step 3: Create placeholder entry point**

```typescript
// src/index.ts
console.log("Artifacts MMO Bot starting...");
```

**Step 4: Verify it runs**

Run: `bun run src/index.ts`
Expected: prints "Artifacts MMO Bot starting..."

**Step 5: Commit**

```bash
git add .gitignore src/index.ts
git commit -m "chore: add directory structure and gitignore"
```

---

### Story 1.3: Create config loader

**Files:**
- Create: `src/config.ts`
- Create: `.env.example`

**Step 1: Create .env.example**

```
ARTIFACTS_API_TOKEN=your_token_here
```

**Step 2: Write the config module**

The config loads the API token from `.env` and defines character directives. Bun has built-in `.env` loading via `Bun.env`.

```typescript
// src/config.ts

export type Directive = "max_all_skills";

export interface CharacterConfig {
  name: string;
  directive: Directive;
}

export interface Config {
  apiToken: string;
  characters: CharacterConfig[];
}

export function loadConfig(): Config {
  const apiToken = Bun.env.ARTIFACTS_API_TOKEN;
  if (!apiToken) {
    throw new Error("ARTIFACTS_API_TOKEN is not set in .env");
  }

  // Character names will be auto-discovered from the API
  // Directive defaults to max_all_skills for all characters
  return {
    apiToken,
    characters: [], // populated at boot from API
  };
}
```

**Step 3: Write test**

```typescript
// src/config.test.ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { loadConfig } from "./config";

describe("loadConfig", () => {
  const originalEnv = Bun.env.ARTIFACTS_API_TOKEN;

  afterEach(() => {
    if (originalEnv !== undefined) {
      Bun.env.ARTIFACTS_API_TOKEN = originalEnv;
    }
  });

  test("throws if ARTIFACTS_API_TOKEN is missing", () => {
    Bun.env.ARTIFACTS_API_TOKEN = undefined;
    expect(() => loadConfig()).toThrow("ARTIFACTS_API_TOKEN is not set");
  });

  test("returns config with token when set", () => {
    Bun.env.ARTIFACTS_API_TOKEN = "test-token";
    const config = loadConfig();
    expect(config.apiToken).toBe("test-token");
    expect(config.characters).toEqual([]);
  });
});
```

**Step 4: Run tests**

Run: `bun test src/config.test.ts`
Expected: 2 tests pass

**Step 5: Commit**

```bash
git add src/config.ts src/config.test.ts .env.example
git commit -m "feat: add config loader with env validation"
```

---

## Epic 2: Types

> **Context for agent:** Define TypeScript types matching the Artifacts MMO OpenAPI spec. These types are used by every other module. The source of truth is `openapi.json` in the project root. Do NOT generate types automatically - write them by hand for the subset we actually use.

### Story 2.1: Core game types

**Files:**
- Create: `src/types/index.ts`

**Step 1: Write the types file**

These types match the OpenAPI `components/schemas` section exactly. Only include schemas we actually use.

```typescript
// src/types/index.ts

// === Enums ===

export type GatheringSkill = "mining" | "woodcutting" | "fishing" | "alchemy";

export type CraftSkill =
  | "weaponcrafting"
  | "gearcrafting"
  | "jewelrycrafting"
  | "cooking"
  | "woodcutting"
  | "mining"
  | "alchemy";

export type Skill =
  | "weaponcrafting"
  | "gearcrafting"
  | "jewelrycrafting"
  | "cooking"
  | "woodcutting"
  | "mining"
  | "alchemy"
  | "fishing";

export type MapLayer = "interior" | "overworld" | "underground";

export type MapContentType =
  | "monster"
  | "resource"
  | "workshop"
  | "bank"
  | "grand_exchange"
  | "tasks_master"
  | "npc";

export type MapAccessType =
  | "standard"
  | "teleportation"
  | "conditional"
  | "blocked";

export type MonsterType = "normal" | "elite" | "boss";

export type FightResult = "win" | "loss";

export type ItemSlot =
  | "weapon"
  | "shield"
  | "helmet"
  | "body_armor"
  | "leg_armor"
  | "boots"
  | "ring1"
  | "ring2"
  | "amulet"
  | "artifact1"
  | "artifact2"
  | "artifact3"
  | "utility1"
  | "utility2"
  | "bag"
  | "rune";

export type ItemType =
  | "utility"
  | "body_armor"
  | "weapon"
  | "resource"
  | "leg_armor"
  | "helmet"
  | "boots"
  | "shield"
  | "amulet"
  | "ring"
  | "artifact"
  | "currency"
  | "consumable"
  | "rune"
  | "bag";

export type ActionType =
  | "movement"
  | "fight"
  | "multi_fight"
  | "crafting"
  | "gathering"
  | "buy_ge"
  | "sell_ge"
  | "buy_npc"
  | "sell_npc"
  | "cancel_ge"
  | "delete_item"
  | "deposit_item"
  | "withdraw_item"
  | "deposit_gold"
  | "withdraw_gold"
  | "equip"
  | "unequip"
  | "task"
  | "recycling"
  | "rest"
  | "use"
  | "buy_bank_expansion"
  | "give_item"
  | "give_gold"
  | "change_skin"
  | "rename"
  | "transition";

export type TaskType = "monsters" | "items";

// === Data Schemas ===

export interface InventorySlot {
  slot: number;
  code: string;
  quantity: number;
}

export interface SimpleItem {
  code: string;
  quantity: number;
}

export interface Drop {
  code: string;
  quantity: number;
}

export interface DropRate {
  code: string;
  rate: number;
  min_quantity: number;
  max_quantity: number;
}

export interface SimpleEffect {
  code: string;
  value: number;
  description: string;
}

export interface StorageEffect {
  code: string;
  value: number;
}

export interface Condition {
  code: string;
  operator: "eq" | "ne" | "gt" | "lt" | "cost" | "has_item" | "achievement_unlocked";
  value: number;
}

// === Character ===

export interface Character {
  name: string;
  account: string;
  skin: string;
  level: number;
  xp: number;
  max_xp: number;
  gold: number;
  speed: number;

  // Gathering skills
  mining_level: number;
  mining_xp: number;
  mining_max_xp: number;
  woodcutting_level: number;
  woodcutting_xp: number;
  woodcutting_max_xp: number;
  fishing_level: number;
  fishing_xp: number;
  fishing_max_xp: number;

  // Crafting skills
  weaponcrafting_level: number;
  weaponcrafting_xp: number;
  weaponcrafting_max_xp: number;
  gearcrafting_level: number;
  gearcrafting_xp: number;
  gearcrafting_max_xp: number;
  jewelrycrafting_level: number;
  jewelrycrafting_xp: number;
  jewelrycrafting_max_xp: number;
  cooking_level: number;
  cooking_xp: number;
  cooking_max_xp: number;
  alchemy_level: number;
  alchemy_xp: number;
  alchemy_max_xp: number;

  // Combat stats
  hp: number;
  max_hp: number;
  haste: number;
  critical_strike: number;
  wisdom: number;
  prospecting: number;
  initiative: number;
  threat: number;
  attack_fire: number;
  attack_earth: number;
  attack_water: number;
  attack_air: number;
  dmg: number;
  dmg_fire: number;
  dmg_earth: number;
  dmg_water: number;
  dmg_air: number;
  res_fire: number;
  res_earth: number;
  res_water: number;
  res_air: number;

  // Effects
  effects: StorageEffect[];

  // Position
  x: number;
  y: number;
  layer: MapLayer;
  map_id: number;

  // Cooldown
  cooldown: number;
  cooldown_expiration: string;

  // Equipment slots
  weapon_slot: string;
  rune_slot: string;
  shield_slot: string;
  helmet_slot: string;
  body_armor_slot: string;
  leg_armor_slot: string;
  boots_slot: string;
  ring1_slot: string;
  ring2_slot: string;
  amulet_slot: string;
  artifact1_slot: string;
  artifact2_slot: string;
  artifact3_slot: string;
  utility1_slot: string;
  utility1_slot_quantity: number;
  utility2_slot: string;
  utility2_slot_quantity: number;
  bag_slot: string;

  // Task
  task: string;
  task_type: string;
  task_progress: number;
  task_total: number;

  // Inventory
  inventory_max_items: number;
  inventory: InventorySlot[];
}

// === Map ===

export interface MapContent {
  type: MapContentType;
  code: string;
}

export interface Transition {
  map_id: number;
  x: number;
  y: number;
  layer: MapLayer;
  conditions?: Condition[] | null;
}

export interface MapAccess {
  type: MapAccessType;
  conditions?: Condition[] | null;
}

export interface MapInteraction {
  content?: MapContent | null;
  transition?: Transition | null;
}

export interface GameMap {
  map_id: number;
  name: string;
  skin: string;
  x: number;
  y: number;
  layer: MapLayer;
  access: MapAccess;
  interactions: MapInteraction;
}

// === Monster ===

export interface Monster {
  name: string;
  code: string;
  level: number;
  type: MonsterType;
  hp: number;
  attack_fire: number;
  attack_earth: number;
  attack_water: number;
  attack_air: number;
  res_fire: number;
  res_earth: number;
  res_water: number;
  res_air: number;
  critical_strike: number;
  initiative: number;
  effects?: SimpleEffect[];
  min_gold: number;
  max_gold: number;
  drops: DropRate[];
}

// === Resource ===

export interface Resource {
  name: string;
  code: string;
  skill: GatheringSkill;
  level: number;
  drops: DropRate[];
}

// === Item ===

export interface CraftInfo {
  skill?: CraftSkill;
  level?: number;
  items?: SimpleItem[];
  quantity?: number;
}

export interface Item {
  name: string;
  code: string;
  level: number;
  type: string;
  subtype: string;
  description: string;
  conditions?: Condition[];
  effects?: SimpleEffect[];
  craft?: CraftInfo | null;
  tradeable: boolean;
}

// === Cooldown ===

export interface Cooldown {
  total_seconds: number;
  remaining_seconds: number;
  started_at: string;
  expiration: string;
  reason: ActionType;
}

// === API Response Wrappers ===

export interface ApiResponse<T> {
  data: T;
}

export interface ApiError {
  error: {
    code: number;
    message: string;
    data?: Record<string, unknown>;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  pages: number;
  page: number;
  size: number;
  total: number;
}

// === Action Responses ===

export interface SkillInfo {
  xp: number;
  items: Drop[];
}

export interface MovementData {
  cooldown: Cooldown;
  destination: GameMap;
  path: [number, number][];
  character: Character;
}

export interface FightData {
  cooldown: Cooldown;
  fight: {
    result: FightResult;
    turns: number;
    opponent: string;
    logs: string[];
    characters: {
      character_name: string;
      xp: number;
      gold: number;
      drops: Drop[];
      final_hp: number;
    }[];
  };
  characters: Character[];
}

export interface SkillData {
  cooldown: Cooldown;
  details: SkillInfo;
  character: Character;
}

export interface RestData {
  cooldown: Cooldown;
  hp_restored: number;
  character: Character;
}

export interface BankItemData {
  cooldown: Cooldown;
  items: SimpleItem[];
  bank: SimpleItem[];
  character: Character;
}

export interface BankGoldData {
  cooldown: Cooldown;
  bank: { quantity: number };
  character: Character;
}

// === Bank ===

export interface Bank {
  slots: number;
  expansions: number;
  next_expansion_cost: number;
  gold: number;
}

// === Task ===

export interface Task {
  code: string;
  type: TaskType;
  total: number;
  rewards: {
    items: SimpleItem[];
    gold: number;
  };
}

// === Goal System ===

export type Goal =
  | { type: "gather"; resource: string }
  | { type: "fight"; monster: string }
  | { type: "craft"; item: string; quantity: number }
  | { type: "rest" }
  | { type: "deposit_all" }
  | { type: "move"; x: number; y: number }
  | { type: "equip"; code: string; slot: ItemSlot }
  | { type: "unequip"; slot: ItemSlot }
  | { type: "idle"; reason: string };
```

**Step 2: Verify it compiles**

Run: `bunx tsc --noEmit`
Expected: no errors

**Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add core game types from OpenAPI spec"
```

---

## Epic 3: Logger

> **Context for agent:** Build a per-character file logger. Each character gets its own log file at `logs/{name}.log`. Every entry is a JSON line with a timestamp. The logger also supports a `decision` method that captures board + state snapshots alongside the decision. See `docs/architecture.md` "Logger" section.

### Story 3.1: Implement the logger

**Files:**
- Create: `src/logger/logger.ts`
- Create: `src/logger/logger.test.ts`

**Step 1: Write failing test**

```typescript
// src/logger/logger.test.ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Logger } from "./logger";
import { existsSync, unlinkSync, readFileSync } from "fs";

const TEST_LOG = "logs/test-char.log";

describe("Logger", () => {
  let logger: Logger;

  beforeEach(() => {
    if (existsSync(TEST_LOG)) unlinkSync(TEST_LOG);
    logger = new Logger("test-char");
  });

  afterEach(() => {
    if (existsSync(TEST_LOG)) unlinkSync(TEST_LOG);
  });

  test("writes JSON lines to character-specific file", () => {
    logger.info("test message", { key: "value" });
    const content = readFileSync(TEST_LOG, "utf-8").trim();
    const entry = JSON.parse(content);
    expect(entry.character).toBe("test-char");
    expect(entry.level).toBe("info");
    expect(entry.message).toBe("test message");
    expect(entry.data.key).toBe("value");
    expect(entry.timestamp).toBeDefined();
  });

  test("logs decisions with board and state snapshots", () => {
    const board = { characters: {}, bank: { items: [], gold: 0, lastUpdated: 0 } };
    const state = { hp: 100, max_hp: 100 };
    logger.decision("gather copper_ore", "lowest skill is mining", board, state);
    const content = readFileSync(TEST_LOG, "utf-8").trim();
    const entry = JSON.parse(content);
    expect(entry.level).toBe("decision");
    expect(entry.decision).toBe("gather copper_ore");
    expect(entry.reason).toBe("lowest skill is mining");
    expect(entry.board).toEqual(board);
    expect(entry.state).toEqual(state);
  });

  test("logs errors with context", () => {
    logger.error("action failed", { action: "fight", error: "499 cooldown" });
    const content = readFileSync(TEST_LOG, "utf-8").trim();
    const entry = JSON.parse(content);
    expect(entry.level).toBe("error");
    expect(entry.data.action).toBe("fight");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/logger/logger.test.ts`
Expected: FAIL - module not found

**Step 3: Implement the logger**

```typescript
// src/logger/logger.ts
import { appendFileSync, mkdirSync, existsSync } from "fs";

export class Logger {
  private filePath: string;
  public characterName: string;

  constructor(characterName: string) {
    this.characterName = characterName;
    if (!existsSync("logs")) mkdirSync("logs", { recursive: true });
    this.filePath = `logs/${characterName}.log`;
  }

  private write(entry: Record<string, unknown>): void {
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      character: this.characterName,
      ...entry,
    });
    appendFileSync(this.filePath, line + "\n");
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.write({ level: "info", message, ...(data ? { data } : {}) });
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.write({ level: "warn", message, ...(data ? { data } : {}) });
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.write({ level: "error", message, ...(data ? { data } : {}) });
  }

  decision(
    decision: string,
    reason: string,
    board: unknown,
    state: unknown
  ): void {
    this.write({ level: "decision", decision, reason, board, state });
  }
}
```

**Step 4: Run tests**

Run: `bun test src/logger/logger.test.ts`
Expected: 3 tests pass

**Step 5: Commit**

```bash
git add src/logger/logger.ts src/logger/logger.test.ts
git commit -m "feat: add per-character file logger with decision snapshots"
```

---

## Epic 4: API Client

> **Context for agent:** Build a typed HTTP client for the Artifacts MMO API. The client is a single shared instance used by all 5 agents. It handles: Bearer token auth, per-character cooldown tracking (never fires a request if the character is still on cooldown), exponential backoff retries for 429/5xx, and typed responses. The base URL is `https://api.artifactsmmo.com`. Auth header: `Authorization: Bearer {token}`. All action endpoints return `{ data: T }`. Errors return `{ error: { code, message } }`. See `docs/architecture.md` "API Client" section and `src/types/index.ts` for all types.

### Story 4.1: HTTP client with auth and error handling

**Files:**
- Create: `src/api/client.ts`
- Create: `src/api/client.test.ts`

**Step 1: Write failing tests**

```typescript
// src/api/client.test.ts
import { describe, test, expect, mock, beforeEach } from "bun:test";
import { ApiClient, ApiRequestError, CooldownError } from "./client";

describe("ApiClient", () => {
  let client: ApiClient;

  beforeEach(() => {
    client = new ApiClient("test-token");
  });

  test("sends auth header on requests", async () => {
    const originalFetch = globalThis.fetch;
    let capturedHeaders: Headers | undefined;
    globalThis.fetch = mock(async (url, init) => {
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ data: { status: "ok" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    await client.get("/");
    expect(capturedHeaders?.get("Authorization")).toBe("Bearer test-token");

    globalThis.fetch = originalFetch;
  });

  test("throws ApiRequestError on 4xx", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async () => {
      return new Response(
        JSON.stringify({ error: { code: 478, message: "Insufficient item" } }),
        { status: 478 }
      );
    }) as typeof fetch;

    await expect(client.post("/my/char/action/fight", {})).rejects.toThrow(ApiRequestError);

    globalThis.fetch = originalFetch;
  });

  test("tracks cooldowns per character", () => {
    client.setCooldown("char1", Date.now() + 5000);
    expect(client.isOnCooldown("char1")).toBe(true);
    expect(client.isOnCooldown("char2")).toBe(false);
  });

  test("cooldown expires", () => {
    client.setCooldown("char1", Date.now() - 1000);
    expect(client.isOnCooldown("char1")).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test src/api/client.test.ts`
Expected: FAIL - module not found

**Step 3: Implement the client**

```typescript
// src/api/client.ts
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
}
```

**Step 4: Run tests**

Run: `bun test src/api/client.test.ts`
Expected: 4 tests pass

**Step 5: Commit**

```bash
git add src/api/client.ts src/api/client.test.ts
git commit -m "feat: add API client with auth, cooldowns, and retry logic"
```

---

### Story 4.2: Typed action methods

> **Context for agent:** Add typed convenience methods to `ApiClient` for the action endpoints we need. Each method calls the correct endpoint, handles the cooldown from the response, and returns typed data. Import types from `src/types/index.ts`. The client class is at `src/api/client.ts`.

**Files:**
- Modify: `src/api/client.ts`
- Modify: `src/api/client.test.ts`

**Step 1: Add action methods to ApiClient**

Add these methods to the `ApiClient` class in `src/api/client.ts`. Each method:
1. Waits for cooldown to expire
2. Calls the endpoint
3. Extracts the cooldown from the response and tracks it
4. Returns the response data

```typescript
// Add imports at top of client.ts
import type {
  Character,
  MovementData,
  FightData,
  SkillData,
  RestData,
  BankItemData,
  BankGoldData,
  ApiResponse,
  PaginatedResponse,
  GameMap,
  Resource,
  Monster,
  Item,
  SimpleItem,
  Cooldown,
  ItemSlot,
} from "../types";

// Helper to extract cooldown expiration from any action response
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

async getBankItems(page = 1, size = 100): Promise<PaginatedResponse<SimpleItem>> {
  return this.get<PaginatedResponse<SimpleItem>>(`/my/bank/items?page=${page}&size=${size}`);
}

async getBank(): Promise<ApiResponse<Bank>> {
  return this.get<ApiResponse<Bank>>("/my/bank");
}
```

Add the `Bank` import to the import line at the top.

**Step 2: Add a test for an action method**

Add to `src/api/client.test.ts`:

```typescript
test("action methods wait for cooldown and track new cooldown", async () => {
  const originalFetch = globalThis.fetch;
  const cooldownExpiration = new Date(Date.now() + 3000).toISOString();

  globalThis.fetch = mock(async () => {
    return new Response(
      JSON.stringify({
        data: {
          cooldown: {
            total_seconds: 3,
            remaining_seconds: 3,
            started_at: new Date().toISOString(),
            expiration: cooldownExpiration,
            reason: "rest",
          },
          hp_restored: 50,
          character: { name: "testchar" },
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  const result = await client.rest("testchar");
  expect(result.hp_restored).toBe(50);
  expect(client.isOnCooldown("testchar")).toBe(true);

  globalThis.fetch = originalFetch;
});
```

**Step 3: Run tests**

Run: `bun test src/api/client.test.ts`
Expected: 5 tests pass

**Step 4: Verify types compile**

Run: `bunx tsc --noEmit`
Expected: no errors

**Step 5: Commit**

```bash
git add src/api/client.ts src/api/client.test.ts
git commit -m "feat: add typed action methods to API client"
```

---

## Epic 5: Shared State Board

> **Context for agent:** Build the shared state board. This is a plain in-memory object that all agents read but each agent only writes its own character section. A separate updater function refreshes bank state. See `docs/architecture.md` "Shared State Board" section and `src/types/index.ts` for types.

### Story 5.1: Implement the board

**Files:**
- Create: `src/board/board.ts`
- Create: `src/board/board.test.ts`

**Step 1: Write failing tests**

```typescript
// src/board/board.test.ts
import { describe, test, expect } from "bun:test";
import { Board } from "./board";

describe("Board", () => {
  test("initializes with empty state", () => {
    const board = new Board();
    expect(board.getSnapshot()).toEqual({
      characters: {},
      bank: { items: [], gold: 0, lastUpdated: 0 },
    });
  });

  test("updates character state", () => {
    const board = new Board();
    board.updateCharacter("alice", {
      currentAction: "gathering",
      target: "copper_ore",
      position: { x: 1, y: 2 },
      skillLevels: { mining: 5 },
      inventoryUsed: 3,
      inventoryMax: 20,
    });
    const snapshot = board.getSnapshot();
    expect(snapshot.characters["alice"].currentAction).toBe("gathering");
    expect(snapshot.characters["alice"].target).toBe("copper_ore");
  });

  test("updates bank state", () => {
    const board = new Board();
    board.updateBank([{ code: "copper_ore", quantity: 50 }], 1000);
    const snapshot = board.getSnapshot();
    expect(snapshot.bank.items).toEqual([{ code: "copper_ore", quantity: 50 }]);
    expect(snapshot.bank.gold).toBe(1000);
    expect(snapshot.bank.lastUpdated).toBeGreaterThan(0);
  });

  test("getSnapshot returns a deep copy", () => {
    const board = new Board();
    board.updateCharacter("bob", {
      currentAction: "idle",
      target: "",
      position: { x: 0, y: 0 },
      skillLevels: {},
      inventoryUsed: 0,
      inventoryMax: 20,
    });
    const snap1 = board.getSnapshot();
    snap1.characters["bob"].currentAction = "mutated";
    const snap2 = board.getSnapshot();
    expect(snap2.characters["bob"].currentAction).toBe("idle");
  });

  test("getOtherCharacters excludes self", () => {
    const board = new Board();
    board.updateCharacter("alice", {
      currentAction: "gathering",
      target: "copper_ore",
      position: { x: 0, y: 0 },
      skillLevels: {},
      inventoryUsed: 0,
      inventoryMax: 20,
    });
    board.updateCharacter("bob", {
      currentAction: "fighting",
      target: "chicken",
      position: { x: 1, y: 1 },
      skillLevels: {},
      inventoryUsed: 0,
      inventoryMax: 20,
    });
    const others = board.getOtherCharacters("alice");
    expect(others).toHaveLength(1);
    expect(others[0].currentAction).toBe("fighting");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test src/board/board.test.ts`
Expected: FAIL - module not found

**Step 3: Implement the board**

```typescript
// src/board/board.ts
import type { SimpleItem } from "../types";

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
}

export class Board {
  private characters: Record<string, CharacterBoardState> = {};
  private bank: BankBoardState = { items: [], gold: 0, lastUpdated: 0 };

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

  getSnapshot(): BoardSnapshot {
    return JSON.parse(
      JSON.stringify({ characters: this.characters, bank: this.bank })
    );
  }

  getOtherCharacters(excludeName: string): CharacterBoardState[] {
    return Object.entries(this.characters)
      .filter(([name]) => name !== excludeName)
      .map(([, state]) => JSON.parse(JSON.stringify(state)));
  }
}
```

**Step 4: Run tests**

Run: `bun test src/board/board.test.ts`
Expected: 5 tests pass

**Step 5: Commit**

```bash
git add src/board/board.ts src/board/board.test.ts
git commit -m "feat: add shared state board with character and bank tracking"
```

---

## Epic 6: Character Agent

> **Context for agent:** Build the character agent. Each agent runs an independent loop: evaluate (ask strategy for a goal) → resolve goal into actions → execute via API → update state → update board → log decision → wait for cooldown → repeat. The agent has built-in survival logic: rest when HP < 40%, deposit when inventory is full, move to correct location before acting. It catches errors per-action and re-evaluates. If the same goal fails 3 times in a row, it logs a warning and requests a new goal. See `docs/architecture.md` "Character Agent" and "Goal Execution" sections. Types are in `src/types/index.ts`. API client is `src/api/client.ts`. Board is `src/board/board.ts`. Logger is `src/logger/logger.ts`.

### Story 6.1: Goal resolver

> **Context for agent:** The goal resolver translates high-level Goal objects into action steps. It needs access to game data (maps, resources, monsters) to know where things are. Build a GameData cache that loads maps/resources/monsters on boot, and a resolver that figures out the sequence of actions to fulfill a goal.

**Files:**
- Create: `src/agent/game-data.ts`
- Create: `src/agent/game-data.test.ts`

**Step 1: Write failing tests**

```typescript
// src/agent/game-data.test.ts
import { describe, test, expect } from "bun:test";
import { GameData } from "./game-data";
import type { GameMap, Resource, Monster } from "../types";

describe("GameData", () => {
  test("findMapsWithResource returns maps containing a resource", () => {
    const gameData = new GameData();
    gameData.load(
      [
        {
          map_id: 1, name: "Copper Mine", skin: "mine", x: 2, y: 0,
          layer: "overworld" as const,
          access: { type: "standard" as const },
          interactions: { content: { type: "resource" as const, code: "copper_rocks" } },
        },
        {
          map_id: 2, name: "Town", skin: "town", x: 0, y: 0,
          layer: "overworld" as const,
          access: { type: "standard" as const },
          interactions: { content: { type: "bank" as const, code: "bank" } },
        },
      ] as GameMap[],
      [
        { name: "Copper Rocks", code: "copper_rocks", skill: "mining", level: 1, drops: [] },
      ] as Resource[],
      [
        { name: "Chicken", code: "chicken", level: 1, type: "normal", hp: 60, attack_fire: 4, attack_earth: 0, attack_water: 0, attack_air: 0, res_fire: 0, res_earth: 0, res_water: 0, res_air: 0, critical_strike: 0, initiative: 0, min_gold: 0, max_gold: 2, drops: [] },
      ] as Monster[]
    );

    const maps = gameData.findMapsWithResource("copper_rocks");
    expect(maps).toHaveLength(1);
    expect(maps[0].x).toBe(2);
    expect(maps[0].y).toBe(0);
  });

  test("findMapsWithMonster returns maps containing a monster", () => {
    const gameData = new GameData();
    gameData.load(
      [
        {
          map_id: 3, name: "Forest", skin: "forest", x: 1, y: 1,
          layer: "overworld" as const,
          access: { type: "standard" as const },
          interactions: { content: { type: "monster" as const, code: "chicken" } },
        },
      ] as GameMap[],
      [],
      [{ name: "Chicken", code: "chicken", level: 1, type: "normal", hp: 60, attack_fire: 4, attack_earth: 0, attack_water: 0, attack_air: 0, res_fire: 0, res_earth: 0, res_water: 0, res_air: 0, critical_strike: 0, initiative: 0, min_gold: 0, max_gold: 2, drops: [] }] as Monster[]
    );

    const maps = gameData.findMapsWithMonster("chicken");
    expect(maps).toHaveLength(1);
  });

  test("findNearestBank returns closest bank to position", () => {
    const gameData = new GameData();
    gameData.load(
      [
        {
          map_id: 1, name: "Bank 1", skin: "bank", x: 4, y: 1,
          layer: "overworld" as const,
          access: { type: "standard" as const },
          interactions: { content: { type: "bank" as const, code: "bank" } },
        },
        {
          map_id: 2, name: "Bank 2", skin: "bank", x: 1, y: 0,
          layer: "overworld" as const,
          access: { type: "standard" as const },
          interactions: { content: { type: "bank" as const, code: "bank" } },
        },
      ] as GameMap[],
      [],
      []
    );

    const bank = gameData.findNearestBank(0, 0);
    expect(bank).toBeDefined();
    expect(bank!.x).toBe(1);
    expect(bank!.y).toBe(0);
  });

  test("getResourceByCode returns resource details", () => {
    const gameData = new GameData();
    gameData.load(
      [],
      [{ name: "Copper Rocks", code: "copper_rocks", skill: "mining", level: 1, drops: [] }] as Resource[],
      []
    );

    const resource = gameData.getResourceByCode("copper_rocks");
    expect(resource).toBeDefined();
    expect(resource!.skill).toBe("mining");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test src/agent/game-data.test.ts`
Expected: FAIL - module not found

**Step 3: Implement GameData**

```typescript
// src/agent/game-data.ts
import type { GameMap, Resource, Monster } from "../types";

export class GameData {
  private maps: GameMap[] = [];
  private resources: Map<string, Resource> = new Map();
  private monsters: Map<string, Monster> = new Map();

  load(maps: GameMap[], resources: Resource[], monsters: Monster[]): void {
    this.maps = maps;
    for (const r of resources) this.resources.set(r.code, r);
    for (const m of monsters) this.monsters.set(m.code, m);
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
}
```

**Step 4: Run tests**

Run: `bun test src/agent/game-data.test.ts`
Expected: 4 tests pass

**Step 5: Commit**

```bash
git add src/agent/game-data.ts src/agent/game-data.test.ts
git commit -m "feat: add game data cache for maps, resources, and monsters"
```

---

### Story 6.2: Character agent loop

> **Context for agent:** Build the core character agent that runs the action loop. It takes a strategy function, API client, board, game data, and logger. The loop: ask strategy for goal → check survival overrides (low HP, full inventory) → resolve goal into action → execute → update state and board → log → wait for cooldown → repeat. Stuck detection: 3 consecutive failures on the same goal triggers a skip. Crash isolation: catch exceptions, log, wait 10s, restart. See `docs/architecture.md` and all files in `src/`. The strategy type is `(state: Character, board: BoardSnapshot, gameData: GameData) => Goal` imported from `src/types/index.ts`.

**Files:**
- Create: `src/agent/agent.ts`
- Create: `src/agent/agent.test.ts`

**Step 1: Write failing tests**

```typescript
// src/agent/agent.test.ts
import { describe, test, expect, mock } from "bun:test";
import { Agent, type Strategy } from "./agent";
import { ApiClient } from "../api/client";
import { Board } from "../board/board";
import { GameData } from "./game-data";
import { Logger } from "../logger/logger";
import type { Character, Goal, GameMap } from "../types";
import { existsSync, unlinkSync } from "fs";

const TEST_LOG = "logs/test-agent.log";

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    name: "test-agent", account: "test", skin: "men1", level: 1,
    xp: 0, max_xp: 100, gold: 0, speed: 0,
    mining_level: 1, mining_xp: 0, mining_max_xp: 100,
    woodcutting_level: 1, woodcutting_xp: 0, woodcutting_max_xp: 100,
    fishing_level: 1, fishing_xp: 0, fishing_max_xp: 100,
    weaponcrafting_level: 1, weaponcrafting_xp: 0, weaponcrafting_max_xp: 100,
    gearcrafting_level: 1, gearcrafting_xp: 0, gearcrafting_max_xp: 100,
    jewelrycrafting_level: 1, jewelrycrafting_xp: 0, jewelrycrafting_max_xp: 100,
    cooking_level: 1, cooking_xp: 0, cooking_max_xp: 100,
    alchemy_level: 1, alchemy_xp: 0, alchemy_max_xp: 100,
    hp: 100, max_hp: 100, haste: 0, critical_strike: 0, wisdom: 0,
    prospecting: 0, initiative: 0, threat: 0,
    attack_fire: 0, attack_earth: 0, attack_water: 0, attack_air: 0,
    dmg: 0, dmg_fire: 0, dmg_earth: 0, dmg_water: 0, dmg_air: 0,
    res_fire: 0, res_earth: 0, res_water: 0, res_air: 0,
    effects: [], x: 0, y: 0, layer: "overworld", map_id: 0,
    cooldown: 0, cooldown_expiration: new Date().toISOString(),
    weapon_slot: "", rune_slot: "", shield_slot: "", helmet_slot: "",
    body_armor_slot: "", leg_armor_slot: "", boots_slot: "",
    ring1_slot: "", ring2_slot: "", amulet_slot: "",
    artifact1_slot: "", artifact2_slot: "", artifact3_slot: "",
    utility1_slot: "", utility1_slot_quantity: 0,
    utility2_slot: "", utility2_slot_quantity: 0, bag_slot: "",
    task: "", task_type: "", task_progress: 0, task_total: 0,
    inventory_max_items: 20, inventory: [],
    ...overrides,
  };
}

describe("Agent", () => {
  afterEach(() => {
    if (existsSync(TEST_LOG)) unlinkSync(TEST_LOG);
  });

  test("overrides strategy with rest when HP is low", () => {
    const char = makeCharacter({ hp: 30, max_hp: 100 });
    const needsRest = Agent.checkSurvivalOverride(char);
    expect(needsRest).toEqual({ type: "rest" });
  });

  test("overrides strategy with deposit when inventory is full", () => {
    const inventory = Array.from({ length: 20 }, (_, i) => ({
      slot: i,
      code: "copper_ore",
      quantity: 1,
    }));
    const char = makeCharacter({ inventory, inventory_max_items: 20 });
    const needsDeposit = Agent.checkSurvivalOverride(char);
    expect(needsDeposit).toEqual({ type: "deposit_all" });
  });

  test("no override when character is healthy with space", () => {
    const char = makeCharacter({ hp: 80, max_hp: 100, inventory: [] });
    const override = Agent.checkSurvivalOverride(char);
    expect(override).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test src/agent/agent.test.ts`
Expected: FAIL - module not found

**Step 3: Implement the agent**

```typescript
// src/agent/agent.ts
import type { Character, Goal } from "../types";
import type { BoardSnapshot } from "../board/board";
import type { GameData } from "./game-data";
import type { ApiClient } from "../api/client";
import type { Board } from "../board/board";
import type { Logger } from "../logger/logger";
import { ApiRequestError } from "../api/client";

export type Strategy = (
  state: Character,
  board: BoardSnapshot,
  gameData: GameData
) => Goal;

export class Agent {
  private name: string;
  private state: Character | null = null;
  private strategy: Strategy;
  private api: ApiClient;
  private board: Board;
  private gameData: GameData;
  private logger: Logger;
  private running = false;
  private consecutiveFailures = 0;
  private lastFailedGoalType: string | null = null;

  constructor(
    name: string,
    strategy: Strategy,
    api: ApiClient,
    board: Board,
    gameData: GameData,
    logger: Logger
  ) {
    this.name = name;
    this.strategy = strategy;
    this.api = api;
    this.board = board;
    this.gameData = gameData;
    this.logger = logger;
  }

  static checkSurvivalOverride(state: Character): Goal | null {
    // Rest if HP below 40%
    if (state.hp < state.max_hp * 0.4) {
      return { type: "rest" };
    }
    // Deposit if inventory is full
    const usedSlots = state.inventory.filter((s) => s.quantity > 0).length;
    if (usedSlots >= state.inventory_max_items) {
      return { type: "deposit_all" };
    }
    return null;
  }

  async start(): Promise<void> {
    this.running = true;
    this.logger.info("Agent starting", { name: this.name });

    // Fetch initial state
    try {
      this.state = await this.api.getCharacter(this.name);
      this.syncBoard();
      this.logger.info("Initial state loaded", {
        hp: this.state.hp,
        position: { x: this.state.x, y: this.state.y },
        level: this.state.level,
      });
    } catch (err) {
      this.logger.error("Failed to load initial state", {
        error: String(err),
      });
      return;
    }

    // Main loop
    while (this.running) {
      try {
        await this.tick();
      } catch (err) {
        this.logger.error("Unhandled error in agent loop", {
          error: String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });
        // Wait 10s before restarting loop
        await new Promise((r) => setTimeout(r, 10_000));
        // Re-fetch state to recover
        try {
          this.state = await this.api.getCharacter(this.name);
          this.syncBoard();
        } catch {
          this.logger.error("Failed to recover state, will retry");
        }
      }
    }
  }

  stop(): void {
    this.running = false;
    this.logger.info("Agent stopping");
  }

  private async tick(): Promise<void> {
    if (!this.state) return;

    // Wait for cooldown
    await this.api.waitForCooldown(this.name);

    // Check survival overrides
    const override = Agent.checkSurvivalOverride(this.state);
    const boardSnapshot = this.board.getSnapshot();

    let goal: Goal;
    let reason: string;

    if (override) {
      goal = override;
      reason = `survival override: ${goal.type}`;
    } else {
      goal = this.strategy(this.state, boardSnapshot, this.gameData);
      reason = "strategy decision";
    }

    // Stuck detection
    const goalKey = JSON.stringify(goal);
    if (goalKey === this.lastFailedGoalType) {
      if (this.consecutiveFailures >= 3) {
        this.logger.warn("Stuck detected, requesting idle", {
          failedGoal: goal,
          failures: this.consecutiveFailures,
        });
        goal = { type: "idle", reason: "stuck after 3 failures" };
        reason = "stuck detection";
        this.consecutiveFailures = 0;
        this.lastFailedGoalType = null;
      }
    } else {
      this.consecutiveFailures = 0;
      this.lastFailedGoalType = null;
    }

    // Log decision
    this.logger.decision(
      JSON.stringify(goal),
      reason,
      boardSnapshot,
      {
        hp: this.state.hp,
        max_hp: this.state.max_hp,
        x: this.state.x,
        y: this.state.y,
        inventoryUsed: this.state.inventory.filter((s) => s.quantity > 0).length,
        inventoryMax: this.state.inventory_max_items,
      }
    );

    // Execute goal
    try {
      await this.executeGoal(goal);
      this.consecutiveFailures = 0;
      this.lastFailedGoalType = null;
    } catch (err) {
      this.consecutiveFailures++;
      this.lastFailedGoalType = goalKey;

      if (err instanceof ApiRequestError) {
        this.logger.error("Action failed", {
          goal,
          errorCode: err.errorCode,
          errorMessage: err.errorMessage,
        });
      } else {
        throw err; // Re-throw unexpected errors to the outer catch
      }
    }
  }

  private async executeGoal(goal: Goal): Promise<void> {
    switch (goal.type) {
      case "rest": {
        const result = await this.api.rest(this.name);
        this.state = result.character;
        this.logger.info("Rested", { hp_restored: result.hp_restored });
        break;
      }

      case "deposit_all": {
        const itemsToDeposit = this.state!.inventory
          .filter((s) => s.quantity > 0)
          .map((s) => ({ code: s.code, quantity: s.quantity }));
        if (itemsToDeposit.length === 0) break;

        // Move to bank if not there
        const bank = this.gameData.findNearestBank(this.state!.x, this.state!.y);
        if (!bank) {
          this.logger.error("No bank found on any map");
          break;
        }
        if (this.state!.x !== bank.x || this.state!.y !== bank.y) {
          const moveResult = await this.api.move(this.name, bank.x, bank.y);
          this.state = moveResult.character;
        }

        const result = await this.api.depositItems(this.name, itemsToDeposit);
        this.state = result.character;
        this.board.updateBank(result.bank, this.board.getSnapshot().bank.gold);
        this.logger.info("Deposited items", { count: itemsToDeposit.length });
        break;
      }

      case "gather": {
        // Find resource location
        const resource = this.gameData.getResourceByCode(goal.resource);
        if (!resource) {
          this.logger.error("Unknown resource", { resource: goal.resource });
          break;
        }
        const resourceMaps = this.gameData.findMapsWithResource(goal.resource);
        const targetMap = this.gameData.findNearestMap(
          this.state!.x,
          this.state!.y,
          resourceMaps
        );
        if (!targetMap) {
          this.logger.error("No map found for resource", { resource: goal.resource });
          break;
        }

        // Move if needed
        if (this.state!.x !== targetMap.x || this.state!.y !== targetMap.y) {
          const moveResult = await this.api.move(this.name, targetMap.x, targetMap.y);
          this.state = moveResult.character;
          this.syncBoard();
          return; // Next tick will gather
        }

        // Gather
        const result = await this.api.gather(this.name);
        this.state = result.character;
        this.logger.info("Gathered", {
          xp: result.details.xp,
          items: result.details.items,
        });
        break;
      }

      case "fight": {
        // Find monster location
        const monsterMaps = this.gameData.findMapsWithMonster(goal.monster);
        const targetMap = this.gameData.findNearestMap(
          this.state!.x,
          this.state!.y,
          monsterMaps
        );
        if (!targetMap) {
          this.logger.error("No map found for monster", { monster: goal.monster });
          break;
        }

        // Move if needed
        if (this.state!.x !== targetMap.x || this.state!.y !== targetMap.y) {
          const moveResult = await this.api.move(this.name, targetMap.x, targetMap.y);
          this.state = moveResult.character;
          this.syncBoard();
          return;
        }

        // Fight
        const result = await this.api.fight(this.name);
        const myResult = result.fight.characters.find(
          (c) => c.character_name === this.name
        );
        this.state = result.characters.find((c) => c.name === this.name) ?? this.state!;
        this.logger.info("Fought", {
          opponent: result.fight.opponent,
          result: result.fight.result,
          xp: myResult?.xp ?? 0,
          gold: myResult?.gold ?? 0,
          drops: myResult?.drops ?? [],
        });
        break;
      }

      case "craft": {
        // Find workshop - crafting workshops have content type "workshop"
        const workshops = this.gameData.findMapsWithContent("workshop");
        const targetMap = this.gameData.findNearestMap(
          this.state!.x,
          this.state!.y,
          workshops
        );
        if (!targetMap) {
          this.logger.error("No workshop found");
          break;
        }

        // Move if needed
        if (this.state!.x !== targetMap.x || this.state!.y !== targetMap.y) {
          const moveResult = await this.api.move(this.name, targetMap.x, targetMap.y);
          this.state = moveResult.character;
          this.syncBoard();
          return;
        }

        const result = await this.api.craft(this.name, goal.item, goal.quantity);
        this.state = result.character;
        this.logger.info("Crafted", {
          item: goal.item,
          quantity: goal.quantity,
          xp: result.details.xp,
        });
        break;
      }

      case "move": {
        const moveResult = await this.api.move(this.name, goal.x, goal.y);
        this.state = moveResult.character;
        this.logger.info("Moved", { x: goal.x, y: goal.y });
        break;
      }

      case "equip": {
        this.state = await this.api.equip(this.name, goal.code, goal.slot);
        this.logger.info("Equipped", { code: goal.code, slot: goal.slot });
        break;
      }

      case "unequip": {
        this.state = await this.api.unequip(this.name, goal.slot);
        this.logger.info("Unequipped", { slot: goal.slot });
        break;
      }

      case "idle": {
        this.logger.info("Idling", { reason: goal.reason });
        await new Promise((r) => setTimeout(r, 5000));
        // Re-fetch state in case something changed
        this.state = await this.api.getCharacter(this.name);
        break;
      }
    }

    this.syncBoard();
  }

  private syncBoard(): void {
    if (!this.state) return;
    const skillLevels: Record<string, number> = {
      mining: this.state.mining_level,
      woodcutting: this.state.woodcutting_level,
      fishing: this.state.fishing_level,
      weaponcrafting: this.state.weaponcrafting_level,
      gearcrafting: this.state.gearcrafting_level,
      jewelrycrafting: this.state.jewelrycrafting_level,
      cooking: this.state.cooking_level,
      alchemy: this.state.alchemy_level,
      combat: this.state.level,
    };

    this.board.updateCharacter(this.name, {
      currentAction: "evaluating",
      target: "",
      position: { x: this.state.x, y: this.state.y },
      skillLevels,
      inventoryUsed: this.state.inventory.filter((s) => s.quantity > 0).length,
      inventoryMax: this.state.inventory_max_items,
    });
  }
}
```

**Step 4: Run tests**

Run: `bun test src/agent/agent.test.ts`
Expected: 3 tests pass

**Step 5: Verify all types compile**

Run: `bunx tsc --noEmit`
Expected: no errors

**Step 6: Commit**

```bash
git add src/agent/agent.ts src/agent/agent.test.ts
git commit -m "feat: add character agent with action loop and survival logic"
```

---

## Epic 7: Strategy

> **Context for agent:** Build the `max_all_skills` strategy. This is a pure function `(state: Character, board: BoardSnapshot, gameData: GameData) => Goal`. It decides what the character should work on next. Logic: find the character's lowest skill → check if another character is already working on that skill (via board) → if so, pick the next lowest → find the best resource/monster for that skill at the character's level → return a gather/fight goal. Skills are: mining, woodcutting, fishing, alchemy (gathering) and weaponcrafting, gearcrafting, jewelrycrafting, cooking (crafting) and combat. Types in `src/types/index.ts`. Board types in `src/board/board.ts`. GameData in `src/agent/game-data.ts`.

### Story 7.1: Implement max_all_skills strategy

**Files:**
- Create: `src/strategy/max-all-skills.ts`
- Create: `src/strategy/max-all-skills.test.ts`

**Step 1: Write failing tests**

```typescript
// src/strategy/max-all-skills.test.ts
import { describe, test, expect } from "bun:test";
import { maxAllSkills } from "./max-all-skills";
import { GameData } from "../agent/game-data";
import type { Character, GameMap, Resource, Monster } from "../types";
import type { BoardSnapshot } from "../board/board";

function makeChar(overrides: Partial<Character> = {}): Character {
  return {
    name: "alice", account: "test", skin: "men1", level: 1,
    xp: 0, max_xp: 100, gold: 0, speed: 0,
    mining_level: 1, mining_xp: 0, mining_max_xp: 100,
    woodcutting_level: 1, woodcutting_xp: 0, woodcutting_max_xp: 100,
    fishing_level: 1, fishing_xp: 0, fishing_max_xp: 100,
    weaponcrafting_level: 1, weaponcrafting_xp: 0, weaponcrafting_max_xp: 100,
    gearcrafting_level: 1, gearcrafting_xp: 0, gearcrafting_max_xp: 100,
    jewelrycrafting_level: 1, jewelrycrafting_xp: 0, jewelrycrafting_max_xp: 100,
    cooking_level: 1, cooking_xp: 0, cooking_max_xp: 100,
    alchemy_level: 1, alchemy_xp: 0, alchemy_max_xp: 100,
    hp: 100, max_hp: 100, haste: 0, critical_strike: 0, wisdom: 0,
    prospecting: 0, initiative: 0, threat: 0,
    attack_fire: 0, attack_earth: 0, attack_water: 0, attack_air: 0,
    dmg: 0, dmg_fire: 0, dmg_earth: 0, dmg_water: 0, dmg_air: 0,
    res_fire: 0, res_earth: 0, res_water: 0, res_air: 0,
    effects: [], x: 0, y: 0, layer: "overworld", map_id: 0,
    cooldown: 0, cooldown_expiration: new Date().toISOString(),
    weapon_slot: "", rune_slot: "", shield_slot: "", helmet_slot: "",
    body_armor_slot: "", leg_armor_slot: "", boots_slot: "",
    ring1_slot: "", ring2_slot: "", amulet_slot: "",
    artifact1_slot: "", artifact2_slot: "", artifact3_slot: "",
    utility1_slot: "", utility1_slot_quantity: 0,
    utility2_slot: "", utility2_slot_quantity: 0, bag_slot: "",
    task: "", task_type: "", task_progress: 0, task_total: 0,
    inventory_max_items: 20, inventory: [],
    ...overrides,
  };
}

function makeGameData(): GameData {
  const gd = new GameData();
  gd.load(
    [
      { map_id: 1, name: "Copper Mine", skin: "mine", x: 2, y: 0, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "resource", code: "copper_rocks" } } },
      { map_id: 2, name: "Forest", skin: "forest", x: 0, y: 2, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "resource", code: "ash_tree" } } },
      { map_id: 3, name: "Pond", skin: "pond", x: 3, y: 0, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "resource", code: "gudgeon_fishing_spot" } } },
      { map_id: 4, name: "Chicken Coop", skin: "coop", x: 0, y: 1, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "monster", code: "chicken" } } },
      { map_id: 5, name: "Bank", skin: "bank", x: 4, y: 1, layer: "overworld", access: { type: "standard" }, interactions: { content: { type: "bank", code: "bank" } } },
    ] as GameMap[],
    [
      { name: "Copper Rocks", code: "copper_rocks", skill: "mining", level: 1, drops: [] },
      { name: "Ash Tree", code: "ash_tree", skill: "woodcutting", level: 1, drops: [] },
      { name: "Gudgeon Spot", code: "gudgeon_fishing_spot", skill: "fishing", level: 1, drops: [] },
    ] as Resource[],
    [
      { name: "Chicken", code: "chicken", level: 1, type: "normal", hp: 60, attack_fire: 4, attack_earth: 0, attack_water: 0, attack_air: 0, res_fire: 0, res_earth: 0, res_water: 0, res_air: 0, critical_strike: 0, initiative: 0, min_gold: 0, max_gold: 2, drops: [] },
    ] as Monster[]
  );
  return gd;
}

const emptyBoard: BoardSnapshot = {
  characters: {},
  bank: { items: [], gold: 0, lastUpdated: 0 },
};

describe("maxAllSkills", () => {
  test("picks lowest skill when all are equal", () => {
    const char = makeChar();
    const gd = makeGameData();
    const goal = maxAllSkills(char, emptyBoard, gd);
    // All skills at level 1, should pick one of the gathering/combat skills
    expect(["gather", "fight"]).toContain(goal.type);
  });

  test("picks the lowest skill when one is behind", () => {
    const char = makeChar({
      mining_level: 5,
      woodcutting_level: 5,
      fishing_level: 1, // lowest
      weaponcrafting_level: 5,
      gearcrafting_level: 5,
      jewelrycrafting_level: 5,
      cooking_level: 5,
      alchemy_level: 5,
      level: 5,
    });
    const gd = makeGameData();
    const goal = maxAllSkills(char, emptyBoard, gd);
    expect(goal.type).toBe("gather");
    if (goal.type === "gather") {
      expect(goal.resource).toBe("gudgeon_fishing_spot");
    }
  });

  test("avoids skill another character is working on", () => {
    const char = makeChar({
      mining_level: 5,
      woodcutting_level: 5,
      fishing_level: 1,
      level: 5,
      weaponcrafting_level: 5,
      gearcrafting_level: 5,
      jewelrycrafting_level: 5,
      cooking_level: 5,
      alchemy_level: 5,
    });
    const board: BoardSnapshot = {
      characters: {
        bob: {
          currentAction: "gathering",
          target: "fishing",
          position: { x: 0, y: 0 },
          skillLevels: { fishing: 1 },
          inventoryUsed: 0,
          inventoryMax: 20,
        },
      },
      bank: { items: [], gold: 0, lastUpdated: 0 },
    };
    const gd = makeGameData();
    const goal = maxAllSkills(char, board, gd);
    // Should skip fishing since bob is doing it, pick next lowest
    if (goal.type === "gather") {
      expect(goal.resource).not.toBe("gudgeon_fishing_spot");
    }
  });

  test("returns idle when no valid goal found", () => {
    const char = makeChar();
    const emptyGd = new GameData();
    emptyGd.load([], [], []);
    const goal = maxAllSkills(char, emptyBoard, emptyGd);
    expect(goal.type).toBe("idle");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test src/strategy/max-all-skills.test.ts`
Expected: FAIL - module not found

**Step 3: Implement the strategy**

```typescript
// src/strategy/max-all-skills.ts
import type { Character, Goal } from "../types";
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

export function maxAllSkills(
  state: Character,
  board: BoardSnapshot,
  gameData: GameData
): Goal {
  const skills = getSkillLevels(state);
  const othersTargets = getOthersTargets(board, state.name);

  // Sort by level ascending (lowest first)
  const sorted = [...skills].sort((a, b) => a.level - b.level);

  for (const entry of sorted) {
    // Skip if another character is already working on this skill
    if (othersTargets.has(entry.skill)) continue;

    if (entry.type === "gathering") {
      // Find the best resource for this skill at our level
      const resources = gameData
        .getResourcesForSkill(entry.skill)
        .filter((r) => r.level <= entry.level)
        .sort((a, b) => b.level - a.level); // highest level we can do

      if (resources.length === 0) continue;

      // Check that a map exists for this resource
      const maps = gameData.findMapsWithResource(resources[0].code);
      if (maps.length === 0) continue;

      return { type: "gather", resource: resources[0].code };
    }

    if (entry.type === "combat") {
      // Find the strongest monster we can reasonably fight
      const monsters = gameData
        .getMonstersByLevel(entry.level)
        .sort((a, b) => b.level - a.level);

      if (monsters.length === 0) continue;

      // Check that a map exists for this monster
      const maps = gameData.findMapsWithMonster(monsters[0].code);
      if (maps.length === 0) continue;

      return { type: "fight", monster: monsters[0].code };
    }

    if (entry.type === "crafting") {
      // Crafting requires items in inventory - for now, skip and let
      // gathering/combat build up resources. Crafting strategy will
      // be enhanced later to check bank contents and craft when possible.
      continue;
    }
  }

  return { type: "idle", reason: "no valid goal found" };
}
```

**Step 4: Run tests**

Run: `bun test src/strategy/max-all-skills.test.ts`
Expected: 4 tests pass

**Step 5: Commit**

```bash
git add src/strategy/max-all-skills.ts src/strategy/max-all-skills.test.ts
git commit -m "feat: add max_all_skills self-directing strategy"
```

---

## Epic 8: Entry Point

> **Context for agent:** Wire everything together in `src/index.ts`. The boot sequence: load config → create API client → create board → load game data (fetch all maps, resources, monsters from API with pagination) → fetch character list → create agents → start all agents. Handle SIGINT/SIGTERM for graceful shutdown. See `docs/architecture.md` "Data Flow" section. All modules are already built: config (`src/config.ts`), API client (`src/api/client.ts`), board (`src/board/board.ts`), game data (`src/agent/game-data.ts`), agent (`src/agent/agent.ts`), strategy (`src/strategy/max-all-skills.ts`), logger (`src/logger/logger.ts`).

### Story 8.1: Implement boot sequence

**Files:**
- Modify: `src/index.ts`

**Step 1: Write the entry point**

```typescript
// src/index.ts
import { loadConfig } from "./config";
import { ApiClient } from "./api/client";
import { Board } from "./board/board";
import { GameData } from "./agent/game-data";
import { Agent } from "./agent/agent";
import { Logger } from "./logger/logger";
import { maxAllSkills } from "./strategy/max-all-skills";
import type { GameMap, Resource, Monster } from "./types";

async function fetchAllPages<T>(
  fetcher: (page: number) => Promise<{ data: T[]; pages: number }>
): Promise<T[]> {
  const firstPage = await fetcher(1);
  const allItems = [...firstPage.data];
  for (let page = 2; page <= firstPage.pages; page++) {
    const nextPage = await fetcher(page);
    allItems.push(...nextPage.data);
  }
  return allItems;
}

async function main() {
  console.log("=== Artifacts MMO Bot ===");

  // Load config
  const config = loadConfig();
  console.log("Config loaded");

  // Create shared instances
  const api = new ApiClient(config.apiToken);
  const board = new Board();
  const gameData = new GameData();

  // Load game data
  console.log("Loading game data...");
  const [maps, resources, monsters] = await Promise.all([
    fetchAllPages<GameMap>((page) => api.getMaps(page)),
    fetchAllPages<Resource>((page) => api.getResources(page)),
    fetchAllPages<Monster>((page) => api.getMonsters(page)),
  ]);
  gameData.load(maps, resources, monsters);
  console.log(
    `Game data loaded: ${maps.length} maps, ${resources.length} resources, ${monsters.length} monsters`
  );

  // Fetch characters
  const characters = await api.getMyCharacters();
  console.log(
    `Found ${characters.length} characters: ${characters.map((c) => c.name).join(", ")}`
  );

  if (characters.length === 0) {
    console.error("No characters found. Create characters first.");
    process.exit(1);
  }

  // Create and start agents
  const agents: Agent[] = [];
  for (const char of characters) {
    const logger = new Logger(char.name);
    const agent = new Agent(
      char.name,
      maxAllSkills,
      api,
      board,
      gameData,
      logger
    );
    agents.push(agent);
  }

  // Graceful shutdown
  const shutdown = () => {
    console.log("\nShutting down...");
    for (const agent of agents) {
      agent.stop();
    }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Start all agents concurrently
  console.log("Starting agents...");
  await Promise.all(agents.map((agent) => agent.start()));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
```

**Step 2: Verify it compiles**

Run: `bunx tsc --noEmit`
Expected: no errors

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add entry point with boot sequence and graceful shutdown"
```

---

### Story 8.2: Update board target in agent for strategy coordination

> **Context for agent:** The strategy checks `board.characters[name].target` to see what skill others are working on. The agent needs to update this field after choosing a goal so other agents can see it. Modify `src/agent/agent.ts` to update the board's `currentAction` and `target` fields after the strategy returns a goal.

**Files:**
- Modify: `src/agent/agent.ts`

**Step 1: Update the tick method**

In the `tick()` method of `Agent`, after the strategy returns a goal and before executing, update the board with what this agent is about to work on:

```typescript
// After deciding on goal and reason, before "// Log decision":

// Update board with current intent
const targetSkill = this.getTargetSkill(goal);
this.board.updateCharacter(this.name, {
  currentAction: goal.type,
  target: targetSkill,
  position: { x: this.state!.x, y: this.state!.y },
  skillLevels: this.getSkillLevels(),
  inventoryUsed: this.state!.inventory.filter((s) => s.quantity > 0).length,
  inventoryMax: this.state!.inventory_max_items,
});
```

Add these helper methods to the Agent class:

```typescript
private getTargetSkill(goal: Goal): string {
  if (goal.type === "gather") {
    const resource = this.gameData.getResourceByCode(goal.resource);
    return resource?.skill ?? "";
  }
  if (goal.type === "fight") return "combat";
  if (goal.type === "craft") return "crafting";
  return "";
}

private getSkillLevels(): Record<string, number> {
  if (!this.state) return {};
  return {
    mining: this.state.mining_level,
    woodcutting: this.state.woodcutting_level,
    fishing: this.state.fishing_level,
    weaponcrafting: this.state.weaponcrafting_level,
    gearcrafting: this.state.gearcrafting_level,
    jewelrycrafting: this.state.jewelrycrafting_level,
    cooking: this.state.cooking_level,
    alchemy: this.state.alchemy_level,
    combat: this.state.level,
  };
}
```

**Step 2: Run all tests**

Run: `bun test`
Expected: all tests pass

**Step 3: Verify compilation**

Run: `bunx tsc --noEmit`
Expected: no errors

**Step 4: Commit**

```bash
git add src/agent/agent.ts
git commit -m "feat: update board target for strategy coordination"
```

---

### Story 8.3: Run all tests and verify

**Step 1: Run full test suite**

Run: `bun test`
Expected: all tests pass across all files

**Step 2: Type check**

Run: `bunx tsc --noEmit`
Expected: no errors

**Step 3: Final commit**

```bash
git add -A
git commit -m "chore: verify full test suite passes"
```

---

## Execution Checklist

| Epic | Story | Description |
|------|-------|-------------|
| 1 | 1.1 | Clean up package.json and tsconfig |
| 1 | 1.2 | Create directory structure and .gitignore |
| 1 | 1.3 | Create config loader |
| 2 | 2.1 | Core game types |
| 3 | 3.1 | Per-character logger |
| 4 | 4.1 | HTTP client with auth and retries |
| 4 | 4.2 | Typed action methods |
| 5 | 5.1 | Shared state board |
| 6 | 6.1 | Game data cache |
| 6 | 6.2 | Character agent loop |
| 7 | 7.1 | max_all_skills strategy |
| 8 | 8.1 | Boot sequence entry point |
| 8 | 8.2 | Board target coordination |
| 8 | 8.3 | Full test suite verification |
