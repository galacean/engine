import { generatePlanningLandform } from "../landforms/PlanningLandform";
import { compileRockAtom } from "../landforms/RockAtoms";
import { type LandformKind } from "../landforms/Landforms";
import { planningAtomCatalog } from "../landforms/InteractiveLandforms";
import type { WorldLayoutContext } from "./WorldLayoutPlanner";
import type { PlanPoint, PlanRock } from "./IslandPlanModel";
import { envelope } from "./IslandPlanAtoms";
import { contains, overlap, ringArea } from "./WorldPlanningGeometry";
import { ribbonOutline } from "./WorldRibbon";

const kinds: LandformKind[] = ["canyon", "cliff", "plateau", "peaks", "pass"];
const roles = {
  crown: "peak",
  wall: "wall",
  "buttress/shoulder": "shoulder",
  "terrace/cap": "terrace",
  skirt: "skirt"
} as const;
/** Place shared atlas compositions into the available mainland without changing their
 * metric proportions. Candidate search is bounded and independent of the seed value.
 * Local height/scale/heading edits retain their original placement reservation.
 * @param c Current planning transaction; only landform-owned records are appended.
 */
export function planStudyLandforms(
  c: Pick<WorldLayoutContext, "plan" | "edits" | "notes" | "random"> & {
    parameters: { seed: number };
    frame: { angle: number };
  },
  only?: ReadonlySet<string>
): void {
  const catalog = planningAtomCatalog(),
    occupied: PlanPoint[][] = [];
  // Existing offshore placement is retained, but its whiteboxes use the same atoms.
  const roleKinds = {
    peak: "crown",
    wall: "wall",
    shoulder: "buttress/shoulder",
    terrace: "terrace/cap",
    skirt: "skirt"
  } as const;
  for (const rock of c.plan.rocks)
    if (!rock.boxes)
      rock.boxes = compileRockAtom(
        {
          id: rock.id,
          kind: roleKinds[rock.role],
          x: rock.center.x,
          z: rock.center.z,
          baseY: rock.baseHeight ?? 0,
          yaw: rock.yaw,
          width: rock.width,
          depth: rock.depth,
          height: rock.height
        },
        catalog
      ).boxes;

  for (const kind of kinds) {
    if (only && !only.has(`landform-${kind}`)) continue;
    const id = `landform-${kind}`,
      edit = c.edits[id] ?? {},
      scale = edit.size ?? 1;
    const generated = generatePlanningLandform({
      type: edit.landformType ?? kind,
      seed: edit.variantSeed ?? c.parameters.seed,
      variation: edit.variation ?? 0.5
    });
    const form = generated.form,
      angle = c.frame.angle + (edit.direction ?? 0) * Math.PI;
    const cs = Math.cos(angle),
      sn = Math.sin(angle);
    const local = form.outlines.flat();
    const x0 = Math.min(...local.map((p) => p.x)),
      x1 = Math.max(...local.map((p) => p.x)),
      z0 = Math.min(...local.map((p) => p.z)),
      z1 = Math.max(...local.map((p) => p.z));
    const center = { x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
    // Reserve enough room for the supported local scaling range; no outer box is published.
    const w = (x1 - x0) * 2 + 30,
      d = (z1 - z0) * 2 + 30;
    let origin: PlanPoint | undefined = edit.placement?.origin;
    if (!origin) {
      const candidates: { point: PlanPoint; score: number }[] = [];
      for (let z = 180; z <= 1880; z += 80)
        for (let x = 180; x <= 1880; x += 80) candidates.push({ point: { x, z }, score: c.random(`${id}:${x}:${z}`) });
      // Same ranked winner as filtering every site first; stop after the best feasible site.
      origin = candidates
        .sort((a, b) => b.score - a.score)
        .find(({ point }) => {
          const box = envelope(point, w, d, c.frame.angle);
          return !occupied.some((other) => overlap(box, other)) && contains(c.plan.land, box);
        })?.point;
    }
    if (!origin) {
      c.notes.push(`${form.label}：当前陆域没有足够空间，未发布该地貌`);
      continue;
    }
    occupied.push(envelope(origin, w, d, c.frame.angle));
    const point = (p: PlanPoint): PlanPoint => ({
      x: origin!.x + ((p.x - center.x) * cs - (p.z - center.z) * sn) * scale,
      z: origin!.z + ((p.x - center.x) * sn + (p.z - center.z) * cs) * scale
    });
    const rings = form.outlines.map((r) => r.map(point));
    if (rings.some((r) => !contains(c.plan.land, r))) {
      throw new Error(`${form.label}调整后超出陆域，请减小范围或调整朝向`);
    }
    const rocks: PlanRock[] = form.atoms.map((a, i) => {
      const at = point({ x: a.x, z: a.z }),
        yaw = a.yaw + angle,
        rockId = `${id}-atom-${i}`;
      const boxes = a.boxes.map((b, j) => ({
        ...b,
        id: `${rockId}-${j}`,
        label: catalog[a.kind].label,
        center: point(b.center),
        yaw: b.yaw + angle,
        sizeX: b.sizeX * scale,
        sizeZ: b.sizeZ * scale,
        sizeY: b.sizeY * scale * (edit.height ?? 1),
        elevation: (b.elevation ?? 0) * scale * (edit.height ?? 1)
      }));
      const obb = envelope(at, a.width * scale, a.depth * scale, yaw);
      return {
        id: rockId,
        groupId: id,
        center: at,
        width: a.width * scale,
        depth: a.depth * scale,
        yaw,
        height: a.height * scale * (edit.height ?? 1),
        role: roles[a.kind as keyof typeof roles],
        baseHeight: 0,
        outline: obb,
        obb,
        boxes
      };
    });
    c.plan.rocks.push(...rocks);
    c.plan.mountains.push({
      id,
      semanticKind: form.kind,
      label: form.label,
      outline: rings[0],
      outlines: rings,
      semanticOutlines: rings,
      densityOutlines: rings,
      rockIds: rocks.map((r) => r.id)
    });
    c.plan.planning!.modules.push({
      id,
      kind: "mountain",
      outline: rings[0],
      outlines: rings,
      dependencies: ["land-main"],
      requested: { variation: edit.variation ?? 0.5, variantSeed: edit.variantSeed ?? c.parameters.seed },
      resolved: {
        ...generated.diagnostics,
        originX: origin.x,
        originZ: origin.z,
        area: rings.reduce((s, r) => s + ringArea(r), 0),
        height: Math.max(...rocks.map((r) => r.height)),
        rockCount: rocks.length,
        obbCount: rocks.reduce((s, r) => s + r.boxes!.length, 0)
      }
    });
    c.plan.shapeRecipes!.push({
      id,
      label: form.label,
      rounding: 0,
      blocks: rocks.flatMap((r) =>
        r.boxes!.map((b) => ({
          id: b.id,
          x: b.center.x,
          z: b.center.z,
          width: b.sizeX,
          length: b.sizeZ,
          yaw: (b.yaw * 180) / Math.PI
        }))
      )
    });
    if (form.kind === "canyon") {
      const axis = [form.passages[0].points[0], ...form.passages.map((p) => p.points.at(-1)!)].map(point);
      // The middle portion of each section is delegated to water; it is not a river mesh.
      const floor = ribbonOutline(axis, [Math.min(...form.passages.map((p) => p.width)) * scale * 0.5]);
      const waterId = `${id}-water-domain`;
      c.plan.structures = [
        ...(c.plan.structures ?? []),
        {
          id: `${id}-structure`,
          kind: "canyon",
          label: "峡谷空间顺序",
          axis,
          outlet: axis.at(-1)!,
          outline: floor,
          floor,
          floorWidth: Math.min(...form.passages.map((p) => p.width)) * scale,
          bankWidth: 0,
          relief: 0,
          sourceHeight: 0,
          outletHeight: 0,
          bankIds: [id],
          waterDomain: { id: waterId, outline: floor, blocks: [] },
          sections: form.passages.map((p) => ({ label: p.label, center: point(p.points[0]), width: p.width * scale }))
        }
      ];
      c.plan.planning!.modules.push({
        id: waterId,
        kind: "water",
        outline: floor,
        dependencies: [id],
        requested: {},
        resolved: { area: ringArea(floor) }
      });
    }
  }
}
