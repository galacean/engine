import { placeRoofSpire } from "../algorithms/RoofSpire";
import { profiledDormerCourses } from "../algorithms/ProfiledDormerCourses";
import { buildingPlacementAlgorithms } from "../BuildingAlgorithms";
import { buildingConnectionRules, wallRoofJoint, foundationContact, opening, mount } from "./BuildingDesignRules";
import type { BuildingDraft } from "./BuildingDraft";
import { profilePlacementAlgorithms } from "./ProfilePlacementAlgorithms";
import { mountAttachment } from "../algorithms/MountAttachment";
import { cottageDormerCourses } from "../algorithms/CottageDormerCourses";

// These exact implementations are bundled in both the main and Worker entries.
// A matching name alone never certifies that a live function exists in a Worker.
const placements = new Map([
  ...profilePlacementAlgorithms,
  ["mountAttachment", mountAttachment],
  ["cottageDormerCourses", cottageDormerCourses],
  ["profiledDormerCourses", profiledDormerCourses],
  ["placeRoofSpire", placeRoofSpire]
]);
const connections = new Map([
  ["wallRoofJoint", wallRoofJoint],
  ["foundationContact", foundationContact],
  ["opening", opening],
  ["mount", mount]
]);

/** Select an execution realm before compilation, never retry a failed Worker
 * task locally. Functions registered by live scripts are not transferable. */
export function buildingWorkerAlgorithmIssue(draft: BuildingDraft): string | undefined {
  for (const relation of draft.relations)
    if (
      !connections.has(relation.rule) ||
      connections.get(relation.rule) !== buildingConnectionRules.resolve(relation.rule)
    )
      return "Connection algorithm is not bundled for Worker execution: " + relation.rule;
  for (const part of draft.parts) {
    const algorithms = [part.algorithm.type];
    if (part.support.generator === "attachmentMount" && part.params.roofAlgorithm !== undefined)
      algorithms.push(part.params.roofAlgorithm);
    if (part.support.generator === "roofProfile" && part.params.spireAlgorithm !== undefined)
      algorithms.push(part.params.spireAlgorithm);
    for (const algorithm of algorithms)
      if (
        typeof algorithm !== "string" ||
        !placements.has(algorithm) ||
        placements.get(algorithm) !== buildingPlacementAlgorithms.resolve(algorithm)
      )
        return "Placement algorithm is not bundled for Worker execution: " + algorithm;
  }
}
