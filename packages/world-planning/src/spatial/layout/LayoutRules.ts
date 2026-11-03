import { buildCurveLayout, connectCurveRows } from "./ConnectedCurve";
import { buildRadialLayout } from "./RadialLayout";
import profile from "./space-rules.json";
import { settlementRandom } from "../../semantic-study/SettlementGeometry";
import type { PlanPoint } from "../../semantic-study/IslandPlanModel";
import type { Volume, VolumeBox, VolumeExclusion } from "./Volumes";

export interface LayoutConnectionPlan {
  ports: {
    id: string;
    position: PlanPoint;
    access: boolean;
    /** An actual member served from this free-space approach, without a final entrance spur. */
    servesVolumeId?: string;
  }[];
  links: { id: string; from: string; to: string; width: number; points?: PlanPoint[]; backbone?: boolean }[];
}

/** Material-independent, metre-based authoring parameters shared by the built-in spatial rules. */
export interface LayoutRule {
  pattern: string;
  /** Derived candidate extent, never an independently authored capacity. */
  radiusM: number;
  /** Preferred edge separation along the arrangement; negative permits overlap if explicit relations allow it. */
  spacingM?: number; // Legacy read compatibility.
  spacingMinM?: number;
  spacingMaxM?: number;
  widthMinM: number;
  widthMaxM: number;
  depthMinM: number;
  depthMaxM: number;
  heightMinM: number;
  heightMaxM: number;
  orientationVariation: number;
  /** Local random stream; never changes authored ranges, profile or POI anchors. */
  variationSeed?: number;
  /** Radial displacement of ring members, independent of along-ring spacing. */
  radialVariationM?: number;
  /** Metres between smooth curve extrema. */
  curveVariationScaleM?: number;
  pathWidthM: number;
  openRadiusM: number;
  /** Shape of the connected organization; topology and pavement remain part of the same rule. */
  branchShape?: "radial" | "curve";
  curveBendM?: number;
  curveHeadingDegrees?: number;
  /** Base clear corridor between banks, independent of pavement width. */
  curveGapM?: number;
  /** Outward lateral variation (0 to twice the amplitude); zero keeps the base corridor. */
  curveLateralVariationM?: number;
  /** Internal pavement only; independent of volume organization, appearance and global access. */
  roadMode?: "none" | "backbone" | "members";
  roadAccess?: boolean;
  /** Maximum terrain gradient supported by this volume profile, in degrees; 90 disables filtering. */
  maxGroundSlopeDegrees?: number;
}
/** Region-owned inputs. Geometry and topology are derived without a population target. */
export interface LayoutBuildContext {
  owner: string;
  center: PlanPoint;
  region: readonly PlanPoint[];
  parameters: Readonly<LayoutRule>;
  components: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  random(channel: string): number;
}
/** Derived candidates and a shared skeleton; never persisted as author parameters. */
export interface LayoutConstruction {
  /** Derived local organization origin; the POI anchor itself is unchanged. */
  center?: PlanPoint;
  members: VolumeBox[][];
  spine?: PlanPoint[];
  /** Work limit reached, not a geometric capacity or a silently modified parameter. */
  limited?: boolean;
}
/** Trusted organization plugin. Content profiles supply exclusions independently of the organization. */
export interface LayoutRulePlugin {
  id: string;
  version: number;
  label: string;
  exclusionGroup?: string;
  parameterKeys?: string[];
  centerClearing?: boolean;
  allowContentTermini?: boolean;
  defaults?: Partial<LayoutRule>;
  connections: "none" | "tree";
  /** Construct the region once. Member count is the result of size and spacing. */
  build(context: LayoutBuildContext): LayoutConstruction;
  relations?(owners: readonly { id: string; volumeIds: string[]; group?: string }[]): VolumeExclusion[];
  /** Connect accepted members to the original skeleton, independent of discarded candidates. */
  connect?(
    context: Omit<LayoutBuildContext, "region" | "components"> & {
      construction: LayoutConstruction;
      volumes: readonly Volume[];
    }
  ): LayoutConnectionPlan | undefined;
}
const rules = new Map<string, LayoutRulePlugin>();
/** Register a trusted rule in both main and worker entry modules. Returns an idempotent disposer.
 * @throws For duplicate IDs or invalid versions. A used rule cannot be removed from a saved project's environment.
 */
export function registerLayoutRule(plugin: LayoutRulePlugin): () => void {
  if (!plugin.id || rules.has(plugin.id) || !Number.isInteger(plugin.version) || plugin.version < 1)
    throw new Error("空间规则 ID 重复或版本无效：" + plugin.id);
  const registered = { ...plugin };
  rules.set(plugin.id, registered);
  return () => {
    if (rules.get(plugin.id) === registered) rules.delete(plugin.id);
  };
}
/** @returns A registered rule. Missing plugins are reported explicitly instead of silently changing a saved layout. */
export function layoutRule(id: string): LayoutRulePlugin {
  const rule = rules.get(id);
  if (!rule) throw new Error("缺少空间规则：" + id);
  return rule;
}
/** @returns Serializable discovery/version metadata; algorithms stay outside saved documents. */
export function layoutRuleManifest() {
  return [...rules.values()]
    .map(({ build, relations, connect, ...metadata }) => ({
      ...metadata,
      customRelations: !!relations,
      customConnections: !!connect
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
/** @returns A named random stream unaffected by sampling another owner, field or candidate. */
export function layoutRandom(seed: number, owner: string, index: number, attempt: number, variationSeed = 0) {
  const variant = variationSeed ? `:variation:${variationSeed}` : "";
  return (channel: string) => settlementRandom(seed, `layout:${owner}:${index}:${attempt}:${channel}${variant}`);
}
registerLayoutRule({
  id: "region",
  version: 1,
  label: "仅管理区域",
  connections: "none",
  build: () => ({ members: [] })
});

registerLayoutRule({
  id: "connected",
  version: 15,
  label: "分支连接布局",
  allowContentTermini: true,
  parameterKeys: [
    "pathWidthM",
    "roadMode",
    "branchShape",
    "curveBendM",
    "curveHeadingDegrees",
    "curveGapM",
    "curveLateralVariationM",
    "curveVariationScaleM",
    "radialVariationM"
  ],
  exclusionGroup: profile.rules.connected.exclusionGroup,
  connections: profile.rules.connected.connections as "tree",
  build: (c) => (c.parameters.branchShape === "curve" ? buildCurveLayout(c) : buildRadialLayout(c)),
  connect: (c) => (c.parameters.branchShape === "curve" ? connectCurveRows(c) : undefined)
});

registerLayoutRule({
  id: "courtyard",
  version: 8,
  centerClearing: true,
  allowContentTermini: true,
  defaults: { openRadiusM: 12 },
  label: "围绕中心留白",
  exclusionGroup: "independent",
  connections: "tree",
  parameterKeys: ["pathWidthM", "roadMode", "openRadiusM", "radialVariationM"],
  build: buildRadialLayout
});

/** Compile upper-rule declarations to explicit volume pairs. Core collision code consumes only these relations. */
export function layoutExclusions(
  groups: readonly {
    id: string;
    rule: LayoutRule;
    volumeIds: string[];
    exclusions?: { group: string; against: string[] };
  }[]
): VolumeExclusion[] {
  const owners = groups.map((g) => ({
    id: g.id,
    volumeIds: g.volumeIds,
    group: g.exclusions?.group ?? layoutRule(g.rule.pattern).exclusionGroup,
    against: g.exclusions?.against ?? [layoutRule(g.rule.pattern).exclusionGroup].filter((v): v is string => !!v)
  }));
  const grouped = new Map<string, string[]>();
  for (const owner of owners)
    if (owner.group) grouped.set(owner.group, [...(grouped.get(owner.group) ?? []), ...owner.volumeIds]);
  const relations: VolumeExclusion[] = [],
    pairs = new Set<string>();
  for (const owner of owners) {
    if (!owner.group) continue;
    for (const target of owner.against) {
      const key = [owner.group, target].sort().join(":");
      if (pairs.has(key) || !grouped.has(target)) continue;
      pairs.add(key);
      relations.push({ id: "exclusion:" + key, a: grouped.get(owner.group)!, b: grouped.get(target)! });
    }
  }
  for (const pattern of new Set(groups.map((g) => g.rule.pattern)))
    relations.push(...(layoutRule(pattern).relations?.(structuredClone(owners)) ?? []));
  const known = new Set(owners.flatMap((o) => o.volumeIds));
  for (const relation of relations)
    if (!relation.id || [...relation.a, ...relation.b].some((id) => !known.has(id)))
      throw new Error("互斥关系引用了不存在的体量");
  return relations;
}

/** Search extent comes from the owned region, not an authored population. */
export function layoutExtent(center: PlanPoint, region: readonly PlanPoint[]): number {
  return Math.max(1, ...region.map((p) => Math.hypot(p.x - center.x, p.z - center.z)));
}
