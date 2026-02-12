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
