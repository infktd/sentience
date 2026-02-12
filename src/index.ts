import { loadConfig } from "./config";
import { ApiClient } from "./api/client";
import { Board } from "./board/board";
import { GameData } from "./agent/game-data";
import { Agent } from "./agent/agent";
import { Logger } from "./logger/logger";
import { taskFocused } from "./strategy/task-focused";
import { FightSimulator } from "./combat/simulator";
import type { GameMap, Resource, Monster, Item, NpcItem, ActiveEvent, SimpleItem, GEOrder } from "./types";

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

  // Load task definitions
  const taskDefs = await fetchAllPages((page) => api.getTasks(page));
  gameData.loadTasks(taskDefs);
  console.log(`Task definitions loaded: ${taskDefs.length} tasks`);

  // Load bank state into board
  const [bankItemsResult, bankInfoResult] = await Promise.all([
    fetchAllPages<SimpleItem>((page) => api.getBankItems(page)),
    api.getBank(),
  ]);
  board.updateBank(bankItemsResult, bankInfoResult.data.gold);
  console.log(`Bank loaded: ${bankItemsResult.length} item stacks, ${bankInfoResult.data.gold} gold`);

  // Initial event load + polling
  let eventPollTimer: ReturnType<typeof setTimeout> | null = null;
  async function pollEvents() {
    try {
      const events = await fetchAllPages<ActiveEvent>((page) => api.getActiveEvents(page));
      gameData.applyEvents(events);
      if (events.length > 0) {
        console.log(`Active events: ${events.map((e) => e.name).join(", ")}`);
      }
    } catch (err) {
      console.error("Event polling failed:", err);
    }
    eventPollTimer = setTimeout(pollEvents, 5 * 60 * 1000);
  }
  await pollEvents();

  // Initial GE orders load + polling
  let gePollTimer: ReturnType<typeof setTimeout> | null = null;
  async function pollGEOrders() {
    try {
      const orders = await fetchAllPages<GEOrder>((page) => api.getGEOrders(undefined, page));
      board.updateGEOrders(orders);
      console.log(`GE orders loaded: ${orders.length} orders`);
    } catch (err) {
      console.error("GE order polling failed:", err);
    }
    gePollTimer = setTimeout(pollGEOrders, 2 * 60 * 1000);
  }
  await pollGEOrders();

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
      taskFocused,
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
    if (eventPollTimer) clearTimeout(eventPollTimer);
    if (gePollTimer) clearTimeout(gePollTimer);
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
