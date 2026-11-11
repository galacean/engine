import { SEED_WORLD_RUNTIME_CONTRACTS } from "../tools/runtime-tools.ts";
import { SEED_WORLD_PARAMETER_CONTRACTS } from "../tools/parameter-tools.ts";
import { SEED_WORLD_ANIMAL_CONTRACTS } from "../tools/animal-tools.ts";
import { SEED_WORLD_PLANT_MATERIAL_CONTRACTS } from "../tools/plant-material-tools.ts";
import {
  type SeedWorldApiContract
} from "./SeedWorldApiContract.ts";
import { SEED_WORLD_ATMOSPHERE_CONTRACTS } from "../tools/celestial-tools.ts";
import {
  SEED_WORLD_TERRAIN_CONTRACTS,
  SEED_WORLD_VEGETATION_CONTRACTS
} from "../tools/landscape-tools.ts";
import { SEED_WORLD_SPATIAL_CONTRACTS, SEED_WORLD_WORLD_CONTRACTS } from "../tools/spatial-tools.ts";
import { SEED_WORLD_TIME_CONTRACTS } from "../tools/time-tools.ts";
import { SEED_WORLD_BUILDING_CONTRACTS } from "../tools/building-tools.ts";


export const SEED_WORLD_API_CONTRACTS = Object.freeze([
  ...SEED_WORLD_WORLD_CONTRACTS,
  ...SEED_WORLD_RUNTIME_CONTRACTS,
  ...SEED_WORLD_SPATIAL_CONTRACTS,
  ...SEED_WORLD_TIME_CONTRACTS,
  ...SEED_WORLD_BUILDING_CONTRACTS,
  ...SEED_WORLD_ATMOSPHERE_CONTRACTS,
  ...SEED_WORLD_TERRAIN_CONTRACTS,
  ...SEED_WORLD_VEGETATION_CONTRACTS,
  ...SEED_WORLD_PARAMETER_CONTRACTS,
  ...SEED_WORLD_PLANT_MATERIAL_CONTRACTS,
  ...SEED_WORLD_ANIMAL_CONTRACTS
] as const satisfies readonly SeedWorldApiContract[]);

export const SEED_WORLD_API_NAMES = Object.freeze(SEED_WORLD_API_CONTRACTS.map(({ name }) => name));

assertContractRegistry();

function assertContractRegistry(): void {
  const names = new Set<string>();
  for (const contract of SEED_WORLD_API_CONTRACTS) {
    if (names.has(contract.name)) throw new Error(`Duplicate Seed World API contract '${contract.name}'`);
    names.add(contract.name);
  }
}
