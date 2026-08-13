import { readFileSync } from "node:fs";

function loadPromptFile(fileName: string): string {
  const fileUrl = new URL(`../prompts/${fileName}`, import.meta.url);
  let content: string;

  try {
    content = readFileSync(fileUrl, "utf8").trim();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load system prompt ${fileUrl.pathname}: ${detail}`, {
      cause: error,
    });
  }

  if (!content) {
    throw new Error(`System prompt file is empty: ${fileUrl.pathname}`);
  }

  return content;
}

export const SHARED_CORE_PROMPT = loadPromptFile("shared-core.md");
export const SERVER_PLANNER_PROMPT = loadPromptFile("server-planner.md");
export const TEMPLATE_AUTHORING_PROMPT = loadPromptFile("template-authoring.md");
