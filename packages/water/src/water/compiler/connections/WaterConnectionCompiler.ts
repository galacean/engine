import {
  decodeWaterConnectionPorts,
  type WaterConnectionPort,
  type WaterConnectionV1
} from "../../authoring/connections/WaterConnection";
import { compileWaterConnectionShore } from "./WaterConnectionShoreCompiler";
import { hashStableValue } from "../shared/determinism";

export interface WaterConnectionBody {
  readonly id: string;
  readonly kind: "lake" | "river" | "ocean";
  readonly bounds: readonly [minX: number, minZ: number, maxX: number, maxZ: number];
  readonly surfaceHeight: (x: number, z: number) => number;
  /** Optional exact authored footprint; shoreline-field extrapolation remains independent. */
  readonly containsSurfacePoint?: (x: number, z: number) => boolean;
}

/** Compiles static connection facts without modifying terrain or backend geometry. */
export function compileWaterConnections(
  connections: readonly WaterConnectionV1[],
  bodies: readonly WaterConnectionBody[],
  bedHeight: (x: number, z: number) => number
) {
  for (const body of bodies) {
    if (
      body.bounds.length !== 4 ||
      !body.bounds.every(Number.isFinite) ||
      body.bounds[0] >= body.bounds[2] ||
      body.bounds[1] >= body.bounds[3]
    )
      throw new Error("Water connection bodies need finite footprint bounds.");
  }
  const byId = new Map(bodies.map((body) => [body.id, body]));
  if (byId.size !== bodies.length) throw new Error("Duplicate connected water body ID.");
  const ports: Record<string, WaterConnectionPort[]> = Object.fromEntries(bodies.map((body) => [body.id, []]));
  const ids = new Set<string>();
  for (const connection of connections) {
    if (!connection.id || ids.has(connection.id)) throw new Error("Duplicate or empty water connection ID.");
    ids.add(connection.id);
    const [first, second] = connection.bodies.map((id) => byId.get(id));
    if (!first || !second || first === second) throw new Error(`Invalid bodies in '${connection.id}'.`);
    if (
      connection.transitionLengths.length !== 2 ||
      !connection.transitionLengths.every((v) => Number.isFinite(v) && v > 0)
    )
      throw new Error(`Invalid transition lengths in '${connection.id}'.`);
    const [a, b] = connection.section;
    const width = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!Number.isFinite(width) || width < 0.1) throw new Error(`Invalid section in '${connection.id}'.`);
    const center = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as const;
    const normal = [-(b[1] - a[1]) / width, (b[0] - a[0]) / width] as const;
    for (const t of [0.1, 0.5, 0.9]) {
      const x = a[0] + (b[0] - a[0]) * t,
        z = a[1] + (b[1] - a[1]) * t;
      for (const body of [first, second])
        if (
          body.containsSurfacePoint
            ? !body.containsSurfacePoint(x, z)
            : x < body.bounds[0] || z < body.bounds[1] || x > body.bounds[2] || z > body.bounds[3]
        )
          throw new Error(`Connection '${connection.id}' section lies outside its Water footprint.`);
      const left = first.surfaceHeight(x, z),
        right = second.surfaceHeight(x, z),
        bed = bedHeight(x, z);
      if (![left, right, bed].every(Number.isFinite) || Math.abs(left - right) > 0.01 || bed >= Math.min(left, right))
        throw new Error(`Connection '${connection.id}' needs aligned water levels and a submerged bed.`);
    }
    const coverageBounds = [
      Math.max(first.bounds[0], second.bounds[0]),
      Math.max(first.bounds[1], second.bounds[1]),
      Math.min(first.bounds[2], second.bounds[2]),
      Math.min(first.bounds[3], second.bounds[3])
    ] as const;
    const shoreField = compileWaterConnectionShore(
      center,
      width / 2 + Math.max(...connection.transitionLengths) + 8,
      (x, z) => {
        const body = (x - center[0]) * normal[0] + (z - center[1]) * normal[1] < 0 ? first : second;
        return body.surfaceHeight(x, z) - bedHeight(x, z);
      }
    );
    [first, second].forEach((body, i) =>
      ports[body.id].push({
        id: connection.id,
        center,
        normal,
        halfWidth: width / 2,
        length: connection.transitionLengths[i],
        coverageBounds,
        shoreField,
        side: i === 0 ? -1 : 1,
        environmentTransition: first.kind === "ocean" || second.kind === "ocean"
      })
    );
  }
  const byBody = Object.freeze(
    Object.fromEntries(Object.entries(ports).map(([id, p]) => [id, decodeWaterConnectionPorts(p)!]))
  );
  return Object.freeze({ byBody, hash: hashStableValue(byBody), count: connections.length });
}
