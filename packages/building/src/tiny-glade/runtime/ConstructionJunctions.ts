import type { CompiledMasonryLayout } from "./ConstructionLayout";

/** Diagnostics over the actual compiler output, never a second seam generator.
 * Positions are in the construction's local world frame, before placement.
 * A submitted instance is not proof of a visible pixel; occlusion needs a draw
 * isolation/depth comparison in the renderer. */
export function inspectConstructionJunctions(
  layout: CompiledMasonryLayout,
  draws?: readonly { id: string; count: number; group?: number | null; variant?: string | null }[]
) {
  const owners = new Map(layout.construction.owners.map((o) => [o.nativeId, o.building.id]));
  const pairId = (ids: readonly string[]) => JSON.stringify([...ids].sort());
  const connections = layout.construction.connections;
  const groupIds = (source: string) =>
    new Set(layout.groups.filter((g) => g.junction?.sourceDrawId === source).map((g) => g.id));
  const isSource = (id: string, source: string) => id === source || id.startsWith(source + "/");
  const drawIds = (source: string) => {
    if (!draws) return [source];
    const ids = groupIds(source);
    return draws.filter((d) => d.count > 0 && (isSource(d.id, source) || ids.has(d.group))).map((d) => d.id);
  };
  const walls = connections.pairs.map((pair) => {
    const participants = pair.wallIds.map((id) => {
      const owner = owners.get(id);
      if (!owner) throw Error("Connection references an absent construction owner");
      return owner;
    });
    const belongs = (ids: readonly bigint[]) => ids.length === 2 && pair.wallIds.every((id) => ids.includes(id));
    const bricks = connections.bricks.filter((b) => belongs(b.placement.wallIds));
    const beams = connections.beams.filter((b) => belongs(b.placement.wallIds));
    return {
      id: pairId(participants),
      participants,
      mechanism: "recovered_wall_stitches" as const,
      crossingCount: pair.crossings.length,
      candidateCount: pair.candidates.length,
      brickCount: bricks.length,
      beamCount: beams.length,
      reservationHoleCounts: pair.finalizedHoles.map((h) => h.length),
      columns: pair.candidates.map((c) => ({
        bottom: [c.point[0], c.minY, c.point[1]],
        top: [c.point[0], c.maxY, c.point[1]]
      })),
      instances: [...bricks, ...beams].map((b) => ({
        unit: b.placement.unit,
        position: [...b.placement.position],
        scale: [...b.placement.scale],
        renderOwner: owners.get(b.primaryWallId)!
      }))
    };
  });
  const roofs = layout.topology.pitched_pairs.map((pair) => ({
    id: pairId(pair.wall_pair.map(String)),
    participants: pair.wall_pair.map(String),
    mechanism: "independent_roof_depth_composition" as const,
    supportStatus: pair.geometry.status as string,
    supportSegments: pair.geometry.segments.map((s: { world: number[][] }) => s.world),
    unresolvedSupport: pair.geometry.unknown,
    extraUnitCount: 0,
    // Roof support intersections locate edits; they are not render-skin
    // intersections or evidence that native extra valley pieces are missing.
    visibility: "requires_render_depth_comparison" as const
  }));
  const interRoof = layout.construction.merlons.groups.map((g, index) => ({
    id: pairId([owners.get(g.candidate.flatId)!, owners.get(g.candidate.pitchedId)!]),
    flatOwner: owners.get(g.candidate.flatId)!,
    pitchedOwner: owners.get(g.candidate.pitchedId)!,
    mechanism: "recovered_flat_pitched_merlons" as const,
    bricks: g.bricks.length,
    beams: g.beams.length,
    interval: { start: g.candidate.start, end: g.candidate.end, y: g.candidate.y },
    instances: g.placements,
    drawIds: [...drawIds("inter-roof-bricks-" + index), ...drawIds("inter-roof-beams-" + index)]
  }));
  const submitted = (id: string) => {
    const ids = groupIds(id);
    return (
      draws
        ?.filter(
          (d) =>
            isSource(d.id, id) ||
            (ids.has(d.group) && layout.groups.find((g) => g.id === d.group)?.junction?.sourceUnit === d.variant)
        )
        .reduce((n, d) => n + d.count, 0) ?? 0
    );
  };
  const expected = {
    bricks: connections.bricks.length,
    beams: connections.beams.length,
    interRoofBricks: layout.construction.merlons.bricks.length,
    interRoofBeams: layout.construction.merlons.beams.length
  };
  const submittedPrefix = (prefix: string) => {
    const sources = new Set([
      ...(draws?.filter((d) => d.id.startsWith(prefix)).map((d) => d.id) ?? []),
      ...layout.groups.map((g) => g.junction?.sourceDrawId).filter((id): id is string => !!id?.startsWith(prefix))
    ]);
    return [...sources].reduce((n, id) => n + submitted(id), 0);
  };
  const submission = draws
    ? {
        expected,
        wallDrawIds: [...drawIds("connection-bricks"), ...drawIds("connection-beams")],
        interRoofDrawIds: interRoof.flatMap((g) => g.drawIds),
        actual: {
          bricks: submitted("connection-bricks"),
          beams: submitted("connection-beams"),
          interRoofBricks: submittedPrefix("inter-roof-bricks-"),
          interRoofBeams: submittedPrefix("inter-roof-beams-")
        },
        matches:
          submitted("connection-bricks") === expected.bricks &&
          submitted("connection-beams") === expected.beams &&
          submittedPrefix("inter-roof-bricks-") === expected.interRoofBricks &&
          submittedPrefix("inter-roof-beams-") === expected.interRoofBeams
      }
    : null;
  return {
    schema: "construction-junction-inspection-v1" as const,
    coordinateSpace: "construction_local" as const,
    placement: layout.document.placement,
    walls,
    roofs,
    interRoof,
    submission,
    counts: {
      interRoofCandidates: interRoof.length,
      interRoofBricks: expected.interRoofBricks,
      interRoofBeams: expected.interRoofBeams,
      interRoofHoleOwners: layout.construction.merlons.holes.size,
      wallPairs: walls.length,
      wallBricks: expected.bricks,
      wallBeams: expected.beams,
      roofPairsExamined: roofs.length,
      roofPairsIntersecting: roofs.filter((r) => r.supportSegments.length > 0).length,
      roofSupportSegments: roofs.reduce((n, r) => n + r.supportSegments.length, 0)
    },
    visibility: "not_measured" as const
  };
}
