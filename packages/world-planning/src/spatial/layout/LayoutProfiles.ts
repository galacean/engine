import type { PoiSite } from "../../semantic-study/PoiDistribution";
import { settlementRandom } from "../../semantic-study/SettlementGeometry";
import { layoutRule, type LayoutRule } from "./LayoutRules";
import profile from "./space-rules.json";

interface ElementProfile {
  pattern?: string;
  version: number;
  label: string;
  presentation: string;
  width?: number[];
  depth?: number[];
  height?: number[];
  maxGroundSlopeDegrees?: number;
  /** Upper-level placement preference and footprint allowance, in metres of band displacement. */
  terrainPlacement?: { maxReliefM: number };
  exclusions?: { group: string; against: string[] };
  tiers?: Partial<Record<PoiSite["tier"], { width?: number[]; depth?: number[]; height?: number[] }>>;
}

type Organization = (typeof profile.tiers.large.rules)[number];
function sampleOrganization(seed: number, site: PoiSite): Organization {
  const rules = profile.tiers[site.tier].rules;
  let choice = settlementRandom(seed, `${site.id}:organization`) * rules.reduce((n, r) => n + r.weight, 0);
  return rules.find((r) => (choice -= r.weight) < 0) ?? rules.at(-1)!;
}

/** Assign sampled upper-level compositions to suitable regions without moving any POI.
 * Terrain-sensitive compositions take the least affected dry regions of the same tier.
 * Counts remain sampled results, not targets; a region without usable samples keeps an
 * unrestricted composition. Ties retain the original binding to avoid gratuitous changes.
 */
export function assignLayoutOrganizations(seed: number, sites: readonly PoiSite[], relief: Record<string, number[]>) {
  const result: Record<string, Organization> = {};
  const policy = (o: Organization) =>
    (profile.elementProfiles as Record<string, ElementProfile>)[o.elementProfile].terrainPlacement;
  for (const tier of ["large", "medium", "small"] as const) {
    const entries = sites
      .filter((s) => s.tier === tier)
      .map((site) => ({ site, organization: sampleOrganization(seed, site) }));
    const pending = entries.filter((e) => policy(e.organization));
    const remaining = new Set(entries.map((e) => e.site.id));
    const displaced: Organization[] = [];
    for (const entry of pending) {
      const limit = policy(entry.organization)!.maxReliefM;
      const score = (id: string) => {
        const values = relief[id] ?? [];
        const usable = values.filter((v) => v <= limit).length;
        return {
          fraction: usable / (values.length || 1),
          mean: values.reduce((a, b) => a + b, 0) / (values.length || 1)
        };
      };
      const candidates = entries.filter((e) => remaining.has(e.site.id)).map((e) => ({ ...e, ...score(e.site.id) }));
      candidates.sort(
        (a, b) =>
          b.fraction - a.fraction ||
          a.mean - b.mean ||
          Number(b.site.id === entry.site.id) - Number(a.site.id === entry.site.id) ||
          a.site.id.localeCompare(b.site.id)
      );
      const target = candidates[0];
      if (!target || target.fraction === 0) continue;
      result[target.site.id] = entry.organization;
      remaining.delete(target.site.id);
      if (!policy(target.organization)) displaced.push(target.organization);
    }
    for (const entry of entries) {
      if (!remaining.has(entry.site.id)) continue;
      if (!policy(entry.organization)) result[entry.site.id] = entry.organization;
      else {
        // No repeated placement attempts: select the configured unrestricted alternative once.
        const alternatives = profile.tiers[tier].rules.filter((o) => o.weight > 0 && !policy(o));
        let choice =
          settlementRandom(seed, `${entry.site.id}:organization`) * alternatives.reduce((s, o) => s + o.weight, 0);
        const alternative = displaced.shift() ?? alternatives.find((o) => (choice -= o.weight) < 0);
        if (!alternative) throw new Error("空间配置缺少不依赖地势的备选组织：" + tier);
        result[entry.site.id] = alternative;
      }
    }
  }
  return result;
}

/** Serializable contract for matching configuration in the main thread and worker. */
export function layoutProfileManifest() {
  return structuredClone({
    tiers: profile.tiers,
    elements: profile.elementProfiles,
    connectedCurve: profile.connectedCurve,
    randomness: profile.randomness
  });
}

/** Upper-level configuration pairs a spatial rule with an element profile. The same rule may serve different elements.
 * Element dimensions override tier defaults, then authored layout/instance fields override these initial ranges.
 * These distributions are not hard size constraints and do not change the collision kernel.
 */
export function initialLayoutConfiguration(
  seed: number,
  site: PoiSite,
  pattern?: string,
  elementProfile?: string,
  organization?: Organization
) {
  const q = profile.tiers[site.tier];
  const sampled = organization ?? sampleOrganization(seed, site);
  // Organization edits never reselect the upper-level content/presentation binding.
  const selected = (pattern && pattern !== sampled.id && q.rules.find((r) => r.id === pattern)) || sampled;
  const curved = sampled.id === "connected" && "branchShape" in sampled && sampled.branchShape === "curve";
  const elementId = elementProfile ?? sampled.elementProfile;
  const element = (profile.elementProfiles as Record<string, ElementProfile>)[elementId];
  if (!element) throw new Error("缺少空间元素配置：" + elementId);
  const dimensions = element.tiers?.[site.tier] ?? element;
  const width = dimensions.width ?? element.width ?? q.width,
    depth = dimensions.depth ?? element.depth ?? q.depth,
    height = dimensions.height ?? element.height ?? q.height;
  const sample = (key: string, range: number[]) =>
    range[0] + (range[1] - range[0]) * settlementRandom(seed, `profile:${profile.version}:${site.id}:${key}`);
  const rule: LayoutRule = {
    pattern: pattern ?? element.pattern ?? selected.id,
    radiusM: 0,
    spacingMinM: (curved ? profile.connectedCurve.spacingM : q.spacingM)[0],
    spacingMaxM: (curved ? profile.connectedCurve.spacingM : q.spacingM)[1],
    widthMinM: width[0],
    widthMaxM: width[1],
    depthMinM: depth[0],
    depthMaxM: depth[1],
    heightMinM: height[0],
    heightMaxM: height[1],
    orientationVariation: curved ? sample("orientation", profile.connectedCurve.orientationVariation) : 1,
    branchShape: curved ? "curve" : "radial",
    curveBendM: sample("curve-bend", profile.connectedCurve.bendM),
    curveHeadingDegrees: sample("curve-heading", [0, 180]),
    curveGapM: sample("curve-gap", profile.connectedCurve.gapM),
    curveLateralVariationM: sample("curve-lateral", profile.connectedCurve.lateralM),
    ...profile.randomness,
    pathWidthM: 3,
    roadMode: sampled.roadMode as LayoutRule["roadMode"],
    openRadiusM: layoutRule(pattern ?? element.pattern ?? selected.id).defaults?.openRadiusM ?? 0,
    maxGroundSlopeDegrees: element.maxGroundSlopeDegrees ?? 90,
    roadAccess: true
  };
  return {
    rule,
    elementProfile: elementId,
    exclusions: element.exclusions,
    presentation: element.presentation,
    terrainPlacement: element.terrainPlacement,
    version: element.version
  };
}
