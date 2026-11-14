import { vegetationRank as rank, sampleLandscapeSpeciesWeights } from "./VegetationRandom";

export interface SpeciesRegionMember {
  readonly assetId: string;
  /** Variants of the same catalog species share a territory. */
  readonly speciesGroup?: string;
  /** Optional local composition group, independent of species and model variants. */
  readonly mixtureGroup?: string;
  readonly weight: number;
}
export interface SpeciesRegionSettings {
  /** Nominal distance between region centres, in world metres. */
  readonly sizeMetres: number;
  /** Full width of the mixed strip across a Voronoi boundary; zero gives pure regions. */
  readonly transitionMetres: number;
  /** Stable composition identity, independent of render cells and candidate ordering. */
  readonly scopeId: string;
  /** Per-instance group weights; each selected group keeps its own species territories.
   * Absent groups are omitted and zero disables a group. Omitted: species territories only. */
  readonly localMixture?: Readonly<Record<string, number>>;
}

/** Group abundance is independent of the number of model variants in that group. */
export function sampleSpeciesGroupWeights(
  seed: number,
  scopeId: string,
  members: readonly Pick<SpeciesRegionMember, "assetId" | "speciesGroup">[]
): Record<string, number> {
  const groups = new Map<string, string[]>();
  for (const member of members) {
    const key = member.speciesGroup ?? member.assetId;
    groups.set(key, [...(groups.get(key) ?? []), member.assetId]);
  }
  const weights = sampleLandscapeSpeciesWeights(seed, scopeId, [...groups.keys()]);
  return Object.fromEntries(
    [...groups].flatMap(([group, ids]) =>
      Object.entries(sampleLandscapeSpeciesWeights(seed, `${scopeId}/variants/${group}`, ids)).map(([id, weight]) => [
        id,
        weight * weights[group]
      ])
    )
  );
}

/** Effective member probabilities shared by composition sampling and expected footprint area.
 * Preserve each available group's internal ratios while assigning its authored mixture mass. */
export function applySpeciesMixtureWeights<T extends SpeciesRegionMember>(
  members: readonly T[],
  localMixture?: Readonly<Record<string, number>>
): readonly T[] {
  if (localMixture === undefined) return members;
  if (
    !localMixture ||
    typeof localMixture !== "object" ||
    Array.isArray(localMixture) ||
    Object.entries(localMixture).some(([id, weight]) => !id.trim() || !Number.isFinite(weight) || weight < 0)
  )
    throw new Error("Invalid vegetation local mixture weights");
  // Explicitly excluding a complete layer leaves no probability domain to normalize.
  if (!members.length) return members;
  const grouped = new Map<string, T[]>();
  for (const member of members) {
    const id = member.mixtureGroup;
    if (typeof id !== "string" || !id.trim() || !Object.prototype.hasOwnProperty.call(localMixture, id))
      throw new Error(`Missing vegetation local mixture group: ${member.assetId}`);
    if (!Number.isFinite(member.weight) || member.weight <= 0)
      throw new Error(`Invalid vegetation local mixture member weight: ${member.assetId}`);
    grouped.set(id, [...(grouped.get(id) ?? []), member]);
  }
  const groups = [...grouped].filter(([id]) => localMixture[id] > 0).sort(([a], [b]) => a.localeCompare(b));
  if (!groups.length) throw new Error("No available vegetation local mixture group has positive weight");
  // Rescale before summing so every finite authored weight remains a valid ratio.
  const largestWeight = Math.max(...groups.map(([id]) => localMixture[id]));
  const totalWeight = groups.reduce((sum, [id]) => sum + localMixture[id] / largestWeight, 0);
  return groups.flatMap(([id, groupMembers]) => {
    const groupWeight = localMixture[id] / largestWeight / totalWeight;
    const largestMemberWeight = Math.max(...groupMembers.map((member) => member.weight));
    const memberTotal = groupMembers.reduce((sum, member) => sum + member.weight / largestMemberWeight, 0);
    return groupMembers.map((member) => ({
      ...member,
      weight: (groupWeight * (member.weight / largestMemberWeight)) / memberTotal
    }));
  });
}

/** Optional local composition chooses a group by stable plant identity, then samples
 * that group's world-space species field. Model counts cannot change group abundance. */
export function createVegetationSpeciesRegions<T extends SpeciesRegionMember>(
  seed: number,
  members: readonly T[],
  settings: SpeciesRegionSettings
) {
  const { sizeMetres: size, transitionMetres, scopeId } = settings;
  if (
    !Number.isFinite(seed) ||
    !scopeId ||
    !Number.isFinite(size) ||
    size <= 0 ||
    !Number.isFinite(transitionMetres) ||
    transitionMetres < 0 ||
    !members.length ||
    new Set(members.map((member) => member.assetId)).size !== members.length ||
    members.some(
      (member) => !member.assetId || member.speciesGroup === "" || !Number.isFinite(member.weight) || member.weight <= 0
    )
  )
    throw new Error("Invalid vegetation species regions");
  const mixture = settings.localMixture;
  if (mixture === undefined) return createSpeciesRegionField(seed, members, settings);
  const weightedMembers = applySpeciesMixtureWeights(members, mixture);
  const grouped = new Map<string, T[]>();
  for (const member of weightedMembers) {
    const id = member.mixtureGroup!;
    grouped.set(id, [...(grouped.get(id) ?? []), member]);
  }
  const fields = [...grouped].map(([id, groupMembers]) => ({
    weight: groupMembers.reduce((sum, member) => sum + member.weight, 0),
    sample: createSpeciesRegionField(seed, groupMembers, {
      ...settings,
      scopeId: `${scopeId}/mixture/${JSON.stringify(id)}`
    })
  }));
  return (point: readonly [number, number], instanceId: string) => {
    let remaining = rank(seed, `vegetation-mixture:${JSON.stringify([scopeId, instanceId])}`);
    const field = fields.find((field) => (remaining -= field.weight) < 0) ?? fields[fields.length - 1];
    return field.sample(point, instanceId);
  };
}

/** Cells accelerate centre lookup only; nearest-centre boundaries define the
 * irregular regions. Within one composition group, interior species ignore plant ID. */
function createSpeciesRegionField<T extends SpeciesRegionMember>(
  seed: number,
  members: readonly T[],
  settings: SpeciesRegionSettings
) {
  const { sizeMetres: size, transitionMetres, scopeId } = settings;
  const groups = new Map<string, T[]>();
  for (const member of [...members].sort((a, b) => a.assetId.localeCompare(b.assetId))) {
    const key = member.speciesGroup ?? member.assetId;
    groups.set(key, [...(groups.get(key) ?? []), member]);
  }
  const weightedGroups = [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, variants]) => ({ id, variants, weight: variants.reduce((sum, member) => sum + member.weight, 0) }));
  const select = <M extends { readonly weight: number }>(choices: readonly M[], value: number): M => {
    let remaining = value * choices.reduce((sum, member) => sum + member.weight, 0);
    return choices.find((member) => (remaining -= member.weight) < 0) ?? choices[choices.length - 1];
  };
  type Site = { id: string; x: number; z: number; group: (typeof weightedGroups)[number] };
  const sites = new Map<string, Site>();
  const siteAt = (x: number, z: number) => {
    const id = `${scopeId}/region/${x}/${z}`;
    let site = sites.get(id);
    if (!site) {
      // Bin centres keep jitter strictly inside each cell, including a hash of zero.
      const jitter = (axis: string) => rank(seed, `${id}/${axis}`) + 0.5 / 2 ** 32;
      site = {
        id,
        x: (x + jitter("x")) * size,
        z: (z + jitter("z")) * size,
        group: select(weightedGroups, rank(seed, `${id}/species`))
      };
      sites.set(id, site);
    }
    return site;
  };
  return (point: readonly [number, number], instanceId: string) => {
    const [x, z] = point,
      cx = Math.floor(x / size),
      cz = Math.floor(z / size);
    if (!point.every(Number.isFinite) || !Number.isSafeInteger(cx) || !Number.isSafeInteger(cz))
      throw new Error("Invalid vegetation region position");
    const nearest: { site: Site; distanceSquared: number }[] = [];
    // Search until the distance to every unvisited cell is larger than the second
    // nearest centre. This proves the result without a guessed fixed neighbour radius.
    for (let radius = 0; ; radius++) {
      for (let iz = cz - radius; iz <= cz + radius; iz++)
        for (let ix = cx - radius; ix <= cx + radius; ix++) {
          if (Math.max(Math.abs(ix - cx), Math.abs(iz - cz)) !== radius) continue;
          const site = siteAt(ix, iz);
          nearest.push({ site, distanceSquared: (x - site.x) ** 2 + (z - site.z) ** 2 });
          nearest.sort((a, b) => a.distanceSquared - b.distanceSquared || a.site.id.localeCompare(b.site.id));
          if (nearest.length > 2) nearest.pop();
        }
      const outsideDistance = Math.min(
        x - (cx - radius) * size,
        (cx + radius + 1) * size - x,
        z - (cz - radius) * size,
        (cz + radius + 1) * size - z
      );
      if (nearest.length === 2 && outsideDistance ** 2 > nearest[1].distanceSquared) break;
    }
    const [first, second] = nearest;
    // Squared-distance difference / twice the centre separation is the exact
    // perpendicular distance to their bisector, expressed in metres.
    const boundaryDistanceMetres =
      (second.distanceSquared - first.distanceSquared) /
      (2 * Math.hypot(first.site.x - second.site.x, first.site.z - second.site.z));
    const t = transitionMetres === 0 ? 1 : Math.min(1, boundaryDistanceMetres / (transitionMetres / 2));
    const smooth = t * t * (3 - 2 * t);
    const secondaryWeight = first.site.group.id === second.site.group.id ? 0 : (1 - smooth) / 2;
    const group = rank(seed, `${scopeId}/edge/${instanceId}`) < secondaryWeight ? second.site.group : first.site.group;
    return {
      member: select(group.variants, rank(seed, `${scopeId}/variant/${instanceId}`)),
      regionId: first.site.id,
      speciesGroup: group.id,
      dominantGroup: first.site.group.id,
      neighborRegionId: second.site.id,
      regionBlendWeight: (1 - smooth) / 2,
      boundaryDistanceMetres,
      secondaryWeight
    };
  };
}
