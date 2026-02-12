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
