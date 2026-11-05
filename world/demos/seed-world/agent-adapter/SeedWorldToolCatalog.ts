import { createSeedWorldRuntimeTools } from "./tools/runtime-tools.ts";
import { createSeedWorldParameterTools } from "./tools/parameter-tools.ts";
import { createSeedWorldAnimalTools } from "./tools/animal-tools.ts";
import type { AgentTool } from "@galacean/engine-ai-chat/ai-chat/index";
import type { SeedWorldAgentApplication } from "./SeedWorldAgentApplication.ts";
import { createSeedWorldCelestialTools } from "./tools/celestial-tools.ts";
import { createSeedWorldLandscapeTools } from "./tools/landscape-tools.ts";
import { createSeedWorldKernelTools, createSeedWorldSpatialTools } from "./tools/spatial-tools.ts";
import { createSeedWorldTimeTools } from "./tools/time-tools.ts";


export function createSeedWorldTools(application: SeedWorldAgentApplication): readonly AgentTool[] {
  const tools = [
    ...createSeedWorldKernelTools(application),
    ...createSeedWorldRuntimeTools(application),
    ...createSeedWorldSpatialTools(application),
    ...createSeedWorldTimeTools(application),
    ...createSeedWorldCelestialTools(application),
    ...createSeedWorldLandscapeTools(application),
    ...createSeedWorldParameterTools(application, application.parameterReceipts),
    ...createSeedWorldAnimalTools(application.animals, position => application.viewerRelationFor(position))
  ];
  return tools;
}
