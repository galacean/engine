import { hashRiverStableValue } from "../../compiler/shared/determinism";
import type { RiverNetworkDescriptor } from "./RiverDescriptor";

/** Exact River surface identity; visual material, bake quality and budgets are intentionally excluded. */
export function computeRiverPhysicalSourceHash(descriptor: RiverNetworkDescriptor): string {
  const nodeIndices = new Map(descriptor.nodes.map((node, index) => [node.id, index] as const));
  const physicalMotion = {
    seed: descriptor.defaults.surfaceMotion.seed,
    displacementAmplitude: descriptor.defaults.surfaceMotion.displacementAmplitude,
    displacementLengthScale: descriptor.defaults.surfaceMotion.displacementLengthScale,
    shoreDampingWidth: descriptor.defaults.surfaceMotion.shoreDampingWidth,
    turbulence: descriptor.defaults.surfaceMotion.turbulence
  };
  return hashRiverStableValue({
    physicalSchemaVersion: 2,
    schemaVersion: descriptor.schemaVersion,
    terrain: descriptor.terrain,
    ...(descriptor.connections ? { connections: descriptor.connections } : {}),
    ...(descriptor.drops ? { drops: descriptor.drops } : {}),
    surfaceAuthority: descriptor.surfaceAuthority,
    nodes: descriptor.nodes.map(({ id: _id, ...node }) => node),
    segments: descriptor.segments.map((segment) => ({
      fromNodeIndex: nodeIndices.get(segment.from),
      toNodeIndex: nodeIndices.get(segment.to),
      order: segment.order,
      curve: {
        mode: segment.curve.mode,
        semantics: segment.curve.semantics,
        points: segment.curve.points.map(({ id: _id, bankFeather: _bankFeather, ...point }) =>
          descriptor.terrain ? { ...point, depth: undefined } : point
        )
      },
      shape: segment.shape
        ? { width: segment.shape.width, depth: descriptor.terrain ? undefined : segment.shape.depth }
        : undefined,
      flow: segment.flow
    })),
    defaults: {
      shape: {
        width: descriptor.defaults.shape.width,
        depth: descriptor.terrain ? undefined : descriptor.defaults.shape.depth
      },
      flow: descriptor.defaults.flow,
      surfaceMotion: physicalMotion
    },
    disturbances: descriptor.disturbances?.map(({ id: _id, ...disturbance }) => disturbance)
  });
}
