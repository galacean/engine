import catalog from "./semantic-units.json";
import rawProfile from "./wayfinding-profile.json";

export type GuidanceRole = "destination" | "landmark" | "breadcrumb";
export interface NumericRange {
  min: number;
  max: number;
}
export type SupportState = "active" | "legacy-experiment" | "data-only";
export interface WayfindingProfile {
  version: number;
  id: string;
  status: "data-only";
  basis: string;
  actorSpeedRef: "actor.walkMps";
  distanceMetric: "shortest-reachable-path-between-entrances";
  roles: { id: GuidanceRole; label: string; spacingWalkSeconds: NumericRange; intent: string }[];
  routeCoverage: {
    distanceMetric: "arc-length-along-reachable-route";
    intervalRole: "breadcrumb";
    lateralOffsetFromRoadEdgeM: NumericRange;
    offsetMeasures: "nearest-proxy-footprint-edge-to-road-boundary";
    sidePolicy: "alternate-or-compose";
    onBlocked: "skip-and-record-uncovered-interval";
  };
  visibility: { initialState: "unverified"; distanceAloneIsEvidence: false; requiredEvidence: string[] };
  proxies: {
    id: string;
    unitId: string;
    componentUnitIds?: string[];
    guidanceRoles: GuidanceRole[];
    moduleProfile?: string;
    geometrySource: "unit-module";
    geometryStatus: SupportState;
    guidanceStatus: "data-only";
    shape: string;
    note?: string;
  }[];
}
export interface PointM {
  x: number;
  y: number;
  z: number;
}
export interface FootprintPointM {
  x: number;
  z: number;
}
/** Body occupancy belongs to the semantic module. A role never silently resizes it. */
export interface WayfindingGeometry {
  units: "metres";
  footprint: FootprintPointM[];
  baseYM: number;
  heightM: number;
  yawRadians: number;
}
export interface WayfindingEntrance {
  id: string;
  positionM: PointM;
  approachDirectionXZ: { x: number; z: number };
  reachableRouteNodeId?: string;
}
export interface VisibleFeature {
  id: string;
  label: string;
  geometry: WayfindingGeometry;
  aimPointM: PointM;
}
/** Unit identity, composition and guidance roles are orthogonal; the same unit may serve several roles. */
export interface WayfindingInstance {
  id: string;
  unitId: string;
  proxyId: string;
  guidanceRoles: GuidanceRole[];
  ownerModuleId: string;
  componentInstanceIds: string[];
  body: WayfindingGeometry;
  anchorM: PointM;
  entrances: WayfindingEntrance[];
  visibleFeatures: VisibleFeature[];
  visualAims: {
    observerAnchorId: string;
    featureId: string;
    intent: "attract" | "lead" | "reveal";
    visibility: VisibilityEvidence;
  }[];
}
export type VisibilityEvidence =
  | { state: "unverified"; reason: string }
  | {
      state: "verified";
      observerPoseId: string;
      cameraProjectionId: string;
      occlusionQueryId: string;
      featureId: string;
      visibleFraction: number;
    }
  | {
      state: "occluded";
      observerPoseId: string;
      cameraProjectionId: string;
      occlusionQueryId: string;
      featureId: string;
    };
/** A disconnected route has no finite distance; never substitute centre-to-centre distance. */
export type EntrancePathRelation =
  | { fromEntranceId: string; toEntranceId: string; state: "unresolved" | "unreachable" }
  | {
      fromEntranceId: string;
      toEntranceId: string;
      state: "reachable";
      routeIds: string[];
      pathLengthM: number;
      walkSeconds: number;
      walkMps: number;
    };
export interface RouteCoverageSample {
  routeId: string;
  arcLengthM: number;
  side: "left" | "right";
  edgeOffsetM: number;
  instanceId?: string;
  status: "planned" | "blocked" | "unverified";
}

/** Convert design-time travel duration into metric spacing.
 * @param range Authored walking duration bounds in seconds.
 * @param actor Shared design walking speed in metres per second.
 * @returns Equivalent metric distance bounds; no runtime movement is observed.
 */
export function walkSecondsToMetres(range: NumericRange, actor: { walkMps: number }): NumericRange {
  validateRange(range, "walkSeconds", true);
  if (!Number.isFinite(actor.walkMps) || actor.walkMps <= 0) throw new Error("actor.walkMps must be positive");
  return { min: range.min * actor.walkMps, max: range.max * actor.walkMps };
}
/** Resolve a guidance role's path spacing from the active actor metric.
 * @param role Visual or route guidance role.
 * @param actor Shared actor design speed.
 * @param profile Authored guidance data.
 * @returns Target path-length interval in metres, not a visibility guarantee.
 */
export function resolveGuidanceSpacing(
  role: GuidanceRole,
  actor: { walkMps: number },
  profile: WayfindingProfile = WAYFINDING_PROFILE
): NumericRange {
  const definition = profile.roles.find((value) => value.id === role);
  if (!definition) throw new Error(`Unknown guidance role: ${role}`);
  return walkSecondsToMetres(definition.spacingWalkSeconds, actor);
}
function validateRange(value: NumericRange, path: string, positive = false): void {
  if (
    !value ||
    !Number.isFinite(value.min) ||
    !Number.isFinite(value.max) ||
    (positive ? value.min <= 0 : value.min < 0) ||
    value.max < value.min
  )
    throw new Error(`Invalid wayfinding range: ${path}`);
}
/** Validate catalogue references and design ranges before resolving placement policy.
 * @param profile Proposed guidance configuration.
 * @param unitIds IDs from the shared semantic unit catalogue.
 * @throws When ranges, role references or semantic units are invalid.
 */
export function validateWayfindingProfile(
  profile: WayfindingProfile,
  unitIds: ReadonlySet<string> = new Set(catalog.units.map((unit) => unit.id))
): void {
  if (
    profile.version !== 1 ||
    !profile.id ||
    profile.status !== "data-only" ||
    profile.actorSpeedRef !== "actor.walkMps" ||
    profile.distanceMetric !== "shortest-reachable-path-between-entrances"
  )
    throw new Error("Invalid wayfinding profile metadata");
  const roles = new Set<string>();
  for (const role of profile.roles) {
    if (!["destination", "landmark", "breadcrumb"].includes(role.id) || roles.has(role.id))
      throw new Error(`Invalid or duplicate guidance role: ${role.id}`);
    roles.add(role.id);
    validateRange(role.spacingWalkSeconds, role.id + ".spacingWalkSeconds", true);
  }
  if (roles.size !== 3) throw new Error("Missing guidance role");
  if (profile.routeCoverage.intervalRole !== "breadcrumb") throw new Error("Invalid route coverage role");
  validateRange(profile.routeCoverage.lateralOffsetFromRoadEdgeM, "lateralOffsetFromRoadEdgeM");
  if (
    profile.routeCoverage.distanceMetric !== "arc-length-along-reachable-route" ||
    profile.routeCoverage.offsetMeasures !== "nearest-proxy-footprint-edge-to-road-boundary" ||
    profile.routeCoverage.onBlocked !== "skip-and-record-uncovered-interval"
  )
    throw new Error("Invalid route coverage distance policy");
  if (
    profile.visibility.initialState !== "unverified" ||
    profile.visibility.distanceAloneIsEvidence !== false ||
    !["observer-pose", "camera-projection", "occlusion-query", "visible-feature"].every((key) =>
      profile.visibility.requiredEvidence.includes(key)
    )
  )
    throw new Error("Visibility requires observer, camera, occlusion and feature evidence");
  const ids = new Set<string>();
  for (const proxy of profile.proxies) {
    if (!proxy.id || ids.has(proxy.id)) throw new Error(`Invalid or duplicate wayfinding proxy: ${proxy.id}`);
    ids.add(proxy.id);
    for (const unit of [proxy.unitId, ...(proxy.componentUnitIds ?? [])])
      if (!unitIds.has(unit)) throw new Error(`Unknown semantic unit: ${unit}`);
    if (
      !proxy.guidanceRoles.length ||
      proxy.guidanceRoles.some((role) => !roles.has(role)) ||
      new Set(proxy.guidanceRoles).size !== proxy.guidanceRoles.length
    )
      throw new Error(`Invalid proxy guidance roles: ${proxy.id}`);
    if (
      proxy.geometrySource !== "unit-module" ||
      !["active", "legacy-experiment", "data-only"].includes(proxy.geometryStatus) ||
      proxy.guidanceStatus !== "data-only"
    )
      throw new Error(`Invalid proxy support state: ${proxy.id}`);
  }
}
validateWayfindingProfile(rawProfile as WayfindingProfile);
export const WAYFINDING_PROFILE: WayfindingProfile = rawProfile as WayfindingProfile;
