# Crafting System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable characters to craft items using bank materials, unlocking frozen crafting skills and producing gear/intermediates.

**Architecture:** Strategy checks bank for craftable recipes before emitting craft goals. Agent executes withdraw→move→craft atomically. Gathering skills dual-purpose: refine when bank has raw materials, gather otherwise.

**Tech Stack:** Bun, TypeScript, bun:test

---

### Story 1: GameData — getCraftableItems method

**Files:**
- Modify: `src/agent/game-data.ts`
- Test: `src/agent/game-data.test.ts`

Add a method that returns items craftable for a given skill/level with available bank materials.

### Story 2: Strategy — crafting skill support

**Files:**
- Modify: `src/strategy/max-all-skills.ts`
- Test: `src/strategy/max-all-skills.test.ts`

When a crafting skill (weaponcrafting, gearcrafting, jewelrycrafting, cooking) is lowest, check bank for highest-level craftable recipe and emit craft goal.

### Story 3: Strategy — dual-purpose gathering skills

**Files:**
- Modify: `src/strategy/max-all-skills.ts`
- Test: `src/strategy/max-all-skills.test.ts`

When a gathering skill (mining, woodcutting, alchemy) is the target, check if bank has enough raw materials to refine into intermediates. If yes, emit craft goal instead of gather.

### Story 4: Agent — enhance executeGoal("craft") with material withdrawal

**Files:**
- Modify: `src/agent/agent.ts`
- Test: `src/agent/agent.test.ts`

Before moving to workshop, move to bank and withdraw required materials. Full atomic flow: bank→withdraw→workshop→craft.
