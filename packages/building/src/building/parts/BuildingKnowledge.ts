import entry from "../../skills/building/SKILL.md?raw";
import planning from "../../skills/building/references/planning.md?raw";
import foundation from "../../skills/building/references/foundation.md?raw";
import structure from "../../skills/building/references/structure.md?raw";
import roof from "../../skills/building/references/roof.md?raw";
import wall from "../../skills/building/references/wall.md?raw";
import connections from "../../skills/building/references/connections.md?raw";

/** Top-level Skill source; the application registers it so its description reaches the request. */
export const buildingPartSkill = entry;
export const buildingPartDocuments = Object.entries({
  planning,
  foundation,
  structure,
  roof,
  wall,
  connections
}).map(([name, content]) => ({ path: `skills/building/references/${name}.md`, content }));
