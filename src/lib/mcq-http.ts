import type { McqChoiceInput, McqInput } from "@/lib/services/mcq-service";

export function parseMcqInput(
  body: Record<string, unknown>,
): McqInput | null {
  const name = typeof body.name === "string" ? body.name : "";
  const description =
    typeof body.description === "string" ? body.description : "";

  if (!Array.isArray(body.choices)) {
    return null;
  }

  const choices: McqChoiceInput[] = [];
  for (const item of body.choices) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return null;
    }
    const row = item as Record<string, unknown>;
    if (typeof row.label !== "string") {
      return null;
    }
    if (typeof row.isCorrect !== "boolean") {
      return null;
    }
    choices.push({ label: row.label, isCorrect: row.isCorrect });
  }

  return { name, description, choices };
}
