import entry from "../../skills/farming/SKILL.md?raw";
import overview from "../../skills/farming/references/overview.md?raw";
import operations from "../../skills/farming/references/operations.md?raw";
import stateAndUnits from "../../skills/farming/references/state-and-units.md?raw";
import verification from "../../skills/farming/references/verification.md?raw";

/** Top-level Skill source; the application registers it so its description reaches the request. */
export const farmingSkill = entry;
export const farmingSkillDocuments = Object.entries({
  overview,
  operations,
  "state-and-units": stateAndUnits,
  verification
}).map(([name, content]) => ({ path: `skills/farming/references/${name}.md`, content }));
