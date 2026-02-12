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

  return {
    apiToken,
    characters: [],
  };
}
