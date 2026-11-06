import { buildingSupportAlgorithms, buildingPlacementAlgorithms } from "../BuildingAlgorithms";
import { BuildingPath, buildingPose } from "../BuildingLayout";
import type { BuildingBasePart, BuildingDraft } from "./BuildingDraft";
export interface StepsParameters {
  id: string;
  width: number;
  rise: number;
  run: number;
  count: number;
  position?: [number, number, number];
  seed?: number;
  unit?: BuildingBasePart["unit"];
}
/** Common step construction: a flight is a Path plus a step placement algorithm. */
export function buildSteps(p: StepsParameters): BuildingBasePart[] {
  if (
    !Number.isSafeInteger(p.count) ||
    p.count < 1 ||
    p.count > 1000 ||
    ![p.width, p.rise, p.run].every((n) => Number.isFinite(n) && n > 0)
  )
    throw Error("Invalid step dimensions or count");
  return [
    {
      id: p.id + "-steps",
      group: p.id,
      type: "steps",
      support: {
        generator: "stepFlight",
        params: { position: p.position ?? [0, 0, 0], rise: p.rise, run: p.run, count: p.count }
      },
      algorithm: { type: "stepCourses" },
      unit: p.unit ?? "brick",
      params: { width: p.width, rise: p.rise, run: p.run, count: p.count, seed: p.seed ?? 17 }
    }
  ];
}
buildingSupportAlgorithms.register("stepFlight", (p) => {
  const [x, y, z] = p.position;
  return {
    type: "path",
    path: new BuildingPath([
      [x, y, z],
      [x, y + p.rise * p.count, z + p.run * p.count]
    ])
  };
});
buildingPlacementAlgorithms.register("stepCourses", (support, p) => {
  if (support.type !== "path") throw Error("Steps require Path support");
  const origin = support.path.sample(0).position;
  return Array.from({ length: p.count }, (_, i) => ({
    ...buildingPose(
      [origin[0], origin[1] + (p.rise * (i + 1)) / 2, origin[2] + p.run * (i + 0.5)],
      [1, 0, 0],
      [0, 1, 0]
    ),
    scale: [p.width, p.rise * (i + 1), p.run] as [number, number, number]
  }));
});
export function buildEuropeanSteps(p: StepsParameters): BuildingDraft {
  return {
    groups: [{ id: p.id, seed: p.seed ?? 17, wallColor: 0, woodColor: 0 }],
    parts: buildSteps(p),
    relations: []
  };
}
