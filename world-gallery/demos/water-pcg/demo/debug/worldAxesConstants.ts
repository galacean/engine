import type { WorldAxisSpec, WorldAxisVectorTuple } from "./worldAxesTypes";

export enum WorldAxisName {
  X = "x",
  Y = "y",
  Z = "z"
}

export const WORLD_AXIS_HALF_LENGTH = 1000;
export const WORLD_AXIS_RENDER_PRIORITY = 1000;

export const WORLD_AXIS_ORIGIN: WorldAxisVectorTuple = [0, 0, 0];

export const WORLD_AXIS_SHADER_NAME = "AIWorld/DebugAxisLine";
export const WORLD_AXIS_SHADER_PROPERTY = {
  baseColor: "material_BaseColor"
} as const;

export const WORLD_AXIS_SPECS: readonly WorldAxisSpec[] = [
  {
    name: WorldAxisName.X,
    direction: [1, 0, 0],
    color: [1, 0.28, 0.22, 1]
  },
  {
    name: WorldAxisName.Y,
    direction: [0, 1, 0],
    color: [0.2, 0.9, 0.36, 1]
  },
  {
    name: WorldAxisName.Z,
    direction: [0, 0, 1],
    color: [0.18, 0.5, 1, 1]
  }
] as const;
