# Artifacts MMO Bot - Product Requirements Document

## What We're Building

An automation bot that controls 5 Artifacts MMO characters. The bot runs as a single long-lived Bun process. Each character operates as an independent agent with a self-directing strategy, sharing a read-only state board for coordination.

The goal: all 5 characters eventually max all skills with minimal manual configuration.

## API

Source of truth: https://api.artifactsmmo.com/openapi.json (OpenAPI 3.1.0, v6.1.0)

Key capabilities:
- Movement (x/y coordinates, map transitions)
- Combat (single-character fights, multi-character boss fights up to 3)
- Gathering (resource nodes, skill-gated)
- Crafting (workshops, recipe-based)
- Rest (HP recovery)
- Equipment (equip, unequip, use consumables)
- Trading (Grand Exchange with 3% tax, NPC buy/sell)
- Banking (deposit/withdraw items and gold, shared across characters)
- Tasks (complete for task coins, exchange for exclusive rewards)
- Character transfers (give gold/items between own characters)

Key constraints:
- Cooldown after every action (varies by action type)
- Inventory size limits per character
- Skill level requirements for gathering and crafting
- Map access requirements (gold, items, or conditions)
- Max 5 characters per account

## Characters

All 5 characters are independent agents. No fixed roles. Each character's strategy is self-directing - by default, "max all skills" using lowest-skill-first balancing.

Characters coordinate passively through a shared state board:
- Avoid duplicate work (two characters don't mine the same resource)
- Bank awareness (gather what's needed, not what's stockpiled)
- No direct messaging or commands between characters

## Configuration

Minimal by design:
- `.env` - API token
- `config.ts` - character names and directives (defaults to `max_all_skills`)

The bot should require near-zero manual configuration. Characters auto-decide what to work on, when to rest, when to deposit, and what to craft.

## Phases

### Phase 1: Core Bot Engine (current)
- API client with auth, cooldown tracking, retries
- Character agents with action loops
- Shared state board
- `max_all_skills` strategy
- Per-character logging with decision snapshots
- Error handling (request, action, and process level)

### Phase 2: Observability Dashboard
- Next.js frontend to watch characters in real-time
- View logs, current goals, board state
- Manual override controls (pause agent, force a goal)

### Phase 3: Additional Strategies
- `make_gold` - maximize profit
- `task_runner` - prioritize task completions
- `boss_hunter` - multi-character boss coordination
- `smart_leveler` - optimized leveling with XP curves and gear breakpoints
- `arbitrage` - Grand Exchange price flipping
- `achievement_hunter` - completionist mode

### Phase 4: Maintenance
- OpenAPI spec update detection workflow
- Strategy performance metrics
- Character progression tracking over time

## Success Criteria

- All 5 characters run autonomously with no intervention
- Characters make reasonable skill-leveling decisions on their own
- No silent failures - every error is logged with context
- Single character issues don't crash other agents
- Adding a new strategy requires only a new file in `src/strategy/`
