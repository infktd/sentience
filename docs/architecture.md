# Artifacts MMO Bot - Architecture

## Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Runtime | Bun | Built-in TypeScript, fast startup, built-in test runner, no extra tooling |
| Language | TypeScript | Type safety for API responses and game state |
| API Spec | OpenAPI 3.1.0 | Source of truth at `https://api.artifactsmmo.com/openapi.json` |
| Testing | `bun test` | Zero-config, built into runtime |
| Config | `.env` + TypeScript | Secrets in `.env`, behavior in `config.ts` |
| Logging | Custom file logger | Per-character log files with JSON decision snapshots |
| Dev Environment | Devcontainer | Bun image with git and zsh |

No frameworks. No database. No external dependencies beyond the Artifacts MMO API.

## Project Structure

```
artifacts-mmo/
├── .devcontainer/
│   └── devcontainer.json
├── docs/
│   ├── prd.md
│   └── architecture.md
├── src/
│   ├── index.ts              # entry point - boots all agents
│   ├── config.ts             # loads .env + character directives
│   ├── api/
│   │   └── client.ts         # typed API client
│   ├── agent/
│   │   ├── agent.ts          # character agent - action loop
│   │   └── goals.ts          # goal execution - breaks goals into API calls
│   ├── strategy/
│   │   └── max-all-skills.ts # self-directing strategy logic
│   ├── board/
│   │   └── board.ts          # shared state board
│   ├── logger/
│   │   └── logger.ts         # per-character file logging
│   └── types/
│       └── index.ts          # shared types
├── logs/                     # runtime logs (gitignored)
├── .env                      # API token (gitignored)
├── .gitignore
├── package.json
└── tsconfig.json
```

## Component Design

### API Client (`src/api/client.ts`)

Single shared instance across all agents. Responsibilities:
- JWT bearer token auth from `.env`
- Per-character cooldown tracking - never sends a request it knows will fail
- Rate limit handling (429) with exponential backoff
- Network/5xx retry (up to 3 attempts with backoff)
- 401 detection - stops all agents, logs clear error
- Typed request/response based on OpenAPI spec

### Character Agent (`src/agent/agent.ts`)

One instance per character. Runs an independent action loop:

```
evaluate → execute → update state → wait for cooldown → repeat
```

Built-in survival logic (not part of strategy):
- Rest when HP is low
- Deposit when inventory is full
- Move to correct location before acting
- If action fails, re-evaluate instead of retrying

Stuck detection: if the same goal fails 3 times consecutively, skip to next option and log a warning.

Crash isolation: unhandled exception in one agent is caught, logged, and the agent restarts after a delay. Other agents are unaffected.

### Goal Execution (`src/agent/goals.ts`)

Translates high-level goals into sequences of API calls:

```
Goal: { type: "gather", resource: "copper_ore", until: "inventory_full" }

Agent resolves:
1. Am I at a copper node? No → move there
2. Is inventory full? Yes → go to bank, deposit, come back
3. Gather → wait cooldown → repeat until condition met
```

Goals are declarative. The agent figures out the steps.

### Strategy (`src/strategy/max-all-skills.ts`)

A pure function: `(state: CharacterState, board: Board) => Goal`

The `max_all_skills` strategy:
1. Look at all skill levels for this character
2. Find the lowest skill
3. Check the board - is another character already working on that skill?
   - Yes → pick the next lowest skill no one else is working on
   - No → pick it
4. Consider dependencies (need better gear? craft it first. need materials? gather them first)
5. Return the appropriate goal

Adding a new strategy: create a new file in `src/strategy/`, export a function with the same signature. Assign it to a character in `config.ts`.

### Shared State Board (`src/board/board.ts`)

Plain in-memory object. Each agent writes only its own section. A central updater refreshes bank state periodically.

```typescript
{
  characters: {
    [name: string]: {
      currentAction: string
      target: string
      position: { x: number, y: number }
      inventory: Item[]
      skillLevels: Record<string, number>
    }
  },
  bank: {
    items: Item[]
    gold: number
    lastUpdated: number
  }
}
```

Rules:
- Agents read freely
- Agents write only to `board.characters[ownName]`
- Bank state updated by a shared updater (not by individual agents)
- Fully JSON-serializable

### Logger (`src/logger/logger.ts`)

Per-character log files: `logs/{characterName}.log`

Every decision logged as:
```json
{
  "timestamp": "ISO string",
  "character": "name",
  "board": { "snapshot" },
  "state": { "snapshot" },
  "decision": "goal chosen",
  "reason": "why this goal"
}
```

Errors logged with full context: what was attempted, what failed, what the state was.

No interleaved output. One file per character. Read one file to debug one character.

## Error Handling

### Layer 1: API Client (request-level)
- Cooldown not expired → wait automatically
- 429 rate limit → exponential backoff retry
- Network errors / 5xx → retry up to 3 times with backoff, then pause agent
- 401 → stop all agents, log token error

### Layer 2: Agent (action-level)
- 4xx action failure → log with context, re-evaluate (don't retry same action)
- Stuck detection → 3 consecutive failures on same goal triggers skip + warning
- Low HP → prioritize moving to safety and resting

### Layer 3: Process (system-level)
- Exception in one agent → catch, log, restart that agent after delay
- Process crash → restart fresh, agents query API for current character state on boot

No silent failures. Every error logged with enough context to understand what happened.

## Testing

### What to test
- **Strategy logic** - pure functions, no API needed. Given state + board, assert correct goal.
- **Agent decisions** - mock API client, verify action sequences (move before gather, rest before fight).
- **API client** - mock HTTP responses, verify cooldown tracking, retry behavior, error handling.

### What not to test
- The Artifacts MMO API itself
- 5-agent integration tests

### How
- `bun test` - built-in, zero config
- Test files colocated: `agent.test.ts` next to `agent.ts`
- Strategy tests are highest value

### Smoke testing
- Run single agent against real API with verbose logging
- Verify one full cycle: pick goal → move → act → deposit → next goal
- Then boot all 5

## Data Flow

```
Boot
 │
 ├─ Load config + .env
 ├─ Initialize API client
 ├─ Initialize shared board
 ├─ For each character:
 │   ├─ Fetch current state from API
 │   ├─ Write initial state to board
 │   └─ Start agent loop
 │
Agent Loop (per character)
 │
 ├─ Read own state + board
 ├─ Strategy returns a Goal
 ├─ Agent resolves Goal into action steps
 ├─ Execute action via API client
 ├─ Update own state from API response
 ├─ Write updated state to board
 ├─ Log decision with snapshots
 ├─ Wait for cooldown
 └─ Repeat
```
