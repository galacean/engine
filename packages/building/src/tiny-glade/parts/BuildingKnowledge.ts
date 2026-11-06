import entry from "./skill/SKILL.md?raw";
import planning from "./skill/references/planning.md?raw";
import foundation from "./skill/references/foundation.md?raw";
import structure from "./skill/references/structure.md?raw";
import roof from "./skill/references/roof.md?raw";
import wall from "./skill/references/wall.md?raw";
import connections from "./skill/references/connections.md?raw";
import existingHouse from "./skill/references/existing-house.md?raw";

/** Published as discoverable project knowledge, not appended to the system prompt. */
export const buildingPartKnowledge = [
  { path: "knowledge/building/SKILL.md", content: entry },
  ...Object.entries({ planning, foundation, structure, roof, wall, connections, "existing-house": existingHouse }).map(
    ([name, content]) => ({ path: `knowledge/building/references/${name}.md`, content })
  )
];
