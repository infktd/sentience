import { loadConfig } from "./config";
import { ApiClient } from "./api/client";
import { Board } from "./board/board";
import { GameData } from "./agent/game-data";
import { Agent } from "./agent/agent";
import { Logger } from "./logger/logger";
import { maxAllSkills } from "./strategy/max-all-skills";
import { FightSimulator } from "./combat/simulator";
import type { GameMap, Resource, Monster, Item, NpcItem } from "./types";

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
  const [maps, resources, monsters, items, npcItems] = await Promise.all([
    fetchAllPages<GameMap>((page) => api.getMaps(page)),
    fetchAllPages<Resource>((page) => api.getResources(page)),
    fetchAllPages<Monster>((page) => api.getMonsters(page)),
    fetchAllPages<Item>((page) => api.getItems(page)),
    fetchAllPages<NpcItem>((page) => api.getNpcItems(page)),
  ]);
  gameData.load(maps, resources, monsters, items);
  gameData.loadNpcItems(npcItems);
  console.log(
    `Game data loaded: ${maps.length} maps, ${resources.length} resources, ${monsters.length} monsters, ${items.length} items, ${npcItems.length} NPC items`
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

  // Create shared simulator
  const simulator = new FightSimulator(api);
  console.log("Fight simulator ready");

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
      logger,
      simulator
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
