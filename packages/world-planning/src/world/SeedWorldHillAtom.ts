/** Public parameters for one authored compact-cosine hill. */
export interface SeedWorldHillAtomParameters {
  /** Broad pedestal uplift above the original terrain, in metres. */
  readonly pedestalLiftMetres: number;
  /** Major-axis radius of the full terrain influence, in metres. */
  readonly influenceMajorRadiusMetres: number;
  /** Local summit relief above the pedestal, in metres. */
  readonly peakReliefMetres: number;
  /** Major-axis radius of the visible hill body, in metres. */
  readonly bodyMajorRadiusMetres: number;
}

/** One public parameter changed by physical slope normalization. */
export interface SeedWorldHillAtomAdjustment {
  /** Public parameter whose requested value could not be retained. */
  readonly parameter: keyof SeedWorldHillAtomParameters;
  /** Value supplied before physical normalization. */
  readonly requested: number;
  /** Value used by terrain sampling. */
  readonly resolved: number;
  /** Stable machine-readable explanation for the adjustment. */
  readonly reason: "relief-slope-limit" | "pedestal-slope-limit" | "body-support" | "influence-support";
}

/** Hill shape consumed by deterministic terrain sampling after minor radii are derived. */
export interface SeedWorldHillAtomShape extends SeedWorldHillAtomParameters {
  /** Derived minor-axis radius of the visible hill body, in metres. */
  readonly bodyMinorRadiusMetres: number;
  /** Derived minor-axis radius of the broad terrain influence, in metres. */
  readonly influenceMinorRadiusMetres: number;
}

/** Fully resolved hill request including any public parameter adjustments. */
export interface SeedWorldResolvedHillAtom extends SeedWorldHillAtomShape {
  /** Public values changed to preserve the hill's slope envelopes. */
  readonly adjustments: readonly Readonly<SeedWorldHillAtomAdjustment>[];
}

/** Planner-derived short-axis supports consumed by the same hill resolver used for authored hills. */
export interface SeedWorldHillAtomSupportRadii {
  /** Candidate minor-axis radius of the visible hill body, in metres. */
  readonly bodyMinorRadiusMetres: number;
  /** Candidate minor-axis radius of the broad terrain influence, in metres. */
  readonly influenceMinorRadiusMetres: number;
}

/** Inclusive public ranges exposed to authoring clients. */
export const SEED_WORLD_HILL_ATOM_LIMITS = Object.freeze({
  pedestalLiftMetres: Object.freeze({ minimum: 0, maximum: 220 }),
  influenceMajorRadiusMetres: Object.freeze({ minimum: 300, maximum: 1_800 }),
  peakReliefMetres: Object.freeze({ minimum: 30, maximum: 280 }),
  bodyMajorRadiusMetres: Object.freeze({ minimum: 100, maximum: 900 })
});

/** Natural default used when an authoring client omits one or more hill parameters. */
export const SEED_WORLD_DEFAULT_HILL_ATOM_PARAMETERS: Readonly<SeedWorldHillAtomParameters> = Object.freeze({
  pedestalLiftMetres: 40,
  influenceMajorRadiusMetres: 660,
  peakReliefMetres: 76,
  bodyMajorRadiusMetres: 300
});

/** Maximum local summit slope used by both generated and authored hills. */
export const SEED_WORLD_HILL_RELIEF_MAXIMUM_SLOPE_DEGREES = 24;

/** Maximum broad pedestal slope used by both generated and authored hills. */
export const SEED_WORLD_HILL_PEDESTAL_MAXIMUM_SLOPE_DEGREES = 9;

/**
 * Resolves a public hill request into a physically bounded ellipse pair.
 * @param parameters Public values; omitted fields use the natural hill defaults.
 * @param supportRadii Optional planner-derived short axes. Authoring calls omit this internal terrain input.
 * @returns Immutable public values, derived minor radii, and any public-value adjustments.
 * @throws {RangeError} When a supplied value is non-finite or outside its public range.
 */
export function resolveSeedWorldHillAtom(
  parameters?: Partial<Readonly<SeedWorldHillAtomParameters>>
): Readonly<SeedWorldResolvedHillAtom>;
export function resolveSeedWorldHillAtom(
  parameters: Readonly<SeedWorldHillAtomParameters>,
  supportRadii: Readonly<SeedWorldHillAtomSupportRadii>
): Readonly<SeedWorldResolvedHillAtom>;
export function resolveSeedWorldHillAtom(
  parameters: Partial<Readonly<SeedWorldHillAtomParameters>> = {},
  supportRadii?: Readonly<SeedWorldHillAtomSupportRadii>
): Readonly<SeedWorldResolvedHillAtom> {
  const enforceAuthoringLimits = supportRadii === undefined;
  const requested = Object.freeze({
    pedestalLiftMetres: requireHillParameter(
      "pedestalLiftMetres",
      parameters.pedestalLiftMetres ?? SEED_WORLD_DEFAULT_HILL_ATOM_PARAMETERS.pedestalLiftMetres,
      enforceAuthoringLimits
    ),
    influenceMajorRadiusMetres: requireHillParameter(
      "influenceMajorRadiusMetres",
      parameters.influenceMajorRadiusMetres ?? SEED_WORLD_DEFAULT_HILL_ATOM_PARAMETERS.influenceMajorRadiusMetres,
      enforceAuthoringLimits
    ),
    peakReliefMetres: requireHillParameter(
      "peakReliefMetres",
      parameters.peakReliefMetres ?? SEED_WORLD_DEFAULT_HILL_ATOM_PARAMETERS.peakReliefMetres,
      enforceAuthoringLimits
    ),
    bodyMajorRadiusMetres: requireHillParameter(
      "bodyMajorRadiusMetres",
      parameters.bodyMajorRadiusMetres ?? SEED_WORLD_DEFAULT_HILL_ATOM_PARAMETERS.bodyMajorRadiusMetres,
      enforceAuthoringLimits
    )
  });

  const bodyMinorRadiusMetres = clamp(
    Math.max(
      supportRadii
        ? requireSupportRadius("bodyMinorRadiusMetres", supportRadii.bodyMinorRadiusMetres)
        : requested.bodyMajorRadiusMetres * 0.55,
      seedWorldCompactCosineRadiusForSlope(requested.peakReliefMetres, SEED_WORLD_HILL_RELIEF_MAXIMUM_SLOPE_DEGREES)
    ),
    80,
    700
  );
  const peakReliefMetres = Math.min(
    requested.peakReliefMetres,
    seedWorldCompactCosineAmplitudeForSlope(bodyMinorRadiusMetres, SEED_WORLD_HILL_RELIEF_MAXIMUM_SLOPE_DEGREES)
  );
  const bodyMajorRadiusMetres = Math.max(requested.bodyMajorRadiusMetres, bodyMinorRadiusMetres * 1.1);
  const provisionalInfluenceMajorRadiusMetres = Math.max(requested.influenceMajorRadiusMetres, bodyMajorRadiusMetres);
  const influenceMinorRadiusMetres = supportRadii
    ? Math.max(
        bodyMinorRadiusMetres,
        requireSupportRadius("influenceMinorRadiusMetres", supportRadii.influenceMinorRadiusMetres)
      )
    : clamp(
        Math.max(
          bodyMinorRadiusMetres,
          provisionalInfluenceMajorRadiusMetres * (bodyMinorRadiusMetres / bodyMajorRadiusMetres),
          seedWorldCompactCosineRadiusForSlope(
            requested.pedestalLiftMetres,
            SEED_WORLD_HILL_PEDESTAL_MAXIMUM_SLOPE_DEGREES
          )
        ),
        bodyMinorRadiusMetres,
        1_200
      );
  const pedestalLiftMetres = Math.min(
    requested.pedestalLiftMetres,
    seedWorldCompactCosineAmplitudeForSlope(influenceMinorRadiusMetres, SEED_WORLD_HILL_PEDESTAL_MAXIMUM_SLOPE_DEGREES)
  );
  const influenceMajorRadiusMetres = Math.max(provisionalInfluenceMajorRadiusMetres, influenceMinorRadiusMetres);
  const adjustments = Object.freeze(
    [
      adjustment("peakReliefMetres", requested.peakReliefMetres, peakReliefMetres, "relief-slope-limit"),
      adjustment("bodyMajorRadiusMetres", requested.bodyMajorRadiusMetres, bodyMajorRadiusMetres, "body-support"),
      adjustment("pedestalLiftMetres", requested.pedestalLiftMetres, pedestalLiftMetres, "pedestal-slope-limit"),
      adjustment(
        "influenceMajorRadiusMetres",
        requested.influenceMajorRadiusMetres,
        influenceMajorRadiusMetres,
        "influence-support"
      )
    ].filter((entry): entry is SeedWorldHillAtomAdjustment => entry !== undefined)
  );

  return Object.freeze({
    pedestalLiftMetres,
    influenceMajorRadiusMetres,
    peakReliefMetres,
    bodyMajorRadiusMetres,
    bodyMinorRadiusMetres,
    influenceMinorRadiusMetres,
    adjustments
  });
}

/**
 * Samples one resolved hill relative to its centre.
 * @param hill Resolved hill parameters and derived radii.
 * @param headingDegrees Major-axis world heading where 0 is north (-Z) and 90 is east (+X).
 * @param xOffsetMetres World-X offset from the hill centre, in metres.
 * @param zOffsetMetres World-Z offset from the hill centre, in metres.
 * @returns Additive terrain uplift in metres; zero outside the influence ellipse.
 */
export function sampleSeedWorldHillAtomDeltaMetres(
  hill: Readonly<SeedWorldHillAtomShape>,
  headingDegrees: number,
  xOffsetMetres: number,
  zOffsetMetres: number
): number {
  const headingRadians = (headingDegrees / 180) * Math.PI;
  const majorX = Math.sin(headingRadians);
  const majorZ = -Math.cos(headingRadians);
  const minorX = -majorZ;
  const minorZ = majorX;
  const localMajor = xOffsetMetres * majorX + zOffsetMetres * majorZ;
  const localMinor = xOffsetMetres * minorX + zOffsetMetres * minorZ;
  const pedestalRadius = Math.hypot(
    localMajor / hill.influenceMajorRadiusMetres,
    localMinor / hill.influenceMinorRadiusMetres
  );
  const bodyRadius = Math.hypot(localMajor / hill.bodyMajorRadiusMetres, localMinor / hill.bodyMinorRadiusMetres);
  return (
    hill.pedestalLiftMetres * sampleSeedWorldCompactCosine(pedestalRadius) +
    hill.peakReliefMetres * sampleSeedWorldCompactCosine(bodyRadius)
  );
}

/**
 * Samples the compact-cosine profile shared by generated and authored hills.
 * @param normalizedRadius Elliptical radius where zero is the centre and one is the support boundary.
 * @returns Profile weight in the inclusive range zero to one.
 */
export function sampleSeedWorldCompactCosine(normalizedRadius: number): number {
  if (!Number.isFinite(normalizedRadius) || normalizedRadius >= 1) return 0;
  return 0.5 * (1 + Math.cos(Math.PI * Math.max(0, normalizedRadius)));
}

/**
 * Computes the support radius needed for a compact-cosine amplitude and slope envelope.
 * @param amplitudeMetres Vertical amplitude in metres.
 * @param maximumSlopeDegrees Maximum permitted slope in degrees.
 * @returns Minimum support radius in metres.
 */
export function seedWorldCompactCosineRadiusForSlope(amplitudeMetres: number, maximumSlopeDegrees: number): number {
  return (amplitudeMetres * Math.PI) / (2 * Math.tan((maximumSlopeDegrees * Math.PI) / 180));
}

/**
 * Computes the compact-cosine amplitude supported by a radius and slope envelope.
 * @param radiusMetres Support radius in metres.
 * @param maximumSlopeDegrees Maximum permitted slope in degrees.
 * @returns Maximum vertical amplitude in metres.
 */
export function seedWorldCompactCosineAmplitudeForSlope(radiusMetres: number, maximumSlopeDegrees: number): number {
  return (radiusMetres * Math.tan((maximumSlopeDegrees * Math.PI) / 180) * 2) / Math.PI;
}

function requireHillParameter(
  parameter: keyof SeedWorldHillAtomParameters,
  value: number,
  enforceAuthoringLimits: boolean
): number {
  const limits = SEED_WORLD_HILL_ATOM_LIMITS[parameter];
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`Seed World hill ${parameter} must be finite and non-negative`);
  }
  if (enforceAuthoringLimits && (value < limits.minimum || value > limits.maximum)) {
    throw new RangeError(`Seed World hill ${parameter} must remain within ${limits.minimum}-${limits.maximum}`);
  }
  return value;
}

function requireSupportRadius(parameter: keyof SeedWorldHillAtomSupportRadii, value: number): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`Seed World hill ${parameter} must be positive`);
  return value;
}

function adjustment(
  parameter: keyof SeedWorldHillAtomParameters,
  requested: number,
  resolved: number,
  reason: SeedWorldHillAtomAdjustment["reason"]
): SeedWorldHillAtomAdjustment | undefined {
  return Math.abs(requested - resolved) < 1e-9 ? undefined : Object.freeze({ parameter, requested, resolved, reason });
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
