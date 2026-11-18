/**
 * Named tree-wind controls ordered by the physical energy path.
 *
 * The controls are deliberately weights and dimensionless tuning multipliers. Asset-owned
 * quantities such as branch anchors, stiffness masks and species frequencies remain authoritative;
 * this layer can isolate or tune one response mechanism without invalidating those assets.
 */
export interface TerrainTreeWindResponseControls {
  readonly forcing: TerrainTreeWindForcingControls;
  readonly structure: TerrainTreeWindStructureControls;
  readonly foliage: TerrainTreeWindFoliageControls;
  readonly tuning: TerrainTreeWindTuningControls;
}

/** Independent air-load channels presented to this tree consumer. */
export interface TerrainTreeWindForcingControls {
  /** Weather-smoothed mean flow and the equilibrium lean it creates. */
  readonly meanLoad: number;
  /** Tracking of large-scale changes in the weather-smoothed mean direction. */
  readonly meanDirectionTracking: number;
  /** Travelling finite gust packets. */
  readonly gustPackets: number;
  /** Advected macro/meso/micro wind spectrum. */
  readonly turbulenceSpectrum: number;
  /** Terrain exposure, shelter and analytical local emitters. */
  readonly localField: number;
  /** Direction changes relative to the weather-smoothed mean flow. */
  readonly directionVariation: number;
}

/** Load-to-structure transfer and the connected woody hierarchy. */
export interface TerrainTreeWindStructureControls {
  /** Complete low-frequency root/trunk response. */
  readonly primaryMode: number;
  /** Stateful displacement and velocity relative to the instantaneous target. */
  readonly inertia: number;
  /** Root-clamped continuous trunk mode shape; never disables attachment transport. */
  readonly continuousTrunk: number;
  /** First branch level rotating around its exact parent contact. */
  readonly primaryBranches: number;
  /** Child-branch level rotating in the already-deformed parent frame. */
  readonly secondaryBranches: number;
  /** Causal phase travel from stiff parent structure towards flexible tips. */
  readonly phasePropagation: number;
  /** Energy retained after a falling load, shared by branch recovery. */
  readonly elasticRecovery: number;
  /** Quadratic pressure plus projected-area reduction at high speed. */
  readonly dragReconfiguration: number;
}

/** Motion relative to the fully deformed woody attachment frame. */
export interface TerrainTreeWindFoliageControls {
  /** UE-compatible wind-direction adherence around the exact leaf anchor. */
  readonly directionalAdherence: number;
  /** UE-compatible low-band leaf flip/tumble. */
  readonly tumble: number;
  /** UE-compatible rotation around the baked leaf growth direction. */
  readonly twist: number;
  /** UE-compatible intermittent high-frequency angular response. */
  readonly twitch: number;
  /** UE-compatible positional ripple, root-pinned by the P3 span field. */
  readonly ripple: number;
  /** P3 branch-correlated leaf-cluster roll layered after the UE baseline. */
  readonly clusterRoll: number;
  /** P3 root-to-tip compliance layered after the complete rigid leaf rotation. */
  readonly bladeFlexion: number;
}

/** Dimensionless multipliers around the species/asset calibration. */
export interface TerrainTreeWindTuningControls {
  readonly rootFrequencyScale: number;
  readonly rootDampingScale: number;
  readonly rootTargetSmoothingScale: number;
  /** Multiplier around the species' physically calibrated primary-structure compliance. */
  readonly rootComplianceScale: number;
  /** Multiplier on the species-authored primary bend travel and its mechanical angle limit. */
  readonly rootBendScale: number;
  readonly branchFrequencyScale: number;
  readonly phasePropagationScale: number;
  readonly flutterFrequencyScale: number;
  readonly flutterAmplitudeScale: number;
  /** Share of flutter angle applied to geometry; the remainder is normal-only. */
  readonly flutterGeometryFraction: number;
  /** Multiplier on the species leaf-pressure reference speed; larger values make the petiole less responsive. */
  readonly leafPressureReferenceSpeedScale: number;
  /** Multiplier on the species-authored maximum directional-adherence travel. */
  readonly leafAdherenceAngleScale: number;
  /** Weight of the species-authored high-speed micro-motion suppression. */
  readonly highSpeedMicroSuppression: number;
}

export type TerrainTreeWindResponseControlPath =
  | `forcing.${Extract<keyof TerrainTreeWindForcingControls, string>}`
  | `structure.${Extract<keyof TerrainTreeWindStructureControls, string>}`
  | `foliage.${Extract<keyof TerrainTreeWindFoliageControls, string>}`
  | `tuning.${Extract<keyof TerrainTreeWindTuningControls, string>}`;

export type TerrainTreeWindIsolationPreset =
  | "full"
  | "mean-only"
  | "no-gust"
  | "no-spectrum"
  | "woody-only"
  | "no-direction-variation"
  | "locked-mean-direction";

export const DEFAULT_TERRAIN_TREE_WIND_RESPONSE_CONTROLS: Readonly<TerrainTreeWindResponseControls> =
  deepFreezeTreeWindControls({
    forcing: {
      meanLoad: 1,
      meanDirectionTracking: 1,
      gustPackets: 1,
      turbulenceSpectrum: 1,
      localField: 1,
      directionVariation: 1
    },
    structure: {
      primaryMode: 1,
      inertia: 1,
      continuousTrunk: 1,
      primaryBranches: 1,
      secondaryBranches: 1,
      phasePropagation: 1,
      elasticRecovery: 1,
      dragReconfiguration: 1
    },
    foliage: {
      directionalAdherence: 1,
      tumble: 1,
      twist: 1,
      twitch: 1,
      ripple: 1,
      clusterRoll: 1,
      bladeFlexion: 1
    },
    tuning: {
      rootFrequencyScale: 1,
      rootDampingScale: 1,
      rootTargetSmoothingScale: 1,
      // Multiplier around the species compliance calibrated from its steady-Gale equilibrium
      // travel. One is the physical preset; larger values are explicit presentation overrides.
      rootComplianceScale: 1,
      // Keep the authored species travel unchanged; larger values are presentation overrides.
      rootBendScale: 1,
      branchFrequencyScale: 1,
      phasePropagationScale: 1,
      flutterFrequencyScale: 1,
      flutterAmplitudeScale: 1,
      flutterGeometryFraction: 1,
      leafPressureReferenceSpeedScale: 1,
      leafAdherenceAngleScale: 1,
      highSpeedMicroSuppression: 1
    }
  });

export function cloneTerrainTreeWindResponseControls(
  controls: Readonly<TerrainTreeWindResponseControls> = DEFAULT_TERRAIN_TREE_WIND_RESPONSE_CONTROLS
): TerrainTreeWindResponseControls {
  validateTerrainTreeWindResponseControls(controls);
  return {
    forcing: { ...controls.forcing },
    structure: { ...controls.structure },
    foliage: { ...controls.foliage },
    tuning: { ...controls.tuning }
  };
}

/** Returns a validated copy with exactly one named control changed. */
export function updateTerrainTreeWindResponseControl(
  controls: Readonly<TerrainTreeWindResponseControls>,
  path: TerrainTreeWindResponseControlPath,
  value: number
): TerrainTreeWindResponseControls {
  const [group, name] = path.split(".") as [keyof TerrainTreeWindResponseControls, string];
  const next = cloneTerrainTreeWindResponseControls(controls);
  const target = next[group] as unknown as Record<string, number>;
  if (!(name in target)) throw new RangeError(`Unknown tree wind response control: ${path}`);
  target[name] = value;
  validateTerrainTreeWindResponseControls(next);
  return next;
}

/**
 * Causal A/B presets. Each preset removes one energy path while retaining all unrelated paths,
 * except `mean-only`, which deliberately keeps only the quasi-static load and connected skeleton.
 */
export function createTerrainTreeWindIsolationPreset(
  preset: TerrainTreeWindIsolationPreset
): TerrainTreeWindResponseControls {
  const controls = cloneTerrainTreeWindResponseControls();
  switch (preset) {
    case "full":
      return controls;
    case "mean-only":
      return {
        ...controls,
        forcing: {
          meanLoad: 1,
          meanDirectionTracking: 1,
          gustPackets: 0,
          turbulenceSpectrum: 0,
          localField: 0,
          directionVariation: 0
        },
        structure: {
          ...controls.structure,
          primaryBranches: 0,
          secondaryBranches: 0,
          phasePropagation: 0,
          elasticRecovery: 0
        },
        foliage: {
          directionalAdherence: 0,
          tumble: 0,
          twist: 0,
          twitch: 0,
          ripple: 0,
          clusterRoll: 0,
          bladeFlexion: 0
        }
      };
    case "no-gust":
      return { ...controls, forcing: { ...controls.forcing, gustPackets: 0 } };
    case "no-spectrum":
      return { ...controls, forcing: { ...controls.forcing, turbulenceSpectrum: 0 } };
    case "woody-only":
      return {
        ...controls,
        foliage: {
          directionalAdherence: 0,
          tumble: 0,
          twist: 0,
          twitch: 0,
          ripple: 0,
          clusterRoll: 0,
          bladeFlexion: 0
        }
      };
    case "no-direction-variation":
      return { ...controls, forcing: { ...controls.forcing, directionVariation: 0 } };
    case "locked-mean-direction":
      return {
        ...controls,
        forcing: { ...controls.forcing, meanDirectionTracking: 0, directionVariation: 0 }
      };
  }
}

export function validateTerrainTreeWindResponseControls(controls: Readonly<TerrainTreeWindResponseControls>): void {
  if (!controls || typeof controls !== "object") throw new TypeError("Tree wind response controls are required");
  validateUnitControls("forcing", controls.forcing);
  validateUnitControls("structure", controls.structure);
  validateUnitControls("foliage", controls.foliage);
  validateScale("rootFrequencyScale", controls.tuning.rootFrequencyScale, 0.25, 2.5);
  validateScale("rootDampingScale", controls.tuning.rootDampingScale, 0.25, 2.5);
  validateScale("rootTargetSmoothingScale", controls.tuning.rootTargetSmoothingScale, 0.25, 3);
  validateScale("rootComplianceScale", controls.tuning.rootComplianceScale, 0.25, 6);
  validateScale("rootBendScale", controls.tuning.rootBendScale, 0, 2.5);
  validateScale("branchFrequencyScale", controls.tuning.branchFrequencyScale, 0.25, 2.5);
  validateScale("phasePropagationScale", controls.tuning.phasePropagationScale, 0, 2.5);
  validateScale("flutterFrequencyScale", controls.tuning.flutterFrequencyScale, 0.25, 2.5);
  validateScale("flutterAmplitudeScale", controls.tuning.flutterAmplitudeScale, 0, 2);
  validateScale("flutterGeometryFraction", controls.tuning.flutterGeometryFraction, 0, 1);
  validateScale("leafPressureReferenceSpeedScale", controls.tuning.leafPressureReferenceSpeedScale, 0.5, 2);
  validateScale("leafAdherenceAngleScale", controls.tuning.leafAdherenceAngleScale, 0, 2);
  validateScale("highSpeedMicroSuppression", controls.tuning.highSpeedMicroSuppression, 0, 1);
}

function validateUnitControls(label: string, controls: object): void {
  if (!controls || typeof controls !== "object") throw new TypeError(`Tree wind ${label} controls are required`);
  for (const [name, value] of Object.entries(controls)) validateScale(`${label}.${name}`, value, 0, 1);
}

function validateScale(name: string, value: number, minimum: number, maximum: number): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`Tree wind ${name} must be finite and within [${minimum}, ${maximum}]`);
  }
}

function deepFreezeTreeWindControls(
  controls: TerrainTreeWindResponseControls
): Readonly<TerrainTreeWindResponseControls> {
  Object.freeze(controls.forcing);
  Object.freeze(controls.structure);
  Object.freeze(controls.foliage);
  Object.freeze(controls.tuning);
  return Object.freeze(controls);
}
