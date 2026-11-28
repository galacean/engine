import type { WorldLayoutContext } from "./WorldLayoutPlanner";
import type { PlanPoint, PlanRock } from "./IslandPlanModel";
import { unionRectangles, type ShapeBlock } from "./ComposedShape";
import { envelope } from "./IslandPlanAtoms";
import { contains, overlap, ringArea } from "./WorldPlanningGeometry";
import { createPlanningRingQuery } from "./WorldPlanningTerrain";

const clamp = (n: number | undefined) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n!)) : 0.5);
const polygon = (b: ShapeBlock) => envelope({ x: b.x, z: b.z }, b.width, b.length, (b.yaw * Math.PI) / 180);
/** Compose planar canyon masses and an independent water editing domain.
 * Component boxes describe planning volumes, not a one-box-to-one-asset assignment.
 * @param c Transaction owning the coastline and semantic controls.
 */
export function planCanyonFootprints(c: WorldLayoutContext): void {
  const id = "valley-main",
    edit = c.edits[id],
    density = clamp(edit?.density),
    openness = clamp(edit?.openness),
    stagger = clamp(edit?.stagger);
  const land = createPlanningRingQuery(c.plan.land);
  // Fit a control-independent envelope, keeping subsequent edits anchored. The
  // interior is deliberately smaller than this search envelope, even at 0/1 extremes.
  let placement: { x: number; z: number; span: number; angle: number } | undefined;
  for (const span of [760, 640, 520, 400]) {
    const candidates = [];
    for (let z = 320; z < 1800; z += 100)
      for (let x = 320; x < 1800; x += 100)
        for (const turn of [0, 0.32, -0.32]) {
          const angle = c.frame.angle + turn,
            box = envelope({ x, z }, span + 180, 540, angle);
          if (!box.every((p, i) => land.containsSegment(p, box[(i + 1) % 4], 0))) continue;
          candidates.push({ x, z, span, angle, score: c.random(`canyon-fit-${x}-${z}-${turn}`) });
        }
    placement = candidates.sort((a, b) => b.score - a.score)[0];
    if (placement) break;
  }
  if (!placement) {
    c.notes.push("陆域内没有可容纳峡谷组合的空间");
    return;
  }
  const { span, angle } = placement;
  const point = (x: number, z: number): PlanPoint => ({
    x: placement!.x + x * Math.cos(angle) - z * Math.sin(angle),
    z: placement!.z + x * Math.sin(angle) + z * Math.cos(angle)
  });
  // Unequal segments express opening, staggered narrowing, turn and release.
  const stations = [0, 0.2, 0.39, 0.55, 0.76, 1],
    lateral = [0, -0.2, -1, 0.65, 0.85, 0.2];
  const axis = stations.map((t, i) => point((t - 0.5) * span, lateral[i] * (12 + 30 * stagger)));
  const labels = ["开阔入口", "错位收束", "转折窄口", "转折展开", "开阔出口"];
  const widths = [118, 82, 54, 100, 132].map((w) => w * (0.8 + 0.65 * openness));
  const segment = (a: PlanPoint, b: PlanPoint, width: number, key: string): ShapeBlock => ({
    id: key,
    x: (a.x + b.x) / 2,
    z: (a.z + b.z) / 2,
    width: Math.hypot(b.x - a.x, b.z - a.z) + width * 0.36,
    length: width,
    yaw: (Math.atan2(b.z - a.z, b.x - a.x) * 180) / Math.PI
  });
  const waterBlocks = axis.slice(1).map((b, i) => segment(axis[i], b, widths[i], `canyon-water-${i}`));
  // Node boxes guarantee an area overlap at bends; corner contact is insufficient.
  for (let i = 1; i < axis.length - 1; i++)
    waterBlocks.push({
      id: `canyon-water-join-${i}`,
      x: axis[i].x,
      z: axis[i].z,
      width: Math.max(widths[i - 1], widths[i]) * 0.75,
      length: Math.max(widths[i - 1], widths[i]) * 0.75,
      yaw: waterBlocks[i].yaw
    });
  const waterRings = unionRectangles(waterBlocks);
  if (waterRings.length !== 1) return;
  const water = waterRings[0],
    banks: ShapeBlock[][] = [[], []];
  for (const [sideIndex, side] of [-1, 1].entries()) {
    for (let i = 0; i < axis.length - 1; i++) {
      const a = axis[i],
        b = axis[i + 1],
        theta = Math.atan2(b.z - a.z, b.x - a.x),
        n = { x: -Math.sin(theta) * side, z: Math.cos(theta) * side };
      const length = Math.hypot(b.x - a.x, b.z - a.z),
        depth = 30 + density * 42 + (sideIndex === 1 && i === 3 ? 24 : 0);
      const offset = widths[i] / 2 + depth / 2 + 22 + (i === 0 || i === 4 ? 20 * openness : 0);
      const shift = (sideIndex === 0 ? -1 : 1) * stagger * length * 0.16;
      const block: ShapeBlock = {
        id: `mountain-${sideIndex}-body-${i}`,
        x: (a.x + b.x) / 2 + n.x * offset + Math.cos(theta) * shift,
        z: (a.z + b.z) / 2 + n.z * offset + Math.sin(theta) * shift,
        width: length * (0.92 + 0.2 * density),
        length: depth,
        yaw: ((theta + side * (i % 2 ? 0.09 : -0.06) * stagger) * 180) / Math.PI
      };
      // Retreat along the outward normal to preserve the entire water authorization domain.
      for (let attempt = 0; attempt < 12 && overlap(polygon(block), water); attempt++) {
        block.x += n.x * 6;
        block.z += n.z * 6;
      }
      if (!contains(c.plan.land, polygon(block)) || overlap(polygon(block), water)) return;
      banks[sideIndex].push(block);
      if (i === 0 || i === 3) {
        const shoulder = {
          ...block,
          id: `mountain-${sideIndex}-shoulder-${i}`,
          x: block.x + n.x * (depth * 0.45),
          z: block.z + n.z * (depth * 0.45),
          width: block.width * 0.63,
          length: depth * (0.7 + 0.25 * density),
          yaw: block.yaw + side * (24 + stagger * 16)
        };
        if (contains(c.plan.land, polygon(shoulder)) && !overlap(polygon(shoulder), water))
          banks[sideIndex].push(shoulder);
      }
    }
  }
  // A semantic domain includes the empty bankside space; it is not solid occupancy.
  const domainBlocks = axis.slice(1).map((b, i) => segment(axis[i], b, widths[i] + 220, `canyon-domain-${i}`));
  const domainRings = unionRectangles([...domainBlocks, ...banks.flat()]);
  if (domainRings.length !== 1 || !contains(c.plan.land, domainRings[0])) return;
  const sections = waterBlocks
    .slice(0, 5)
    .map((b, i) => ({ label: labels[i], center: { x: b.x, z: b.z }, width: widths[i] }));
  const waterId = "canyon-water-domain";
  c.plan.structures = [
    {
      id,
      kind: "canyon",
      label: "峡谷 · 平面组合",
      axis,
      outlet: axis.at(-1)!,
      outline: domainRings[0],
      floor: water,
      floorWidth: Math.min(...widths),
      bankWidth: 30 + density * 42,
      relief: 0,
      sourceHeight: 0,
      outletHeight: 0,
      bankIds: ["mountain-0", "mountain-1"],
      waterDomain: { id: waterId, outline: water, blocks: waterBlocks },
      sections
    }
  ];
  for (const [i, blocks] of banks.entries()) {
    const groupId = `mountain-${i}`,
      rings = unionRectangles(blocks),
      rocks: PlanRock[] = blocks.map((b) => ({
        id: b.id,
        groupId,
        center: { x: b.x, z: b.z },
        width: b.width,
        depth: b.length,
        yaw: (b.yaw * Math.PI) / 180,
        height: 60,
        role: b.id.includes("shoulder") ? "shoulder" : "wall",
        obb: polygon(b),
        outline: polygon(b)
      }));
    const label = i === 0 ? "峡谷左岸 · 长壁与山肩" : "峡谷右岸 · 错位与展开";
    c.plan.rocks.push(...rocks);
    c.plan.mountains.push({
      id: groupId,
      label,
      outline: rings[0],
      outlines: rings,
      semanticOutlines: rings,
      densityOutlines: rings,
      rockIds: rocks.map((r) => r.id)
    });
    c.plan.shapeRecipes!.push({ id: groupId, label, rounding: 0, blocks });
    c.plan.planning!.modules.push({
      id: groupId,
      kind: "mountain",
      outline: rings[0],
      outlines: rings,
      dependencies: [id],
      requested: {},
      resolved: { rockCount: rocks.length, solidArea: rings.reduce((s, r) => s + ringArea(r), 0) }
    });
  }
  c.plan.shapeRecipes!.push({ id: waterId, label: "水系统可编辑域", rounding: 0, blocks: waterBlocks });
  c.plan.planning!.modules.push({
    id,
    kind: "valley",
    outline: domainRings[0],
    dependencies: ["land-main", ...c.plan.structures[0].bankIds, waterId],
    requested: { density, openness, stagger },
    resolved: {
      width: Math.min(...widths),
      maxFloorWidth: Math.max(...widths),
      area: ringArea(domainRings[0]),
      waterDomainArea: ringArea(water),
      sectionCount: 5
    }
  });
  c.plan.planning!.modules.push({
    id: waterId,
    kind: "water",
    outline: water,
    dependencies: [id],
    requested: {},
    resolved: { area: ringArea(water) }
  });
  c.plan.planning!.reservations.push({
    id: waterId,
    ownerId: waterId,
    kind: "valley",
    outline: water,
    relatedIds: [id]
  });
  c.plan.planning!.relations.push({
    id: "canyon-water-authorization",
    kind: "contains",
    owners: [id, waterId],
    ports: [],
    required: true
  });
}
