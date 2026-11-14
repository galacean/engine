import { createPlanningGroundSampler } from "./WorldPlanningTerrain";
import type { IslandPlan, PlanPoint } from "./IslandPlanModel";
import type { V2Box } from "../spatial/V2Model.ts";

/** Orthographic elevation angle; map X remains horizontal and world Y is vertical. */
export const PLAN_TILT = Math.SQRT1_2;
/** Project a world-space position into shared plan-view SVG coordinates. */
export function projectPlanningPoint(p: PlanPoint, height = 0, oblique = false): PlanPoint {
  return { x: p.x, z: oblique ? (p.z - height) * PLAN_TILT : p.z };
}
const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
const labels = { peak: "峰体", wall: "岩壁", shoulder: "山肩", terrace: "台地", skirt: "裙边" };
/** Render the actual constituent OBB faces with camera-facing culling and depth order.
 * The same boxes supply top and tilted views; no CSS perspective or invented height.
 * @param plan Published plan with optional shared atomic box assemblies.
 * @param oblique Whether to use a 45-degree elevation camera.
 * @returns Selectable SVG faces and optional OBB wireframes, sorted far to near.
 */
export function drawPlanningVolumes(plan: IslandPlan, oblique: boolean): string {
  const faces: { depth: number; html: string }[] = [];
  for (const rock of plan.rocks) {
    const boxes: V2Box[] = rock.boxes ?? [
      {
        id: rock.id,
        label: labels[rock.role],
        center: rock.center,
        sizeX: rock.width,
        sizeZ: rock.depth,
        sizeY: rock.height,
        yaw: rock.yaw,
        elevation: rock.baseHeight ?? 0,
        appearance: "rock",
        collision: true,
        occlusion: true
      }
    ];
    for (const box of boxes) {
      const c = Math.cos(box.yaw),
        s = Math.sin(box.yaw),
        bottom = box.elevation ?? 0,
        top = bottom + box.sizeY;
      const ring = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1]
      ].map(([u, v]) => ({
        x: box.center.x + ((u * box.sizeX) / 2) * c - ((v * box.sizeZ) / 2) * s,
        z: box.center.z + ((u * box.sizeX) / 2) * s + ((v * box.sizeZ) / 2) * c
      }));
      const polygons: { vertices: { x: number; z: number; y: number }[]; fill: string }[] = [
        { vertices: ring.map((p) => ({ ...p, y: top })), fill: "#bcc8c7" }
      ];
      if (oblique)
        for (let i = 0; i < 4; i++) {
          const a = ring[i],
            b = ring[(i + 1) % 4];
          if (b.x - a.x >= -1e-8) continue;
          polygons.push({
            vertices: [
              { ...a, y: bottom },
              { ...b, y: bottom },
              { ...b, y: top },
              { ...a, y: top }
            ],
            fill: i % 2 ? "#83979e" : "#99aaae"
          });
        }
      for (const polygon of polygons) {
        const points = polygon.vertices
          .map((p) => {
            const q = projectPlanningPoint(p, p.y, oblique);
            return `${q.x.toFixed(3)},${q.z.toFixed(3)}`;
          })
          .join(" ");
        const depth = polygon.vertices.reduce((n, p) => n + (oblique ? p.z + p.y : p.y), 0) / polygon.vertices.length;
        const title = `${labels[rock.role]} · ${box.sizeX.toFixed(1)} × ${box.sizeZ.toFixed(1)} × ${box.sizeY.toFixed(1)} 米`;
        faces.push({
          depth,
          html: `<g class="ip-feature" data-feature-id="${escape(rock.id)}" data-owner-id="${escape(rock.groupId)}" role="button" tabindex="0" aria-label="${title}" data-volume-box="${escape(box.id)}" data-base-height="${bottom}" data-top-height="${top}"><title>${title}</title><g data-plan-layer="rock"><polygon class="ip-feature-outline" points="${points}" fill="${polygon.fill}" stroke="#62777d" stroke-width=".9"/></g><g data-plan-layer="obb"><polygon points="${points}" fill="none" stroke="#00b9cb" stroke-width=".7" pointer-events="none"/></g></g>`
        });
      }
    }
  }
  return faces
    .sort((a, b) => a.depth - b.depth)
    .map((f) => f.html)
    .join("");
}

const groundCache = new WeakMap<PlanPoint[], string>();
/** FBM ground triangles in pre-tilt SVG coordinates, matching the atom grounding field.
 * Only the basic terrain study uses this cache: its ground does not depend on rock edits.
 */
export function drawPlanningGround(plan: IslandPlan): string {
  const cached = groundCache.get(plan.land);
  if (cached) return cached;
  const sample = createPlanningGroundSampler(plan),
    step = 48,
    parts: string[] = [];
  const { width, depth } = plan.parameters;
  for (let z = 0; z < depth; z += step)
    for (let x = 0; x < width; x += step) {
      const points = [
        { x, z },
        { x: Math.min(x + step, width), z },
        { x: Math.min(x + step, width), z: Math.min(z + step, depth) },
        { x, z: Math.min(z + step, depth) }
      ];
      const heights = points.map(sample);
      if (heights.every((h) => h < 0.01)) continue;
      for (const indices of [
        [0, 1, 2],
        [0, 2, 3]
      ]) {
        const ps = indices.map((i) => points[i]),
          ys = indices.map((i) => heights[i]);
        // Coast boundary is clipped by the existing mainland footprint below.
        const shade = Math.max(-10, Math.min(10, (ys[0] - ys[2]) * 0.5));
        const fill = `rgb(${Math.round(208 + shade)},${Math.round(230 + shade)},${Math.round(165 + shade)})`;
        parts.push(
          `<polygon points="${ps.map((p, i) => `${p.x},${p.z - ys[i]}`).join(" ")}" fill="${fill}" stroke="${fill}" stroke-width=".5" pointer-events="none"/>`
        );
      }
    }
  const result = `<g data-fbm-ground="true" clip-path="url(#base-land)">${parts.join("")}</g>`;
  groundCache.set(plan.land, result);
  return result;
}
