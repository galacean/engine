import type { IslandPlan, PlanPoint, PlanCourtyard } from "./IslandPlanModel";
import {
  createPlanningData,
  type SemanticParameters,
  type SemanticEdit,
  type SemanticResult
} from "./WorldPlanningContract";
import { createPlanningGroundSampler } from "./WorldPlanningTerrain";
import { ribbonOutline } from "./WorldRibbon";

const rectangle = (x: number, z: number, w: number, d: number): PlanPoint[] => [
  { x: x - w / 2, z: z - d / 2 },
  { x: x + w / 2, z: z - d / 2 },
  { x: x + w / 2, z: z + d / 2 },
  { x: x - w / 2, z: z + d / 2 }
];
/** Generate one metre-scale village experiment. Seed changes house dimensions/offsets inside disjoint parcels.
 * This fixture exercises reusable parcel data through the production planning views, not a world generator.
 */
export function generateVillageStudy(
  parameters: SemanticParameters,
  edits: Record<string, SemanticEdit> = {}
): SemanticResult {
  const data = createPlanningData();
  data.status = "valid";
  data.auditMode = "paused";
  const plan: IslandPlan = {
    villageStudy: true,
    landformStudy: true,
    mode: "base-map",
    parameters: { width: 160, depth: 160, seed: parameters.seed, valleyWidth: 0, riverWidth: 0, mountainHeight: 0 },
    land: rectangle(80, 80, 160, 160),
    islands: [],
    rocks: [],
    mountains: [],
    waters: [],
    routes: [],
    places: [],
    bridges: [],
    sights: [],
    spawn: { x: 80, z: 128 },
    prompt: "单村庄院落实验：院门、建筑入口、泥土道路与院内草地",
    regions: [],
    buildings: [],
    ridges: [],
    supports: [],
    slopes: [],
    raster: { heightSamples: 0, alphaSamples: 0, spacing: 1 },
    planning: data,
    courtyards: []
  };
  const ground = createPlanningGroundSampler(plan),
    outline = rectangle(80, 80, 70, 92);
  plan.regions.push({ id: "village-0", label: "院落村庄", kind: "village", outline, navigationArea: outline });
  data.modules.push({
    id: "village-0",
    kind: "village",
    outline,
    dependencies: [],
    requested: {},
    resolved: { buildings: 6, area: 70 * 92 }
  });
  plan.routes.push({
    id: "village-street",
    label: "村庄泥土道路",
    from: "south",
    to: "north",
    kind: "main",
    points: [
      { x: 80, z: 132 },
      { x: 80, z: 28 }
    ],
    width: 6
  });
  let state = parameters.seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let row = 0; row < 3; row++)
    for (const side of [-1, 1]) {
      const index = row * 2 + (side === 1 ? 1 : 0),
        id = `courtyard-${index}`,
        buildingId = `${id}-building`,
        x = 80 + side * 19,
        z = 48 + row * 32,
        w = 32,
        d = 28;
      const gate = { x: x - (side * w) / 2, z },
        buildingCenter = { x: x + side * 3, z: z + (random() - 0.5) * 6 },
        bw = 9 + random() * 3,
        bd = 8 + random() * 3;
      const door = { x: buildingCenter.x - (side * bw) / 2, z: buildingCenter.z };
      const yard: PlanCourtyard = {
        id,
        regionId: "village-0",
        buildingId,
        outline: rectangle(x, z, w, d),
        gate,
        door,
        gateWidth: 3,
        fences: [],
        path: {
          id: `${id}-access`,
          label: "院内泥土道路",
          from: id,
          to: buildingId,
          kind: "main",
          points: [gate, door],
          width: 2
        }
      };
      const fence = (cx: number, cz: number, sx: number, sz: number) => {
        // Short modules follow FBM without a long fence floating above the ground.
        const count = Math.ceil(Math.max(sx, sz) / 2);
        for (let j = 0; j < count; j++) {
          const center = {
            x: cx + (sx > sz ? ((j + 0.5) / count - 0.5) * sx : 0),
            z: cz + (sz >= sx ? ((j + 0.5) / count - 0.5) * sz : 0)
          };
          yard.fences.push({
            id: `${id}-fence-${yard.fences.length}`,
            label: "院落围栏",
            center,
            sizeX: sx > sz ? sx / count : sx,
            sizeZ: sz >= sx ? sz / count : sz,
            sizeY: 1.2,
            yaw: 0,
            elevation: ground(center) - 0.12,
            collision: true,
            occlusion: true
          });
        }
      };
      fence(x, z - d / 2, w, 0.25);
      fence(x, z + d / 2, w, 0.25);
      fence(x + (side * w) / 2, z, 0.25, d);
      const segment = (d - yard.gateWidth) / 2;
      fence(gate.x, z - (d + yard.gateWidth) / 4, 0.25, segment);
      fence(gate.x, z + (d + yard.gateWidth) / 4, 0.25, segment);
      plan.courtyards!.push(yard);
      plan.buildings.push({
        id: buildingId,
        regionId: id,
        center: buildingCenter,
        width: bw,
        depth: bd,
        height: 5 + random() * 2,
        yaw: 0,
        outline: rectangle(buildingCenter.x, buildingCenter.z, bw, bd),
        baseHeight: ground(buildingCenter)
      });
      plan.routes.push({
        id: `${id}-street-link`,
        label: "院门接入村路",
        from: "village-street",
        to: id,
        kind: "main",
        points: [{ x: 80, z }, gate],
        width: 3
      });
      data.modules.push({
        id,
        kind: "village",
        outline: yard.outline,
        dependencies: ["village-0"],
        requested: {},
        resolved: { area: w * d, width: w, height: 1.2, buildings: 1 }
      });
      data.ports.push(
        { id: `${id}-gate`, ownerId: id, kind: "entrance", position: gate, height: ground(gate), width: 3 },
        { id: `${id}-door`, ownerId: id, kind: "landing", position: door, height: ground(door), width: 2 }
      );
    }
  for (const route of [...plan.routes, ...plan.courtyards!.map((c) => c.path)])
    route.outline = ribbonOutline(route.points, [route.width]);
  return {
    recipe: { version: 2, parameters, edits, study: "village" },
    plan,
    accepted: true,
    checks: [],
    changedIds: ["village-0"],
    notes: ["单村庄尺寸实验；六处中性院落，不包含种植、道具或建造布置"]
  };
}
