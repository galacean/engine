import type { AnimalCommand } from "./AnimalTypes";

/** Validate the same command boundary used by local controls and future AI tools. */
export function isAnimalCommand(value: unknown): value is AnimalCommand {
  if (!value || typeof value !== "object") return false;
  const input = value as Record<string, unknown>;
  if (typeof input.requestId !== "string" || !input.requestId.trim() || input.requestId.length > 120) return false;
  switch (input.action) {
    case "summon":
      return input.entry === "sky" || input.entry === "ground";
    case "come":
      return input.greeting === undefined || input.greeting === "prank" || input.greeting === "gentle";
    case "dismount":
    case "dismiss":
      return true;
    case "behavior":
      return ["free", "stay", "follow"].includes(input.behavior as string);
    case "temperament":
      return ["cheeky", "gentle"].includes(input.temperament as string);
    case "gait":
      return input.gait === "walk" || input.gait === "gallop";
    default:
      return false;
  }
}
