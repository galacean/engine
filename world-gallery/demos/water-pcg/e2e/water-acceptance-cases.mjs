export const FIXED_ACCEPTANCE_ENVIRONMENT = Object.freeze({
  viewport: Object.freeze({ width: 1280, height: 720 }),
  deviceScaleFactor: 1,
  quality: "high",
  surfaceTime: 12.5,
  seed: 20260723,
  statsEnabled: false
});

export const WATER_SHOWCASE_CASES = Object.freeze([
  Object.freeze({
    id: "showcase-river",
    label: "River Showcase",
    group: "showcase",
    runtime: "river",
    preset: "hero-river"
  }),
  Object.freeze({
    id: "showcase-pool",
    label: "Pool Showcase",
    group: "showcase",
    runtime: "pool",
    preset: "hero-pool"
  }),
  Object.freeze({
    id: "showcase-ocean",
    label: "Ocean Showcase",
    group: "showcase",
    runtime: "ocean",
    preset: "hero-ocean"
  }),
  Object.freeze({
    id: "showcase-grasslands-stylized-water",
    label: "Grasslands Stylized Water Showcase",
    group: "showcase",
    runtime: "grasslands",
    preset: "hero-grasslands"
  })
]);

export const WATER_FEATURE_CASES = Object.freeze([
  Object.freeze({
    id: "feature-refraction",
    label: "Refraction",
    group: "feature",
    runtime: "optics-lab",
    preset: "refraction-correctness"
  }),
  Object.freeze({
    id: "feature-reflection",
    label: "Reflection",
    group: "feature",
    runtime: "optics-lab",
    preset: "reflection-correctness"
  }),
  Object.freeze({
    id: "feature-ripples",
    label: "Interactive Ripples",
    group: "feature",
    runtime: "pool",
    preset: "ripples"
  }),
  Object.freeze({
    id: "feature-wake-foam",
    label: "Wake and Foam",
    group: "feature",
    runtime: "pool",
    preset: "wake-foam"
  }),
  Object.freeze({
    id: "feature-underwater",
    label: "Underwater",
    group: "feature",
    runtime: "pool",
    preset: "underwater"
  }),
  Object.freeze({
    id: "feature-buoyancy",
    label: "Buoyancy",
    group: "feature",
    runtime: "buoyancy",
    preset: "static-single"
  }),
  Object.freeze({
    id: "feature-current-drift",
    label: "Current Drift",
    group: "feature",
    runtime: "buoyancy",
    preset: "river-drift"
  }),
  Object.freeze({
    id: "feature-gerstner-waves",
    label: "Gerstner Waves",
    group: "feature",
    runtime: "ocean",
    preset: "gerstner-waves"
  }),
  Object.freeze({
    id: "feature-ocean-nearshore-waves",
    label: "Ocean Nearshore Waves",
    group: "feature",
    runtime: "ocean",
    preset: "ocean-nearshore-waves"
  }),
  Object.freeze({
    id: "feature-ocean-breakers",
    label: "Ocean Breakers",
    group: "feature",
    runtime: "ocean",
    preset: "ocean-breakers"
  }),
  Object.freeze({
    id: "feature-ocean-shore-foam",
    label: "Ocean Shore Foam",
    group: "feature",
    runtime: "ocean",
    preset: "ocean-shore-foam"
  }),
  Object.freeze({
    id: "feature-ocean-rock-contact",
    label: "Ocean Rock Contact",
    group: "feature",
    runtime: "ocean",
    preset: "ocean-rock-contact"
  }),
  Object.freeze({
    id: "feature-ocean-micro-surface",
    label: "Ocean Micro Surface",
    group: "feature",
    runtime: "ocean",
    preset: "ocean-micro-surface"
  }),
  Object.freeze({
    id: "feature-ocean-wetness",
    label: "Ocean Wetness",
    group: "feature",
    runtime: "ocean",
    preset: "ocean-wetness"
  }),
  Object.freeze({
    id: "feature-shore-foam",
    label: "Shore Foam",
    group: "feature",
    runtime: "heightfield",
    preset: "shore-foam"
  }),
  Object.freeze({
    id: "feature-heightfield",
    label: "Heightfield",
    group: "feature",
    runtime: "heightfield",
    preset: "heightfield"
  }),
  Object.freeze({
    id: "feature-river-confluence",
    label: "River Confluence",
    group: "feature",
    runtime: "river",
    preset: "river-confluence"
  })
]);

export const WATER_ACCEPTANCE_CASES = Object.freeze([...WATER_SHOWCASE_CASES, ...WATER_FEATURE_CASES]);

const ACCEPTANCE_CASE_BY_ID = new Map(WATER_ACCEPTANCE_CASES.map((definition) => [definition.id, definition]));

export function getWaterAcceptanceCase(caseId) {
  return ACCEPTANCE_CASE_BY_ID.get(caseId);
}
