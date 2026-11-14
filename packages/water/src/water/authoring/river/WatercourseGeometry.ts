import type { RiverDrop } from "./RiverDrop";
import type { ResolvedWatercourse, ResolvedWatercoursePoint } from "./Watercourse";

/** Derived samples are never written over the author's stable anchors. */
export function watercourseGeometry(course: ResolvedWatercourse) {
  const points: ResolvedWatercoursePoint[] = [course.points[0]],
    paths: ResolvedWatercoursePoint[][] = [[course.points[0]]];
  const drops: RiverDrop[] = [];
  const append = (p: ResolvedWatercoursePoint) => {
    points.push(p);
    paths.at(-1)!.push(p);
  };
  for (let i = 1; i < course.points.length; i++) {
    const a = course.points[i - 1],
      b = course.points[i],
      section = course.sections[i - 1];
    const drop = course.drops.find((d) => d.sectionId === section.id);
    if (!drop) {
      append(b);
      continue;
    }
    const length = Math.hypot(b.x - a.x, b.z - a.z),
      dx = (b.x - a.x) / length,
      dz = (b.z - a.z) / length;
    // A narrow explicit cliff replaces the steep ribbon. Adjacent surfaces stop at its edges.
    const minFractionGap = Math.min(
      drop.fractions[0],
      1 - drop.fractions.at(-1)!,
      ...drop.fractions.slice(1).map((t, i) => t - drop.fractions[i])
    );
    if (minFractionGap <= 0) throw new Error("INVALID_ARGUMENT: Drop platforms must have positive length.");
    const halfGap = Math.min(0.025, (length * minFractionGap) / 8);
    const fractions = drop.fractions;
    for (let j = 0; j < drop.stepCount; j++) {
      const t = fractions[j],
        x = a.x + (b.x - a.x) * t,
        z = a.z + (b.z - a.z) * t;
      const width = a.width + (b.width - a.width) * t,
        depth = a.depth + (b.depth - a.depth) * t;
      const upper = drop.levels[j];
      const lower = drop.levels[j + 1];
      const top = {
        id: `${drop.id}:${j}:top`,
        x: x - dx * halfGap,
        z: z - dz * halfGap,
        width,
        depth,
        elevation: upper,
        bedElevation: upper - depth
      };
      const bottom = {
        ...top,
        id: `${drop.id}:${j}:bottom`,
        x: x + dx * halfGap * 4,
        z: z + dz * halfGap * 4,
        elevation: lower,
        bedElevation: lower - depth
      };
      append(top);
      drops.push({
        id: `${drop.id}:${j}`,
        sectionId: section.id,
        from: top.id,
        to: bottom.id,
        upper: [top.x, upper, top.z],
        lower: [bottom.x, lower, bottom.z],
        across: [-dz || 0, dx || 0],
        width
      });
      paths.push([bottom]);
      points.push(bottom);
    }
    append(b);
  }
  return { points, paths, drops };
}

import { RiverNodeKind, RiverPathMode } from "./RiverAuthoringEnums";
import { createRiver, type RiverOptions } from "./createRiver";

export function watercourseRiverTopology(course: ResolvedWatercourse, segmentLength: number) {
  const geometry = watercourseGeometry(course);
  return {
    drops: geometry.drops,
    nodes: geometry.paths.flatMap((path) => [
      {
        id: path[0].id,
        kind: RiverNodeKind.Source,
        position: [path[0].x, path[0].elevation, path[0].z] as [number, number, number],
        elevation: path[0].elevation
      },
      {
        id: path.at(-1)!.id,
        kind: RiverNodeKind.Mouth,
        position: [path.at(-1)!.x, path.at(-1)!.elevation, path.at(-1)!.z] as [number, number, number],
        elevation: path.at(-1)!.elevation
      }
    ]),
    segments: geometry.paths.map((path) => ({
      id: `${course.id}:${path[0].id}:${path.at(-1)!.id}`,
      from: path[0].id,
      to: path.at(-1)!.id,
      curve: {
        semantics: "resolved-path" as const,
        mode: RiverPathMode.Polyline,
        segmentLength,
        points: path.map((p) => ({
          id: p.id,
          position: [p.x, p.elevation, p.z] as [number, number, number],
          width: p.width,
          depth: p.depth
        }))
      }
    }))
  };
}

/** Build a native River input from a resolved authoring result and the host's accepted final bed. */
export function createWatercourseRiver(
  course: ResolvedWatercourse,
  options: Pick<RiverOptions, "terrain" | "speed"> = {}
) {
  const descriptor = createRiver({
    id: course.id,
    ...options,
    points: course.points.map((p) => ({ id: p.id, position: [p.x, p.elevation, p.z], width: p.width, depth: p.depth })),
    width: course.points[0].width,
    depth: course.points[0].depth
  });
  return { ...descriptor, ...watercourseRiverTopology(course, 0.25) };
}
