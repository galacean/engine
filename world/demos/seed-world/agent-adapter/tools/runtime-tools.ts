import { RUNTIME_INSPECTION_CONTRACTS } from "@galacean/engine-runtime-editor/runtime-inspection/runtime-inspection-contracts";
import type { SeedWorldAgentApplication } from "../SeedWorldAgentApplication.ts";
import { defineSeedWorldApiContract } from "../contracts/SeedWorldApiContract.ts";
import { defineSeedWorldTool } from "./define-seed-world-tool.ts";

const inspect = defineSeedWorldApiContract({ ...RUNTIME_INSPECTION_CONTRACTS[0], domain: "world" });
const children = defineSeedWorldApiContract({ ...RUNTIME_INSPECTION_CONTRACTS[1], domain: "world" });
const query = defineSeedWorldApiContract({ ...RUNTIME_INSPECTION_CONTRACTS[2], domain: "world" });
const read = defineSeedWorldApiContract({ ...RUNTIME_INSPECTION_CONTRACTS[3], domain: "world" });
export const SEED_WORLD_RUNTIME_CONTRACTS = [inspect, children, query, read] as const;

export function createSeedWorldRuntimeTools(application: SeedWorldAgentApplication) {
  return [
    defineSeedWorldTool(inspect, {
      execute: (input) => application.requireRuntimeInspection().inspectEntity(input.id)
    }),
    defineSeedWorldTool(children, {
      execute: (input) =>
        application
          .requireRuntimeInspection()
          .children(input.entityId, input.offset, input.limit)
    }),
    defineSeedWorldTool(query, {
      execute: (input) =>
        application.requireRuntimeInspection().queryComponents(input.entityId, input.type)
    }),
    defineSeedWorldTool(read, {
      execute: (input) => application.requireRuntimeInspection().readComponent(input.id, input.fields)
    })
  ];
}
