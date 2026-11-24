import type { TemplateNode, TemplateAssetSlot } from "./WorldTemplateGeometry";
import { resolveRockCollisionPolicy, type RockCollisionPolicy } from "./RockCollisionPolicy";
import type { TemplateProceduralPlantInstance } from "./runtime/TemplateProceduralPlants";
import type { SeedWorldCameraBookmark } from "../world/SeedWorldCameraBookmark";
import type { SpatialCompositionParameters } from "./SpatialCompositionParameters";
import { WORLD_TEMPLATE_CONFIGS } from "./WorldTemplateConfig";
import templateWildlife from "../planning-data/template-wildlife.json";
import { LOW_POLY_VALLEY } from "./world-templates/LowPolyValley";
import {
  OASIS_BANK_PLANTS,
  OASIS_BANK_STONES,
  OASIS_SANDBARS,
  OASIS_SHORELINE
} from "./world-templates/OasisFloodplain";

export interface WorldTemplatePalette {
  grass: [string, string];
  ground: string;
  road?: string;
  foliage: string;
  /** Leaf colours keyed by native species identity, independent of catalog order. */
  treeFoliage?: Readonly<Record<string, string>>;
  /** Per-part HDR colours for native vegetation layers; species accents retain every model variant. */
  plantPalette?: {
    layers: readonly string[];
    parts: Readonly<Record<string, { color: string; intensity: number }>>;
    species?: Readonly<Record<string, Readonly<Record<string, { color: string; intensity: number }>>>>;
    /** Exact native material slots override the part palette, including slots outside its layers. */
    slots?: Readonly<Record<string, Readonly<Record<string, { color: string; intensity: number }>>>>;
  };
  bark: string;
  flowers: string;
  stone: string;
  /** Optional lighter tint used for shared shoreline stones and monoliths while cliffs keep `stone`. */
  shoreStone?: string;
}

/** Authored scene measurements from the supplied references.
 * These are template inputs, not geometry guessed from a Seed or renderer output.
 * Each model entry defines an asset envelope, with a supplied model when available.
 * Camera fitting uses only the focus entries. */
export type WorldTemplateArtDirection = Partial<WorldTemplatePalette> & {
  reference: string;
  /** Optional per-template rock/prop collision threshold override (falls back to DEFAULT_ROCK_COLLISION_POLICY). */
  rockCollision?: Partial<RockCollisionPolicy>;
  grassGroundFusion?: boolean;
  /** Name of the equivalent opaque vertex-color material shared by the template's model assets. */
  sharedVertexColorMaterial?: string;
  spawn?: SeedWorldCameraBookmark & { readonly seed: number };
  initialPlanning?: {
    landMode?: import("../semantic-study/IslandPlanModel").IslandPlanParameters["landMode"];
    relief?: {
      reliefNearAmplitudeM: number;
      reliefAmplitudeM: number;
      reliefFarAmplitudeM: number;
      reliefScaleM: number;
    };
    roadsEnabled?: boolean;
    farmingEnabled?: boolean;
    poiMemberMax?: number;
    layout?: Partial<import("./layout/LayoutRules").LayoutRule>;
    wayfinding?: import("./guidance/WayfindingPolicy").WayfindingPolicyInput;
    population?: import("./PlanningPopulationParameters").PlanningPopulationOptions;
  };
  focus: string[];
  /** Viewport fraction available to the focus envelope. Wide shots can frame into an oversized envelope. */
  frameFraction: number;
  /** Reserve each subject in a solved POI and publish a clear starting view. */
  plannedSubjects?: boolean;
  /** Standing spawn relative to the authored scene anchor in screen-right X and forward Z metres. */
  spawnOffset?: [number, number];
  /** A continuous world framed from its map centre instead of a searched spawn. */
  centeredStart?: boolean;
  azimuthDegrees: number;
  /** Composition aim relative to the focus envelope; a side subject stays at the side. */
  lookAtOffset?: [number, number, number];
  models: (TemplateNode | TemplateAssetSlot)[];
  /** Optional deterministic per-Seed model layout while keeping `models` as the canonical default roster. */
  resolveModels?: (seed: number) => (TemplateNode | TemplateAssetSlot)[];
  /** Optional deterministic per-Seed water bodies while keeping `water` as the canonical optical catalog. */
  resolveWater?: (seed: number) => NonNullable<WorldTemplateArtDirection["water"]>;
  /** Optional deterministic per-Seed procedural plant placements. */
  resolveProceduralPlants?: (seed: number) => TemplateProceduralPlantInstance[];
  /** Optional deterministic per-Seed camera framing overrides. */
  resolveView?: (seed: number) => {
    spawnOffset?: [number, number];
    lookAtOffset?: [number, number, number];
    azimuthDegrees?: number;
    frameFraction?: number;
  };
  surfaceTextures?: {
    baseUrl: string;
    normalUrl?: string;
    microNormalUrl?: string;
    roadPattern?: boolean;
    tileSizeM: number;
    strength: number;
  };
  /** Infrastructure may be generated around a separately authored set of model poses. */
  modelLayout?: "authored" | "generated";
  spores?: {
    count: number;
    center: [number, number, number];
    extent: [number, number, number];
    radiusM: number;
    /** Minimum glow diameter as a fraction of the viewport height. */
    minScreenFraction: number;
    color: string;
    intensity: number;
    driftM: number;
    periodSeconds: number;
  };
  /** Textured native billboard particles; motion and scale use metres and seconds. */
  petals?: {
    textureUrl: string;
    count: number;
    center: [number, number, number];
    extent: [number, number, number];
    sizeM: [number, number];
    lifetimeSeconds: number;
    fallSpeedMps: [number, number];
    windMps: [number, number, number];
    flutterMps: number;
    flutterWavelengthM: number;
    spinDegreesPerSecond: [number, number];
    /** Submission order within the transparent queue. */
    renderPriority: number;
    /** Foreground petals may opt out of scene occlusion while retaining perspective motion. */
    depthTest: boolean;
    color: string;
    intensity: number;
    emission?: { color: string; intensity: number };
  };
  /** 3D wing-flapping ambient butterfly mesh particles spiraling around a focal tree's upper canopy. */
  butterflies?: {
    textureUrl: string;
    count: number;
    center: [number, number, number];
    extent: [number, number, number];
    canopyRatio: number;
    sizeM: [number, number];
    lifetimeSeconds: number;
    flapSpeed: number;
    flutterMps: number;
    flutterWavelengthM: number;
    turnDegreesPerSecond: number;
    color: string;
    intensity: number;
    emissionIntensity: number;
    spiral?: {
      radiusRangeM: [number, number];
      orbitalSpeedRadPerSec: [number, number];
      riseSpeedMps: [number, number];
      radialMps: [number, number];
    };
    trail?: {
      ratePerSecond: number;
      lifetimeSeconds: [number, number];
      sizeM: [number, number];
      color: string;
      intensity: number;
      minScreenFraction?: number;
    };
  };
  /** Scalar authoring only; roads, water, relief and populations are derived. */
  generation?: Partial<SpatialCompositionParameters>;
  lighting: Record<string, number | boolean>;
  postProcess: Record<string, number | boolean>;
  landscape?: Record<string, number>;
  /** Initial density and distribution inputs; subsequent authored controls retain precedence. */
  initialLandscape?: Record<string, number>;
  initialFlowers?: Record<string, number>;
  flowerCoverage?: number;
  weather?: {
    cloudCoverage?: number;
    cloudBaseAltitudeM?: number;
    cloudThicknessM?: number;
    cloudFeatureSize?: number;
    cloudDensityMultiplier?: number;
    cloudEnvelopeScale?: number;
    cloudTopDensityMultiplier?: number;
    cloudDetailNoiseMultiplier?: number;
    cloudAmbientFloor?: number;
    rainRate?: number;
    snowRate?: number;
    temperatureCelsius?: number;
    relativeHumidity?: number;
    surfaceWaterCoverage?: number;
    puddleStorageBias?: number;
    surfaceReflectionIntensity?: number;
    surfaceSsrMix?: number;
    surfaceRoughness?: number;
    standingWaterRoughness?: number;
    surfaceNormalFlattening?: number;
    surfaceRippleStrength?: number;
  };
  /** Optional authored animal population defaults when a template enables fauna. */
  animals?: Record<string, unknown>;
  /** Real native water bodies. Depth/level are independent from their colour. */
  water?: {
    id: string;
    x: number;
    z: number;
    radius: number;
    depth: number;
    color: [number, number, number];
    /** Water column required to develop the full depth tint, in metres. */
    depthTintDistanceM?: number;
    bankWidthM?: number;
    shoreline?: readonly [number, number][];
    holes?: readonly (readonly [number, number])[][];
  }[];
  /** Authored vegetation areas form the reference's core foreground/background. */
  plantings?: {
    id: string;
    kind: "tree" | "shrub" | "flower" | "grass";
    x: number;
    z: number;
    radius: number;
    densityScale: number;
  }[];
  /** Authored stone/monolith OBBs fed through native RockFormation stones pool (`rock-05..29`). */
  stones?: {
    id: string;
    x: number;
    z: number;
    y?: number;
    width: number;
    depth: number;
    height: number;
    yawDegrees?: number;
    collision?: boolean;
    cliff?: boolean;
  }[];
  /** Relative core landforms. Heights and positions remain fixed with the subject. */
  terrain?: {
    id: string;
    x: number;
    z: number;
    kind: "ridge" | "plateau" | "valley" | "basin" | "mountain" | "patch";
    length?: number;
    width?: number;
    radius?: number;
    height: number;
    heading?: number;
  }[];
  /** Optional geographic solar path used by the scene's lighting profile. */
  solarPosition?: {
    latitude?: number;
    dayOfYear?: number;
    northOffset?: number;
  };
  /** Distance fade in metres for wind-rippled terrain surface normals. */
  sandRippleFadeM?: number;
  /** Native procedural GPU-instanced plants (dead-wood desert snags, dry grass, shrubs). */
  proceduralPlants?: TemplateProceduralPlantInstance[];
};
const model = (
  id: string,
  position: [number, number, number],
  scale: [number, number, number],
  grounded = true,
  yaw = 0
): TemplateNode => ({ id, position, scale, grounded, rotation: [0, yaw, 0] });
const lighting = (
  timeHours: number,
  sunIntensity: number,
  ambientIntensity: number,
  skyExposure: number,
  fogDensity: number,
  shadowStrength = 0.7
) => ({
  timeHours,
  sunIntensity,
  ambientIntensity,
  iblIntensity: ambientIntensity,
  skyExposure,
  fogDensity,
  shadowStrength,
  direct: true,
  environment: true,
  shadows: true,
  fog: true
});
const post = (contrast: number, saturation = 0, temperature = 0) => ({
  enabled: true,
  tonemapping: true,
  postExposure: 0,
  contrast,
  saturation,
  temperature,
  bloom: true,
  bloomThreshold: 1,
  bloomIntensity: 0.25,
  bloomScatter: 0.6
});
type Rgb = readonly [number, number, number];
/** Independent atmosphere inputs, measured against each reference's sky rather
 * than copied from its foliage/ground palette. Neutral wavelength controls
 * remove the original profile's interpolated green sunset. Night scattering is
 * a separate native Moon channel: the daytime gradient does not tint it. */
const atmosphere = (zenith: Rgb, horizon: Rgb, moon: Rgb = [1, 1, 1], moonEnergy = 0) => ({
  skyTintR: 0.21404114,
  skyTintG: 0.21404114,
  skyTintB: 0.21404114,
  customSkyTintStrength: 1,
  customSkyZenithR: zenith[0],
  customSkyZenithG: zenith[1],
  customSkyZenithB: zenith[2],
  customSkyHorizonR: horizon[0],
  customSkyHorizonG: horizon[1],
  customSkyHorizonB: horizon[2],
  groundTintR: 0.18,
  groundTintG: 0.18,
  groundTintB: 0.2,
  moonColorR: moon[0],
  moonColorG: moon[1],
  moonColorB: moon[2],
  moonLightIntensity: moonEnergy,
  moonAtmosphereIntensityScale: 4,
  moonDiskIntensity: 1,
  starIntensity: moonEnergy > 0 ? 0.6 : 0,
  twilightIntensity: 0.25,
  airglowIntensity: 0.15,
  fogRadianceIntensity: 1,
  fogTintR: 1,
  fogTintG: 1,
  fogTintB: 1
});
const ridge = (id: string, x: number, z: number, length: number, width: number, height: number, heading = 90) => ({
  id,
  x,
  z,
  length,
  width,
  height,
  heading,
  kind: "ridge" as const
});
const forestMushroom = (id: string, x: number, z: number, height: number, yaw = 0): TemplateNode => ({
  ...model(id, [x, 0, z], [height, height, height], true, yaw),
  footprint: [height * 0.22, height * 0.22],
  assetUrl: new URL("../assets/forest-luminous-mushroom.glb", import.meta.url).href,
  assetLod: {
    url: new URL("../assets/forest-luminous-mushroom-lods.glb", import.meta.url).href,
    screenRelativeHeights: [0.24, 0.1]
  },
  assetMaterials: {
    // A forest-only material variant. The red source GLB and its local emission mask stay intact.
    Mushroom_Tree: {
      emission: { color: "#ffffff", intensity: 15 },
      translucent: {
        shade: "#78ead4",
        highlight: "#adfff2",
        textureExposure: 4,
        transmission: 0.68,
        roughness: 0.48,
        clearCoat: 0.45,
        clearCoatRoughness: 0.2
      }
    }
  }
});
// Measurements after the supplied GLB's node transforms, in source metres.
// The cut rim is slanted; its highest point, rather than the mesh minimum, is the planting plane.
const forestOakRoot = {
  topY: 0.2235571464766295,
  plantingY: 0.007137361742719506,
  halfWidth: 0.034349252409877185,
  halfDepth: 0.03463059992993678
};
const forestOak = (id: string, x: number, z: number, height: number, yaw: number): TemplateNode => ({
  ...model(id, [x, 0, z], [height, height, height * 0.65], true, yaw),
  footprint: [height * 0.065, height * 0.065],
  assetGroundY: forestOakRoot.plantingY,
  groundingFootprint: [
    (2 * forestOakRoot.halfWidth * height) / (forestOakRoot.topY - forestOakRoot.plantingY),
    (2 * forestOakRoot.halfDepth * height) / (forestOakRoot.topY - forestOakRoot.plantingY)
  ],
  assetUrl: new URL("../assets/forest-giant-oak.glb", import.meta.url).href,
  assetLod: {
    url: new URL("../assets/forest-giant-oak-lods.glb", import.meta.url).href,
    // Each Chunk_* spatial sub-volume (trunk + 4 canopy clusters) is tracked independently by its own
    // screen-relative projection, so foreground trunks/lower boughs stay LOD0 while distant/upper chunks step down.
    screenRelativeHeights: [0.55, 0.35]
  },
  assetLeafMaterials: ["Flower_Clusters_512", "Flowers_512"],
  assetLeafColor: "#74a45b"
});
const forestFern = (id: string, x: number, z: number, height: number, yaw: number): TemplateNode => ({
  ...model(id, [x, 0, z], [height * 4, height, height * 4], true, yaw),
  footprint: [height * 0.25, height * 0.25],
  assetUrl: new URL("../assets/forest-fern.glb", import.meta.url).href,
  assetLeafMaterials: ["MI_Ferns"],
  assetLeafColor: "#9cbd4c"
});

const sakura = WORLD_TEMPLATE_CONFIGS["sakura-pearl"]!;
const sakuraSubject = sakura.spawn?.subject;
const templateAssets: Readonly<Record<string, string>> = {
  "pink-tree": new URL("../assets/pink-tree.glb", import.meta.url).href,
  "forest-giant-oak": new URL("../assets/forest-giant-oak.glb", import.meta.url).href,
  "forest-giant-oak-lods": new URL("../assets/forest-giant-oak-lods.glb", import.meta.url).href,
  "sakura-petal": new URL("../assets/sakura-petal.png", import.meta.url).href,
  "oasis-butterflies": new URL("../assets/oasis-butterflies.png", import.meta.url).href
};
const sakuraPetals =
  sakura.petals &&
  (() => {
    const { texture, ...effect } = sakura.petals;
    const textureUrl = templateAssets[texture];
    if (!textureUrl) throw new Error(`未知花瓣粒子贴图：${texture}`);
    return { ...effect, textureUrl };
  })();

const oasisWildlife = templateWildlife["titan-wasteland"];

export const WORLD_TEMPLATE_ART: Readonly<Record<string, WorldTemplateArtDirection>> = {
  "low-poly": LOW_POLY_VALLEY,
  "sakura-pearl": {
    ...sakura.palette,
    reference: "SeedWorld-01-sakura-pearl.png",
    focus: sakuraSubject ? [sakuraSubject.id] : [],
    frameFraction: 1.48,
    azimuthDegrees: 0,
    lookAtOffset: [0, -13, 0],
    petals: sakuraPetals,
    models: sakuraSubject
      ? [
          {
            id: sakuraSubject.id,
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: sakuraSubject.size,
            footprint: sakuraSubject.footprint,
            groundingFootprint: sakuraSubject.groundingFootprint,
            grounded: true,
            assetGroundY: sakuraSubject.assetGroundY,
            assetYawDegrees: sakuraSubject.assetYawDegrees,
            assetLeafMaterials: sakuraSubject.leaf.materials,
            assetLeafColor: sakuraSubject.leaf.color,
            assetLeafIntensity: sakuraSubject.leaf.intensity,
            assetLeafTextureBlend: sakuraSubject.leaf.textureBlend,
            assetMaterials: sakuraSubject.bark && {
              [sakuraSubject.bark.material]: {
                color: sakuraSubject.bark.color,
                intensity: sakuraSubject.bark.intensity
              }
            },
            assetUrl: templateAssets[sakuraSubject.asset]
          }
        ]
      : [],
    lighting: {},
    postProcess: {}
  },
  "emerald-forest": {
    modelLayout: "authored",
    spores: {
      count: 400,
      center: [0, 6, 15],
      extent: [64, 12, 120],
      radiusM: 0.005,
      minScreenFraction: 0.0015,
      color: "#e1ff8c",
      intensity: 16,
      driftM: 0.4,
      periodSeconds: 7
    },
    generation: {
      enabled: true,
      widthM: 180,
      frontDepthM: 100,
      backDepthM: 155,
      roadWidthM: 4.5,
      roadEndWidthRatio: 0.6,
      roadBendM: 5,
      roadWavelengthM: 95,
      destinationId: "giant-oak-distant-center",
      bankWidthM: 18,
      leftReliefM: 0,
      rightReliefM: 0,
      treeSpacingM: 18,
      treeBandWidthM: 36,
      treeAssetId: "SM_BirchTree_01",
      rockSpacingM: 12,
      rockWidthM: 5,
      rockDepthM: 4,
      rockHeightM: 2.5,
      replacePopulation: true
    },
    reference: "SeedWorld-03-emerald-rainforest.png",
    focus: ["giant-luminous-mushroom"],
    frameFraction: 0.86,
    azimuthDegrees: -5,
    lookAtOffset: [-8, 1.5, 0],
    models: [
      {
        ...forestMushroom("giant-luminous-mushroom", 12, 8, 20, -20),
        // The glowing gills illuminate the pale tissue and the companion cluster.
        light: { offset: [0, 0.12, 0], color: "#78ffe0", intensity: 0.9, rangeM: 26 }
      },
      forestMushroom("small-luminous-mushroom", 23, 9, 8, 30),
      forestMushroom("mushroom-front-companion", 7, -1, 6.5, -55),
      forestMushroom("mushroom-east-companion", 20, 19, 5, 85),
      forestMushroom("mushroom-root-cluster", 16, -2, 2.4, 125),
      forestMushroom("mushroom-west-foreground", -10, -24, 2, -15),
      forestMushroom("mushroom-west-small", -12, -22, 1.1, 45),
      forestMushroom("mushroom-east-foreground", 12, -25, 1.8, 90),
      forestMushroom("mushroom-east-small", 14, -23, 0.9, -50),
      forestMushroom("mushroom-trail-west", -7, 30, 1.4, 20),
      forestMushroom("mushroom-trail-east", 8, 43, 1.7, -60),
      forestOak("giant-oak-west-frame", -25, 0, 110, 20),
      forestOak("giant-oak-east-frame", 36, 21, 115, -35),
      forestOak("giant-oak-west-middle", -22, 62, 95, 85),
      forestOak("giant-oak-east-middle", 27, 78, 125, 140),
      { ...forestOak("giant-oak-distant-center", -2, 133, 130, -70), castShadows: false },
      forestOak("giant-oak-west-outer", -67, 65, 140, -25),
      forestOak("giant-oak-east-outer", 70, 95, 130, 65),
      { ...forestOak("giant-oak-west-distance", -43, 153, 115, 120), castShadows: false },
      { ...forestOak("giant-oak-east-distance", 43, 185, 150, -100), castShadows: false },
      forestFern("fern-west-foreground", -17, -16, 2.8, 20),
      forestFern("fern-east-foreground", 23, -18, 2.4, -40),
      forestFern("fern-west-bank", -19, 4, 3.8, 70),
      forestFern("fern-east-bank", 31, 11, 3.4, -65),
      forestFern("fern-mushroom-root", 21, 0, 1.6, 110),
      forestFern("fern-trail-west", -11, 28, 2, 45),
      forestFern("fern-trail-east", 14, 40, 2.2, -20),
      {
        ...model("fallen-forest-trunk", [-4, 7, 40], [48, 11, 11], false, -8),
        assetUrl: new URL("../assets/forest-fallen-trunk.glb", import.meta.url).href,
        assetMaterials: { SHD_trunk: { color: "#97ac64" } }
      },
      {
        ...model("canopy-sunbeams", [0, 45, 80], [130, 90, 90], false),
        assetUrl: new URL("../assets/forest-canopy-sunbeams.glb", import.meta.url).href,
        assetMaterials: { "Scattered canopy sunlight": { intensity: 1 } }
      }
    ],
    grass: ["#163c26", "#718f2e"],
    ground: "#49603c",
    road: "#9d9962",
    foliage: "#598b32",
    bark: "#706042",
    flowers: "#d4f7d9",
    stone: "#526c50",
    plantPalette: {
      layers: ["shrubs", "herbs", "cover", "flowers", "litter"],
      parts: {
        foliage: { color: "#668c39", intensity: 1 },
        leaves: { color: "#4e8135", intensity: 1 },
        stem: { color: "#47703a", intensity: 1 },
        petals: { color: "#e3ffe3", intensity: 1.2 },
        cap: { color: "#4ce9ba", intensity: 2 },
        bark: { color: "#6c6541", intensity: 1 }
      }
    },
    lighting: {
      ...lighting(10.3, 2.4, 1.2, 0.8, 0.009, 0.7),
      ...atmosphere([0.35, 0.72, 0.57], [0.64, 1.15, 0.84]),
      sunColorR: 1.1,
      sunColorG: 1.05,
      sunColorB: 0.72,
      fogTintR: 0.46,
      fogTintG: 0.95,
      fogTintB: 0.76
    },
    postProcess: { ...post(15, 9, -2), bloomThreshold: 0.65, bloomIntensity: 0.8, bloomScatter: 0.7 },
    landscape: {
      treeHeightMinM: 32,
      treeHeightMaxM: 55,
      grassRelativeHeight: 0.3
    },
    flowerCoverage: 0.08,
    weather: { cloudCoverage: 0, relativeHumidity: 0.7 },
    terrain: [ridge("west-forest-bank", -33, 24, 100, 22, 3), ridge("east-forest-bank", 30, 28, 110, 24, 4)]
  },
  "titan-wasteland": {
    reference: "media_1794901995967_d0f328ad.jpg",
    modelLayout: "authored",
    grassGroundFusion: false,
    focus: ["oasis-scarlet-tree"],
    frameFraction: 0.85,
    spawnOffset: [-3, -53],
    azimuthDegrees: 358,
    lookAtOffset: [4.5, -2, 0],
    solarPosition: { latitude: 32, dayOfYear: 172, northOffset: 112 },
    sandRippleFadeM: 150,
    initialPlanning: {
      landMode: "continuous",
      relief: { reliefNearAmplitudeM: 0.1, reliefAmplitudeM: 0.7, reliefFarAmplitudeM: 0, reliefScaleM: 230 },
      roadsEnabled: false,
      farmingEnabled: false,
      poiMemberMax: 0,
      layout: {
        widthMinM: 7,
        widthMaxM: 18,
        depthMinM: 6,
        depthMaxM: 16,
        heightMinM: 2,
        heightMaxM: 7,
        spacingMinM: 6,
        spacingMaxM: 16,
        memberMin: 0,
        memberMax: 0,
        maxGroundSlopeDegrees: 32
      },
      population: { villageMin: 0, villageMax: 0, buildingMin: 0, buildingMax: 0 }
    },
    generation: {
      enabled: true,
      headingDegrees: 0,
      widthM: 224,
      frontDepthM: 58,
      backDepthM: 118,
      leftReliefM: 0,
      rightReliefM: 0,
      rearReliefM: 0,
      rearReliefDepthM: 32,
      reliefSurface: "rocks",
      reliefBandWidthM: 64,
      reliefFrontDepthM: 2,
      reliefInnerHeightRatio: 0.55,
      reliefFrontHeightRatio: 0.8,
      terraceStepHeightM: 16,
      terraceTreadM: 30,
      terrainRoughness: 0.25,
      replacePopulation: true
    },
    butterflies: {
      textureUrl: templateAssets["oasis-butterflies"],
      count: 12,
      center: [-14.0, 9.8, -1.0],
      extent: [17.0, 3.6, 15.0],
      canopyRatio: 1.0,
      sizeM: [0.58, 0.86],
      lifetimeSeconds: 12.0,
      flapSpeed: 18,
      flutterMps: 0.38,
      flutterWavelengthM: 2.8,
      turnDegreesPerSecond: 48,
      color: "#ffffff",
      intensity: 1.0,
      emissionIntensity: 7.6,
      spiral: {
        radiusRangeM: [5.6, 9.0],
        orbitalSpeedRadPerSec: [0.36, 0.54],
        riseSpeedMps: [0.42, 0.68],
        radialMps: [-0.2, 0.06]
      },
      trail: {
        ratePerSecond: 9,
        lifetimeSeconds: [1.1, 1.8],
        sizeM: [0.04, 0.095],
        color: "#ffffff",
        intensity: 10,
        minScreenFraction: 0.0012
      }
    },
    models: [
      {
        id: "oasis-scarlet-tree",
        position: [-14, 0, -1],
        rotation: [0, 0, 0],
        scale: [21, 18.5, 17],
        footprint: [3.2, 3.2],
        groundingFootprint: [
          (2 * forestOakRoot.halfWidth * 18.5) / (forestOakRoot.topY - forestOakRoot.plantingY),
          (2 * forestOakRoot.halfDepth * 18.5) / (forestOakRoot.topY - forestOakRoot.plantingY)
        ],
        grounded: true,
        assetGroundY: forestOakRoot.plantingY,
        assetYawDegrees: -18,
        assetLeafMaterials: ["Flower_Clusters_512", "Flowers_512"],
        assetLeafColor: "#ee3228",
        assetLeafIntensity: 1.85,
        assetLeafTextureBlend: 0.08,
        assetMaterials: {
          Bark_512: { color: "#d89c72", intensity: 2.35 }
        },
        assetUrl: templateAssets["forest-giant-oak"],
        assetLod: {
          url: templateAssets["forest-giant-oak-lods"],
          // Per-chunk thresholds (~0.38x whole-tree height) keep all 5 chunks of the central hero oasis tree
          // at full LOD0 from spawn (~53m, chunk projections 0.12-0.17), stepping down to LOD1 (~75m) and LOD2 (~155m).
          screenRelativeHeights: [0.11, 0.055]
        }
      }
    ],
    terrain: [
      { id: "overlook-dune", x: -2, z: -72, kind: "patch", radius: 34, height: 5.4 },
      { id: "causeway-sandbar", x: -16.4, z: -13.5, kind: "patch", radius: 10.8, height: 0.24 },
      { id: "island-sandbar", x: -14.2, z: -0.6, kind: "patch", radius: 17.5, height: 0.26 },
      { id: "right-shoal-sandbar", x: 16.0, z: -11.0, kind: "patch", radius: 9.0, height: 0.14 },
      { id: "east-dune-slope", x: 68, z: -18, kind: "patch", radius: 24, height: 1.6 },
      { id: "west-canyon-bench", x: -56, z: 151, kind: "plateau", length: 106, width: 47, height: 3.0, heading: 83 },
      { id: "east-canyon-bench", x: 70, z: 198, kind: "plateau", length: 124, width: 60, height: 4.5, heading: 102 },
      { id: "far-canyon-bench", x: -35, z: 267, kind: "ridge", length: 154, width: 52, height: 3.0, heading: 71 }
    ],
    water: [
      {
        id: "oasis-lagoon",
        x: -3,
        z: -7,
        radius: 64,
        depth: 3.6,
        color: [31, 139, 131],
        depthTintDistanceM: 0.65,
        bankWidthM: 4.4,
        shoreline: OASIS_SHORELINE,
        holes: OASIS_SANDBARS
      }
    ],
    stones: [
      // Four slender pale weathered stone ruin pillars staggered on the flat floral sandbar island.
      {
        id: "island-pillar-sw",
        x: -22.5,
        z: -2.2,
        y: -0.15,
        width: 1.0,
        depth: 1.0,
        height: 2.5,
        yawDegrees: 18,
        collision: true
      },
      {
        id: "island-pillar-nw",
        x: -18.6,
        z: -1.5,
        y: -0.15,
        width: 1.0,
        depth: 1.0,
        height: 3.2,
        yawDegrees: 112,
        collision: true
      },
      {
        id: "island-pillar-se",
        x: -9.8,
        z: -1.6,
        y: -0.15,
        width: 1.0,
        depth: 1.0,
        height: 3.7,
        yawDegrees: 245,
        collision: true
      },
      {
        id: "island-pillar-ne",
        x: -7.0,
        z: -1.2,
        y: -0.15,
        width: 1.0,
        depth: 1.0,
        height: 3.4,
        yawDegrees: 310,
        collision: true
      },
      // Stepped terracotta sandstone cliffs: dense continuous canyon massifs with proportional W/D/H & y=-2 underground bases so zero stones float or look sparse.
      ...[
        // Right sandstone massif — Front lower talus & tiered apron (x = 12..56)
        ["right-mesa-apron-w", 15, 31, -2, 26, 22, 13, 22],
        ["right-mesa-apron-wc", 26, 33, -2, 28, 24, 15, 108],
        ["right-mesa-apron-c", 38, 34, -2, 30, 25, 16, 194],
        ["right-mesa-apron-e", 50, 34, -2, 28, 24, 14, 64],
        // Right sandstone massif — Tier 1 broad base wall (x = 16..58)
        ["right-mesa-base-w", 19, 39, -2, 36, 32, 21, 12],
        ["right-mesa-base-wc", 30, 41, -2, 38, 34, 23, 95],
        ["right-mesa-base-c", 41, 42, -2, 40, 35, 22, 52],
        ["right-mesa-base-e", 53, 42, -2, 36, 32, 19, 185],
        // Right sandstone massif — Tier 2 middle stepped buttresses
        ["right-mesa-mid-w", 24, 44, -2, 36, 32, 27, 48],
        ["right-mesa-mid-c", 36, 46, -2, 42, 38, 30, 140],
        ["right-mesa-mid-ec", 45, 47, -2, 36, 32, 26, 128],
        ["right-mesa-mid-e", 54, 46, -2, 32, 28, 22, 225],
        // Right sandstone massif — Tier 3 upper monolithic crown & Tier 4 summit dome (~36m above sand)
        ["right-mesa-top-w", 31, 49, -2, 36, 33, 33, 75],
        ["right-mesa-top-c", 40, 51, -2, 40, 36, 36, 165],
        ["right-mesa-peak", 37, 54, -2, 38, 35, 39, 25],
        // Continuous eastern sandstone canyon shoulders & stepped ledges (seamlessly bridging x = 56..106, zero sand gap!)
        ["right-ledge-bridge-1", 58, 35, -2, 30, 26, 17, 32],
        ["right-ledge-bridge-2", 66, 38, -2, 32, 28, 20, 124],
        ["right-ledge-1", 64, 27, -2, 28, 24, 13, 15],
        ["right-ledge-2", 75, 31, -2, 32, 27, 16, 105],
        ["right-ledge-3", 84, 35, -2, 34, 28, 18, 195],
        ["right-ledge-4", 88, 24, -2, 28, 24, 12, 58],
        ["right-ledge-5", 98, 29, -2, 34, 28, 15, 148],
        // Left midground warm amber-ochre stepped canyon wall + pointed red spire framing the left gap mountain
        ["left-cliff-apron-e", -29, 21, -2, 20, 18, 10, 18],
        ["left-gap-spire", -30.5, 30, -2, 16, 15, 24, 28],
        ["left-cliff-front-e", -37, 26, -2, 26, 22, 14, 35],
        ["left-cliff-front-c", -45, 28, -2, 32, 27, 16, 125],
        ["left-cliff-front-top", -42, 33, -2, 30, 26, 20, 215],
        ["left-cliff-mid-w", -55, 29, -2, 32, 27, 18, 82],
        ["left-cliff-west-low", -65, 23, -2, 28, 24, 15, 65],
        ["left-cliff-edge-w", -78, 28, -2, 34, 28, 22, 140],
        // High sweeping far-left sandstone massif descending eastwards (x = -58..-102)
        ["left-cliff-step-e", -56, 42, -2, 32, 28, 25, 45],
        ["left-cliff-step-1", -66, 45, -2, 36, 32, 29, 85],
        ["left-cliff-rear-base", -78, 49, -2, 42, 36, 34, 15],
        ["left-cliff-rear-mid", -86, 53, -2, 42, 38, 39, 110],
        ["left-cliff-rear-top", -94, 57, -2, 40, 36, 44, 200],
        // Distant far-east rocky skyline shoulder behind right slope
        ["far-east-crag-base", 115, 165, -2, 38, 32, 24, 42],
        ["far-east-crag-peak", 113, 168, -2, 34, 30, 32, 132],
        // Western desert canyon rim, stepped buttes & golden sandstone outcrops (x = -68..-176, z = -44..+18, safely west of x = -60 lagoon)
        ["west-rim-buttress-1", -84, 14, -2, 32, 27, 19, 48],
        ["west-rim-buttress-2", -98, 17, -2, 36, 30, 25, 136],
        ["west-rim-mesa-1", -115, 19, -2, 40, 34, 30, 224],
        ["west-rim-mesa-2", -134, 13, -2, 38, 32, 26, 72],
        ["west-rim-mesa-3", -154, 6, -2, 36, 30, 21, 164],
        ["west-rim-butte-far", -174, -4, -2, 34, 28, 18, 28],
        ["west-plain-outcrop-1", -75, -5, -2, 22, 18, 10.5, 112],
        ["west-plain-outcrop-2", -92, -8, -2, 28, 24, 14.5, 202],
        ["west-plain-outcrop-3", -114, -12, -2, 32, 26, 17.5, 38],
        ["west-plain-butte-sw1", -80, -25, -2, 22, 19, 9.2, 148],
        ["west-plain-butte-sw2", -102, -29, -2, 28, 24, 13.0, 238],
        ["west-plain-butte-sw3", -126, -32, -2, 32, 27, 16.0, 64],
        ["west-plain-butte-sw4", -150, -24, -2, 30, 25, 14.0, 154],
        ["west-plain-shelf-s1", -68, -36, -2, 18, 15, 6.4, 86],
        ["west-plain-shelf-s2", -88, -42, -2, 24, 20, 8.8, 176],
        ["west-plain-shelf-s3", -116, -44, -2, 28, 23, 11.2, 18],
        // Eastern desert canyon rim, stepped mesas & golden sandstone outcrops (x = +72..+182, z = -42..+16, safely east of x = +58 lagoon)
        ["east-rim-buttress-1", 74, 12, -2, 28, 24, 14, 34],
        ["east-rim-buttress-2", 90, 10, -2, 34, 28, 19, 124],
        ["east-rim-mesa-1", 108, 12, -2, 38, 32, 24, 214],
        ["east-rim-mesa-2", 128, 8, -2, 40, 34, 27, 56],
        ["east-rim-mesa-3", 148, 2, -2, 36, 30, 22, 146],
        ["east-rim-butte-far", 168, -8, -2, 34, 28, 18, 236],
        ["east-plain-outcrop-1", 73, -6, -2, 20, 17, 9.2, 92],
        ["east-plain-outcrop-2", 89, -9, -2, 26, 22, 13.5, 182],
        ["east-plain-outcrop-3", 110, -13, -2, 32, 26, 17.0, 24],
        ["east-plain-outcrop-4", 134, -18, -2, 34, 28, 19.0, 114],
        ["east-plain-butte-se1", 84, -25, -2, 22, 18, 8.6, 208],
        ["east-plain-butte-se2", 104, -29, -2, 28, 24, 12.5, 42],
        ["east-plain-butte-se3", 126, -33, -2, 32, 26, 15.0, 132],
        ["east-plain-butte-se4", 150, -28, -2, 30, 25, 13.0, 222],
        ["east-plain-shelf-s1", 92, -40, -2, 22, 18, 7.6, 68],
        ["east-plain-shelf-s2", 116, -42, -2, 26, 22, 10.5, 158],
        // North canyon river-bend sandy peninsula shelves & mid-to-far desert basin mesas (low enough to keep both gap peaks prominent!)
        ["north-bend-shelf-w1", -24, 45, -2, 18, 15, 7.2, 32],
        ["north-bend-shelf-c1", -15, 50, -2, 15, 13, 4.4, 122],
        ["north-bend-shelf-w2", -22, 60, -2, 19, 16, 6.6, 212],
        ["north-bend-shelf-c2", -11, 64, -2, 14, 12, 3.8, 54],
        ["north-bend-shelf-w3", -26, 76, -2, 22, 18, 8.4, 144],
        ["north-bend-shelf-c3", -15, 82, -2, 16, 14, 5.0, 234],
        ["north-bend-shelf-w4", -24, 94, -2, 20, 17, 7.2, 68],
        ["north-bend-east-1", 23, 66, -2, 22, 18, 8.5, 158],
        ["north-bend-east-2", 26, 84, -2, 24, 20, 9.6, 248],
        ["north-bend-east-3", 19, 102, -2, 20, 17, 7.2, 82],
        ["canyon-basin-mesa-w1", -48, 124, -2, 30, 25, 12.8, 26],
        ["canyon-basin-shelf-w2", -28, 128, -2, 24, 20, 8.6, 116],
        ["canyon-basin-shelf-c1", -8, 132, -2, 22, 18, 6.2, 206],
        ["canyon-basin-shelf-e1", 14, 126, -2, 25, 21, 9.2, 48],
        ["canyon-basin-mesa-w3", -60, 156, -2, 34, 28, 15.5, 138],
        ["canyon-basin-shelf-w4", -36, 162, -2, 28, 23, 10.2, 228],
        ["canyon-basin-shelf-c2", -14, 168, -2, 24, 20, 7.2, 62],
        ["canyon-basin-shelf-e2", 12, 160, -2, 26, 22, 9.6, 152],
        ["canyon-basin-mesa-e3", 35, 154, -2, 30, 25, 13.2, 242],
        ["canyon-basin-far-w", -46, 196, -2, 32, 26, 13.8, 84],
        ["canyon-basin-far-c", -18, 202, -2, 26, 22, 8.5, 174],
        ["canyon-basin-far-e", 10, 194, -2, 28, 23, 9.4, 14]
      ].map(([id, x, z, y, width, depth, height, yawDegrees]) => ({
        id: id as string,
        x: x as number,
        z: z as number,
        y: y as number,
        width: width as number,
        depth: depth as number,
        height: height as number,
        yawDegrees: yawDegrees as number,
        collision: true,
        cliff: true
      })),
      ...OASIS_BANK_STONES,
      ...[
        // Cluster 1: Cove-head boulder group right above the rainbow orb (x = -8.2..-3.6, z = -13.6..-17.2; leaving x = -23..-9.5 open sandbar ridge!)
        [-7.6, -14.2, -0.55, 3.8, 3.1, 2.35, 28],
        [-5.2, -15.8, -0.45, 3.1, 2.5, 1.95, 118],
        [-3.6, -17.0, -0.38, 2.3, 1.9, 1.48, 206],
        [-8.8, -15.6, -0.28, 1.5, 1.2, 0.95, 74],
        [-6.4, -17.4, -0.24, 1.25, 1.0, 0.8, 164],
        // Open sandy gap (-3.0..+1.0) with two small shore cobbles
        [-0.8, -18.8, -0.22, 1.1, 0.9, 0.68, 52],
        [0.8, -19.8, -0.2, 0.95, 0.78, 0.58, 148],
        // Cluster 2: Mid-shore boulder group to the upper-right of the orb (x = +1.8..+7.6, z = -20.0..-23.5) framing golden plume-grass!
        [2.4, -20.4, -0.48, 3.4, 2.8, 2.1, 42],
        [4.8, -21.6, -0.58, 4.1, 3.3, 2.48, 134],
        [7.2, -22.8, -0.42, 2.9, 2.4, 1.82, 224],
        [1.4, -22.2, -0.26, 1.45, 1.2, 0.9, 92],
        [4.2, -23.8, -0.3, 1.75, 1.4, 1.08, 186],
        [6.4, -24.6, -0.26, 1.4, 1.15, 0.88, 36],
        // Cluster 3: Prominent lower-right weathered limestone slab boulders & blocks WELL IN FRAME (x = +9.8..+24.5, z = -23.6..-29.2, leaving dry rippled sand below at z = -30..-42!)
        [10.2, -24.0, -0.62, 4.6, 3.7, 2.65, 22],
        [13.0, -25.2, -0.78, 5.4, 4.4, 3.05, 108],
        [16.2, -26.4, -0.88, 6.0, 4.8, 3.35, 18],
        [14.2, -27.8, -0.58, 4.2, 3.4, 2.42, 196],
        [19.4, -27.6, -0.82, 5.8, 4.6, 3.2, 64],
        [22.6, -28.8, -0.72, 5.0, 4.0, 2.82, 152],
        [11.4, -26.8, -0.45, 3.2, 2.6, 1.85, 244],
        [17.8, -29.2, -0.52, 3.8, 3.0, 2.15, 86],
        // Abundant scattered foreground cobbles, flat rock chips & pebbles across the dry golden sand below Cluster 3 (z = -28..-39, x = +5..+25)
        [7.6, -26.8, -0.28, 1.65, 1.35, 0.98, 38],
        [9.6, -28.4, -0.32, 1.95, 1.6, 1.15, 128],
        [12.2, -29.8, -0.36, 2.2, 1.8, 1.28, 218],
        [15.0, -31.0, -0.3, 1.8, 1.45, 1.06, 82],
        [18.2, -31.8, -0.34, 2.1, 1.7, 1.22, 174],
        [21.2, -32.6, -0.3, 1.85, 1.5, 1.08, 264],
        [24.0, -33.4, -0.28, 1.65, 1.35, 0.96, 48],
        [5.8, -29.4, -0.2, 1.1, 0.9, 0.65, 142],
        [8.2, -31.2, -0.18, 0.95, 0.78, 0.56, 232],
        [10.8, -32.8, -0.22, 1.25, 1.0, 0.74, 64],
        [13.4, -34.2, -0.2, 1.08, 0.88, 0.64, 156],
        [16.2, -35.2, -0.24, 1.35, 1.1, 0.78, 246],
        [19.2, -36.2, -0.22, 1.2, 0.98, 0.7, 28],
        [22.0, -37.0, -0.24, 1.3, 1.05, 0.76, 118],
        [24.6, -37.8, -0.18, 0.98, 0.8, 0.58, 208],
        [11.8, -36.8, -0.16, 0.85, 0.7, 0.5, 94],
        [15.2, -38.0, -0.18, 0.92, 0.75, 0.54, 184],
        [18.4, -39.0, -0.16, 0.82, 0.68, 0.48, 42],
        // Tiny pebbles around the leaning left snag & right wading shoal
        [-22.0, -28.6, -0.24, 1.15, 0.92, 0.68, 88],
        [-24.2, -27.4, -0.2, 0.9, 0.74, 0.54, 176],
        [20.8, -11.4, -0.24, 1.15, 0.95, 0.68, 54],
        [22.6, -10.8, -0.2, 0.92, 0.76, 0.54, 144],
        // Continuous pale weathered talus boulders woven along the entire right cliff base (x = 14..52, z = 11.5..18) & left cliff base
        [14.5, 16.2, -0.65, 2.8, 2.3, 1.75, 36],
        [18.8, 14.5, -0.5, 2.2, 1.8, 1.38, 128],
        [22.6, 13.8, -0.72, 3.2, 2.6, 1.98, 24],
        [26.5, 13.2, -0.45, 1.9, 1.6, 1.2, 96],
        [30.8, 12.6, -0.78, 3.5, 2.8, 2.15, 158],
        [35.2, 12.2, -0.55, 2.4, 2.0, 1.5, 52],
        [39.8, 11.8, -0.68, 2.9, 2.4, 1.82, 142],
        [44.2, 11.2, -0.5, 2.2, 1.8, 1.38, 232],
        [50.5, 11.8, -0.7, 3.1, 2.5, 1.92, 74],
        [-26.5, 16.5, -0.65, 2.8, 2.3, 1.75, 54],
        [-34.5, 15.8, -0.55, 2.4, 2.0, 1.5, 146],
        [-42.5, 15.0, -0.7, 3.0, 2.5, 1.88, 236],
        [-51.5, 13.5, -0.52, 2.3, 1.9, 1.44, 18],
        // Scattered weathered desert boulders along the west, east & north-bend sandstone outcrops
        [-64.0, -8.5, -0.55, 3.4, 2.8, 2.05, 42],
        [-67.5, -18.0, -0.48, 2.8, 2.3, 1.68, 132],
        [-62.5, -30.5, -0.52, 3.1, 2.5, 1.82, 222],
        [-78.0, -16.5, -0.62, 3.8, 3.1, 2.25, 68],
        [63.5, -4.5, -0.55, 3.3, 2.7, 1.98, 154],
        [66.0, -14.5, -0.48, 2.9, 2.4, 1.72, 244],
        [76.0, -18.5, -0.58, 3.6, 2.9, 2.15, 86],
        [78.5, -32.0, -0.52, 3.2, 2.6, 1.88, 176],
        [-11.5, 38.5, -0.45, 2.6, 2.1, 1.55, 34],
        [-18.5, 41.5, -0.52, 3.1, 2.5, 1.82, 124],
        [-9.5, 55.0, -0.42, 2.4, 2.0, 1.45, 214],
        [-8.0, 74.0, -0.48, 2.8, 2.3, 1.68, 56],
        [-12.5, 89.5, -0.44, 2.5, 2.1, 1.52, 146]
      ].map(([x, z, y, width, depth, height, yawDegrees], i) => ({
        id: `shore-boulder-${i + 1}`,
        x,
        z,
        y,
        width,
        depth,
        height,
        yawDegrees
      }))
    ],
    grass: ["#e2b678", "#f2d6a2"],
    ground: "#dfa166",
    road: "#d5955a",
    foliage: "#9eac8a",
    bark: "#6c4832",
    flowers: "#eba8f6",
    stone: "#f49c6e",
    shoreStone: "#ffe5bd",
    surfaceTextures: {
      baseUrl:
        "https://mdn.alipayobjects.com/rms/afts/img/A*Ny-fSavfzw8AAAAAVWAAAAgAehQnAQ/original/SandSurfaceBase.ktx2",
      normalUrl:
        "https://mdn.alipayobjects.com/rms/afts/img/A*a53ZTrJlyV4AAAAAWUAAAAgAehQnAQ/original/RippleNormal.png",
      microNormalUrl:
        "https://mdn.alipayobjects.com/rms/afts/img/A*PZ93SqSmca4AAAAAYOAAAAgAehQnAQ/original/MicroNormal.png",
      roadPattern: true,
      tileSizeM: 10.5,
      strength: 1.45
    },
    plantPalette: {
      layers: ["shrubs", "herbs", "cover", "flowers", "litter", "grass"],
      parts: {
        foliage: { color: "#768256", intensity: 0.95 },
        leaves: { color: "#828e5e", intensity: 0.95 },
        blades: { color: "#c89e66", intensity: 1.0 },
        stem: { color: "#8a784c", intensity: 0.95 },
        petals: { color: "#f5a6f2", intensity: 1.7 },
        bark: { color: "#7c543a", intensity: 1.15 }
      }
    },
    proceduralPlants: [
      ...OASIS_BANK_PLANTS,
      // Picturesque leaning bare desert snag on the left foreground sandy bank casting branching shadows over rippled sand.
      {
        id: "left-bank-snag-1",
        kind: "dead-wood",
        x: -23.2,
        z: -28.0,
        heightM: 5.0,
        yawDegrees: 32,
        variant: 0,
        tiltXDegrees: 7,
        tiltZDegrees: -13
      },
      // Dense overlapping multi-tonal lavender, lilac & blush-pink flower carpet blanketing the island around trunk & monoliths.
      ...[
        [-28.2, -1.4, 0.62, 48, 1, 1.36],
        [-27.0, -2.6, 0.66, 118, 0, 1.4],
        [-26.6, 0.6, 0.64, 192, 2, 1.38],
        [-25.4, -1.2, 0.7, 264, 3, 1.44],
        [-24.8, -3.2, 0.68, 32, 0, 1.4],
        [-24.4, 1.6, 0.66, 108, 1, 1.38],
        [-23.6, -1.8, 0.74, 12, 2, 1.46],
        [-22.8, -0.4, 0.78, 68, 0, 1.5],
        [-22.4, -3.2, 0.74, 134, 3, 1.46],
        [-21.5, 1.2, 0.72, 202, 1, 1.44],
        [-21.2, -1.6, 0.82, 44, 0, 1.55],
        [-20.4, -3.8, 0.76, 115, 2, 1.48],
        [-19.8, 0.4, 0.8, 184, 3, 1.52],
        [-19.2, -2.4, 0.84, 256, 0, 1.58],
        [-18.6, 2.0, 0.74, 28, 1, 1.46],
        [-18.0, -0.8, 0.86, 94, 2, 1.6],
        [-17.6, -3.6, 0.8, 162, 3, 1.52],
        [-17.0, 1.4, 0.78, 228, 0, 1.48],
        [-16.6, -1.8, 0.88, 312, 1, 1.62],
        [-16.0, -4.4, 0.78, 52, 2, 1.5],
        [-15.6, 2.4, 0.74, 124, 3, 1.46],
        [-15.4, -0.4, 0.86, 196, 0, 1.58],
        [-15.0, -2.8, 0.88, 18, 1, 1.62],
        [-14.4, 1.6, 0.82, 86, 2, 1.54],
        [-14.2, -4.6, 0.78, 154, 3, 1.5],
        [-13.6, -2.2, 0.88, 234, 0, 1.62],
        [-13.2, 0.8, 0.84, 304, 1, 1.56],
        [-12.8, -3.6, 0.82, 42, 2, 1.54],
        [-12.4, 2.4, 0.74, 112, 3, 1.46],
        [-12.0, -1.2, 0.88, 178, 0, 1.62],
        [-11.4, -4.4, 0.76, 248, 1, 1.48],
        [-11.0, 1.0, 0.8, 318, 2, 1.52],
        [-10.6, -2.4, 0.86, 64, 3, 1.58],
        [-10.0, 2.2, 0.72, 138, 0, 1.44],
        [-9.6, -0.6, 0.84, 212, 1, 1.56],
        [-9.2, -3.4, 0.8, 282, 2, 1.52],
        [-8.6, 1.4, 0.76, 36, 3, 1.46],
        [-8.2, -1.8, 0.84, 104, 0, 1.56],
        [-7.6, -4.0, 0.74, 172, 1, 1.46],
        [-7.2, 0.6, 0.78, 242, 2, 1.5],
        [-6.6, -2.4, 0.8, 310, 3, 1.52],
        [-6.0, 1.6, 0.7, 54, 0, 1.42],
        [-5.6, -1.0, 0.76, 128, 1, 1.48],
        [-5.0, -3.2, 0.72, 198, 2, 1.44],
        [-4.2, -0.4, 0.7, 268, 3, 1.4],
        [-3.4, -2.0, 0.68, 16, 0, 1.38],
        [-2.4, -1.0, 0.64, 84, 1, 1.36],
        [-1.6, -0.4, 0.6, 156, 2, 1.32],
        // Back & front island rim cushions (inside OASIS_SANDBARS[0])
        [-22.6, 3.0, 0.66, 62, 2, 1.38],
        [-19.8, 3.8, 0.68, 134, 0, 1.4],
        [-16.8, 4.4, 0.7, 206, 1, 1.42],
        [-13.8, 4.6, 0.7, 278, 3, 1.42],
        [-10.8, 4.2, 0.68, 24, 0, 1.4],
        [-8.0, 3.4, 0.66, 96, 2, 1.38],
        [-21.2, -5.0, 0.68, 46, 3, 1.4],
        [-18.6, -5.4, 0.72, 118, 0, 1.44],
        [-16.0, -5.6, 0.74, 190, 1, 1.46],
        [-13.4, -5.6, 0.74, 262, 2, 1.46],
        [-10.8, -5.0, 0.7, 12, 3, 1.42],
        // Tight cushions around stone monolith bases & hero tree root flare
        [-22.5, -1.3, 0.78, 82, 2, 1.5],
        [-18.6, -0.6, 0.82, 154, 0, 1.55],
        [-14.8, -1.4, 0.86, 226, 1, 1.58],
        [-13.0, -1.0, 0.86, 298, 3, 1.58],
        [-9.8, -0.8, 0.82, 44, 0, 1.55],
        [-7.0, -0.4, 0.78, 116, 2, 1.5],
        // Sandbar ridge floral drifts spilling southward along the golden sandbar ridge (z = -6.2..-13.8)
        [-19.8, -6.6, 0.68, 74, 0, 1.4],
        [-17.2, -6.8, 0.72, 146, 1, 1.44],
        [-14.6, -6.6, 0.7, 218, 2, 1.42],
        [-12.0, -6.4, 0.66, 290, 3, 1.38],
        [-18.6, -8.4, 0.62, 52, 1, 1.34],
        [-16.0, -8.6, 0.66, 124, 0, 1.38],
        [-13.6, -8.2, 0.62, 196, 3, 1.34],
        [-17.4, -10.6, 0.56, 268, 2, 1.28],
        [-14.8, -10.8, 0.58, 34, 0, 1.3],
        [-9.2, -13.4, 0.54, 108, 1, 1.24]
      ].map(([x, z, heightM, yawDegrees, variant, spreadScale], i) => ({
        id: `island-pastel-flower-${i + 1}`,
        kind: "pastel-flower" as const,
        x,
        z,
        heightM,
        yawDegrees,
        variant,
        spreadScale
      })),
      // Silvery-sage desert bushes perched directly ON TOP of stepped horizontal sandstone cliff ledges (`onRock: true`).
      ...[
        // Right massif front buttress tops, mid shelves, upper crown & eastern shoulders (multi-crown ledge clusters!)
        [20.5, 28.5, 1.85, 86, 2, 1.5],
        [22.4, 29.8, 2.05, 18, 0, 1.58],
        [24.6, 31.2, 1.75, 134, 1, 1.45],
        [33.2, 32.8, 1.95, 204, 2, 1.55],
        [35.6, 33.4, 1.68, 68, 3, 1.42],
        [43.5, 39.2, 1.85, 158, 0, 1.48],
        [48.5, 33.2, 1.92, 152, 1, 1.52],
        [51.2, 33.8, 1.62, 248, 2, 1.4],
        [57.5, 34.5, 1.85, 242, 0, 1.48],
        [64.5, 26.8, 1.75, 126, 3, 1.44],
        [74.5, 30.5, 1.82, 218, 0, 1.46],
        [28.5, 42.5, 1.8, 174, 2, 1.45],
        [36.5, 45.0, 1.95, 264, 0, 1.52],
        [35.5, 51.5, 1.85, 138, 1, 1.48],
        [39.2, 53.0, 1.65, 224, 2, 1.38],
        // Left massif front bluff tops, stepped shelves & upper ridge ledges
        [-28.0, 20.8, 1.55, 52, 1, 1.38],
        [-34.5, 25.2, 1.82, 144, 0, 1.48],
        [-37.2, 26.0, 1.58, 236, 2, 1.38],
        [-44.5, 27.5, 1.92, 18, 3, 1.52],
        [-47.5, 28.0, 1.68, 108, 0, 1.42],
        [-42.0, 32.8, 1.82, 196, 1, 1.46],
        [-55.0, 28.5, 1.9, 284, 2, 1.5],
        [-64.5, 22.8, 1.72, 74, 3, 1.42],
        [-55.5, 41.2, 1.82, 164, 0, 1.45],
        [-65.5, 44.5, 1.9, 252, 1, 1.48],
        // Ledge sage bushes perched on top of the new West, East & North Canyon sandstone shelves/buttes (`onRock: true`)
        [-84.5, 13.5, 1.82, 62, 0, 1.48],
        [-98.5, 16.5, 1.95, 152, 1, 1.52],
        [-115.0, 18.5, 2.05, 242, 2, 1.56],
        [-91.5, -8.0, 1.65, 38, 3, 1.42],
        [-113.5, -12.0, 1.78, 128, 0, 1.46],
        [-101.5, -28.5, 1.62, 218, 1, 1.4],
        [-125.5, -31.5, 1.75, 84, 2, 1.46],
        [74.5, 11.5, 1.72, 114, 0, 1.44],
        [90.5, 9.5, 1.85, 204, 1, 1.5],
        [108.5, 11.5, 1.95, 34, 2, 1.54],
        [89.5, -9.0, 1.68, 124, 3, 1.42],
        [110.5, -13.0, 1.8, 214, 0, 1.48],
        [104.5, -29.0, 1.65, 68, 1, 1.42],
        [126.5, -33.0, 1.78, 158, 2, 1.46],
        [-24.0, 45.0, 1.48, 46, 0, 1.38],
        [-22.0, 60.0, 1.45, 136, 1, 1.36],
        [-26.0, 76.0, 1.58, 226, 2, 1.42],
        [23.0, 66.0, 1.55, 82, 3, 1.4],
        [-48.0, 124.0, 1.72, 172, 0, 1.45],
        [-28.0, 128.0, 1.55, 262, 1, 1.38],
        [14.0, 126.0, 1.6, 54, 2, 1.4]
      ].map(([x, z, heightM, yawDegrees, variant, spreadScale], i) => ({
        id: `cliff-ledge-shrub-${i + 1}`,
        kind: "desert-shrub" as const,
        x,
        z,
        heightM,
        yawDegrees,
        variant,
        spreadScale,
        onRock: true
      })),
      // Hero silvery-sage desert scrub accents along the right cliff foot (especially the lush far-right bush!) & island edge.
      ...[
        [15.2, 15.2, 1.45, 38, 0, 1.5],
        [24.2, 13.5, 1.72, 128, 1, 1.58],
        [28.5, 12.8, 1.52, 218, 2, 1.48],
        [37.4, 12.0, 1.68, 84, 3, 1.55],
        [45.8, 10.8, 2.25, 164, 0, 1.72],
        [48.2, 11.4, 1.95, 254, 1, 1.62],
        [51.0, 10.6, 1.75, 42, 2, 1.55],
        [-35.2, 16.0, 1.95, 118, 0, 1.62],
        [-46.5, 14.2, 1.78, 208, 1, 1.55],
        [-20.8, -13.2, 0.72, 64, 2, 1.38],
        // Rich desert sage scrub belts hugging the bases of ALL new West, East & North Canyon sandstone formations!
        [-64.5, 4.5, 1.68, 48, 0, 1.5],
        [-71.0, -11.5, 1.58, 138, 1, 1.45],
        [-74.5, -28.0, 1.52, 228, 2, 1.42],
        [-62.0, -34.0, 1.42, 318, 3, 1.38],
        [-82.0, 1.5, 1.85, 76, 0, 1.56],
        [-86.0, -16.5, 1.72, 166, 1, 1.5],
        [-96.0, -21.0, 1.78, 256, 2, 1.52],
        [-80.0, -36.5, 1.55, 34, 3, 1.44],
        [-106.0, -39.0, 1.68, 124, 0, 1.48],
        [-118.0, -23.0, 1.82, 214, 1, 1.54],
        [-138.0, -16.0, 1.75, 62, 2, 1.5],
        [63.5, 4.0, 1.72, 74, 0, 1.52],
        [69.5, -10.5, 1.62, 164, 1, 1.48],
        [78.5, -24.5, 1.55, 254, 2, 1.44],
        [74.0, -16.0, 1.68, 42, 3, 1.48],
        [84.0, 0.5, 1.85, 132, 0, 1.56],
        [96.0, -19.5, 1.78, 222, 1, 1.52],
        [86.0, -34.5, 1.52, 58, 2, 1.42],
        [110.0, -38.0, 1.68, 148, 3, 1.48],
        [120.0, -22.5, 1.82, 238, 0, 1.54],
        [140.0, -10.0, 1.75, 86, 1, 1.5],
        [-14.5, 42.5, 1.42, 36, 0, 1.38],
        [-20.5, 40.0, 1.56, 118, 1, 1.44],
        [-11.0, 49.0, 1.32, 208, 2, 1.34],
        [-18.0, 56.5, 1.48, 126, 1, 1.42],
        [-9.5, 61.5, 1.28, 298, 3, 1.32],
        [-12.5, 70.5, 1.38, 216, 2, 1.36],
        [-21.0, 70.0, 1.58, 64, 0, 1.44],
        [-18.5, 86.5, 1.45, 58, 3, 1.4],
        [-11.5, 84.5, 1.34, 154, 1, 1.36],
        [-20.5, 98.0, 1.48, 244, 2, 1.4],
        [17.5, 62.0, 1.52, 78, 0, 1.42],
        [20.5, 80.0, 1.58, 168, 1, 1.45],
        [15.5, 98.0, 1.46, 258, 2, 1.38],
        [-38.0, 120.0, 1.72, 44, 3, 1.48],
        [-20.0, 124.0, 1.58, 134, 0, 1.42],
        [-4.0, 128.0, 1.45, 224, 1, 1.38],
        [10.0, 122.0, 1.55, 68, 2, 1.42],
        [-26.0, 158.0, 1.65, 158, 3, 1.45],
        [-6.0, 162.0, 1.5, 248, 0, 1.4],
        [16.0, 154.0, 1.62, 82, 1, 1.44]
      ].map(([x, z, heightM, yawDegrees, variant, spreadScale], i) => ({
        id: `hero-sage-shrub-${i + 1}`,
        kind: "desert-shrub" as const,
        x,
        z,
        heightM,
        yawDegrees,
        variant,
        spreadScale
      })),
      // Picturesque weathered desert dead-wood snags framing the West, East & North Canyon rock outcrops
      {
        id: "west-outcrop-snag-1",
        kind: "dead-wood",
        x: -70.5,
        z: -21.5,
        heightM: 4.6,
        yawDegrees: 118,
        variant: 1,
        tiltXDegrees: -6,
        tiltZDegrees: 10
      },
      {
        id: "east-outcrop-snag-1",
        kind: "dead-wood",
        x: 74.5,
        z: -20.5,
        heightM: 4.8,
        yawDegrees: 242,
        variant: 2,
        tiltXDegrees: 5,
        tiltZDegrees: -9
      },
      {
        id: "north-bend-snag-1",
        kind: "dead-wood",
        x: -16.5,
        z: 66.5,
        heightM: 4.4,
        yawDegrees: 64,
        variant: 0,
        tiltXDegrees: 6,
        tiltZDegrees: 8
      },
      // Feathery golden plume-grass (`plume-grass`) sprouting out of the 3 foreground boulder clusters, snag & new rock outcrops.
      ...[
        [-8.0, -14.8, 0.98, 28, 0, 1.2],
        [-4.8, -16.4, 1.08, 118, 1, 1.25],
        [1.8, -21.2, 1.24, 208, 2, 1.32],
        [3.8, -22.2, 1.34, 64, 0, 1.36],
        [6.4, -23.4, 1.18, 154, 1, 1.28],
        [9.6, -24.8, 1.28, 244, 2, 1.32],
        [12.4, -26.2, 1.36, 38, 0, 1.36],
        [15.6, -28.0, 1.24, 128, 1, 1.3],
        [19.8, -29.2, 1.2, 218, 2, 1.28],
        [23.2, -30.2, 1.16, 92, 0, 1.24],
        [-22.2, -27.6, 1.04, 84, 0, 1.22],
        [-24.0, -28.6, 0.96, 174, 2, 1.18],
        [-31.5, -33.5, 1.08, 46, 1, 1.24],
        // Plume-grass accents next to the new West, East & North Canyon boulders and rock shelves
        [-63.5, -9.8, 1.22, 54, 0, 1.3],
        [-68.0, -19.2, 1.18, 144, 1, 1.28],
        [-63.0, -31.8, 1.15, 234, 2, 1.26],
        [-77.0, -17.8, 1.28, 78, 0, 1.34],
        [-89.0, -38.5, 1.2, 168, 1, 1.28],
        [64.2, -5.8, 1.22, 112, 2, 1.3],
        [66.8, -15.6, 1.18, 202, 0, 1.28],
        [75.5, -19.8, 1.26, 38, 1, 1.32],
        [79.2, -33.2, 1.18, 128, 2, 1.28],
        [93.0, -36.5, 1.2, 218, 0, 1.3],
        [-12.2, 39.2, 1.14, 62, 1, 1.26],
        [-19.2, 42.4, 1.2, 152, 2, 1.3],
        [-10.2, 55.8, 1.12, 242, 0, 1.24],
        [-8.8, 74.8, 1.16, 84, 1, 1.28],
        [-13.2, 90.2, 1.14, 174, 2, 1.26]
      ].map(([x, z, heightM, yawDegrees, variant, spreadScale], i) => ({
        id: `crevice-plume-grass-${i + 1}`,
        kind: "plume-grass" as const,
        x,
        z,
        heightM,
        yawDegrees,
        variant,
        spreadScale
      })),
      // Multi-scale golden desert grass tufts (`dry-grass`) across the sandbar ridge, right wading shoal & foreground sand ripples.
      ...[
        // Left snag & far-left foreground golden grass clusters
        [-32.8, -34.2, 0.78, 24, 0],
        [-30.4, -35.6, 0.68, 114, 1],
        [-28.2, -33.2, 0.62, 204, 2],
        [-24.8, -29.2, 0.72, 12, 0],
        [-22.6, -29.6, 0.66, 98, 1],
        [-21.2, -27.2, 0.6, 186, 2],
        // Sandbar ridge tufts guiding the eye toward the flower island
        [-20.4, -14.8, 0.58, 42, 0],
        [-18.6, -12.6, 0.64, 134, 1],
        [-12.2, -12.4, 0.56, 224, 2],
        [-10.8, -14.8, 0.62, 312, 0],
        [-19.2, -18.5, 0.54, 76, 1],
        [-14.6, -16.8, 0.48, 168, 2],
        // Foreground sand ripple tufts (left-center & lower-right)
        [-15.8, -33.8, 0.74, 160, 0],
        [-14.2, -34.8, 0.62, 248, 1],
        [-14.8, -41.2, 0.68, 218, 2],
        [-11.2, -32.8, 0.58, 48, 0],
        [-8.4, -42.5, 0.66, 225, 1],
        [-4.2, -37.5, 0.62, 310, 0],
        [2.8, -41.5, 0.68, 145, 2],
        [6.4, -33.8, 0.64, 200, 0],
        [9.4, -42.8, 0.68, 30, 1],
        [13.4, -38.4, 0.66, 118, 2],
        [17.6, -40.6, 0.72, 240, 0],
        [21.8, -41.8, 0.68, 175, 1],
        [25.8, -42.6, 0.74, 52, 2],
        [-20.2, -42.5, 0.66, 175, 2],
        [-6.2, -46.8, 0.7, 152, 0],
        // Right wading shoal tufts (x = 11..21, z = -11..-13.5)
        [11.8, -12.2, 0.56, 44, 0],
        [15.4, -11.2, 0.62, 134, 1],
        [19.2, -12.6, 0.58, 224, 2],
        // Dry desert grass tufts scattered around the West, East & North Canyon outcrops
        [-58.5, -28.0, 0.72, 42, 0],
        [-66.5, -24.5, 0.68, 132, 1],
        [-73.0, -34.5, 0.74, 222, 2],
        [-84.0, -29.5, 0.7, 68, 0],
        [60.5, -24.0, 0.72, 158, 1],
        [68.5, -20.5, 0.68, 248, 2],
        [75.0, -28.5, 0.74, 84, 0],
        [85.0, -20.0, 0.7, 174, 1],
        [-10.5, 35.5, 0.66, 52, 2],
        [-16.0, 46.5, 0.7, 142, 0],
        [-13.5, 62.5, 0.68, 232, 1],
        [-10.0, 78.5, 0.66, 74, 2]
      ].map(([x, z, heightM, yawDegrees, variant], i) => ({
        id: `foreground-dry-grass-${i + 1}`,
        kind: "dry-grass" as const,
        x,
        z,
        heightM,
        yawDegrees,
        variant
      }))
    ],
    lighting: {
      timeHours: 14.0,
      sunIntensity: 2.38,
      ambientIntensity: 0.96,
      iblIntensity: 1.0,
      sunColorR: 1,
      sunColorG: 0.95,
      sunColorB: 0.86,
      atmosphereThickness: 0.85,
      skyExposure: 0.66,
      skyTintR: 0.214,
      skyTintG: 0.214,
      skyTintB: 0.214,
      customSkyTintStrength: 0.86,
      customSkyZenithR: 0.14,
      customSkyZenithG: 0.35,
      customSkyZenithB: 0.98,
      customSkyHorizonR: 0.46,
      customSkyHorizonG: 0.69,
      customSkyHorizonB: 1.05,
      groundTintR: 0.34,
      groundTintG: 0.22,
      groundTintB: 0.14,
      fogDensity: 0.0024,
      fogExponent: 1.5,
      fogTintR: 0.78,
      fogTintG: 0.68,
      fogTintB: 0.96,
      fog: true,
      direct: true,
      environment: true,
      shadows: true,
      shadowStrength: 0.8
    },
    weather: {
      cloudCoverage: 0.32,
      cloudBaseAltitudeM: 760,
      cloudThicknessM: 345,
      cloudFeatureSize: 0.52,
      cloudDensityMultiplier: 1.22,
      cloudEnvelopeScale: 0.43,
      cloudTopDensityMultiplier: 0.3,
      cloudDetailNoiseMultiplier: 1.42,
      rainRate: 0,
      snowRate: 0,
      temperatureCelsius: 30,
      relativeHumidity: 0.22
    },
    postProcess: {
      enabled: true,
      tonemapping: true,
      postExposure: 0.06,
      temperature: 6,
      contrast: 18,
      saturation: 8,
      bloom: true,
      bloomThreshold: 2.2,
      bloomIntensity: 0.52,
      bloomScatter: 0.7
    },
    landscape: {
      grassRelativeHeight: 0.2,
      treeHeightMinM: 2,
      treeHeightMaxM: 4,
      companionStoneDensity: 0
    },
    flowerCoverage: 0,
    initialFlowers: { densityPerM2: 7.5 },
    initialLandscape: {
      density: 0.45,
      "contexts.poi": 1,
      "contexts.landform": 1,
      "contexts.openland": 0,
      companionStoneDensity: 0,
      "vegetation.trees": 0,
      "vegetation.grass": 0.16,
      "vegetation.shrubs": 0,
      "vegetation.herbs": 0,
      "vegetation.cover": 0,
      "vegetation.flowers": 0.98,
      "vegetation.litter": 0
    },
    plantings: [
      { id: "island-purple-flowers", kind: "flower", x: -14, z: -1, radius: 14.5, densityScale: 2.2 },
      { id: "island-grass", kind: "grass", x: -14, z: -1, radius: 12.5, densityScale: 0.35 },
      { id: "overlook-grass", kind: "grass", x: -2, z: -42, radius: 26, densityScale: 0.22 },
      { id: "west-mesa-shrubs", kind: "shrub", x: -42, z: 24, radius: 12, densityScale: 0.14 }
    ],
    animals: {
      enabled: true,
      "fireflies.enabled": false,
      "species.min": oasisWildlife.residents.length + 1,
      "species.max": oasisWildlife.residents.length + 1,
      "birdCount.min": oasisWildlife.flock.min + 1,
      "birdCount.max": oasisWildlife.flock.max + 1,
      "birdCount.species": "flamingo,swan",
      "birdCount.offsetX": oasisWildlife.flock.offsetX,
      "birdCount.offsetZ": oasisWildlife.flock.offsetZ,
      minimumEatingAnimals: 0,
      spawnPointRadius: oasisWildlife.flock.radius
    }
  }
};

/** Resolves the effective rock/prop collision threshold for a template (global default merged with per-template override). */
export function templateRockCollisionPolicy(templateId?: string): RockCollisionPolicy {
  return resolveRockCollisionPolicy(templateId ? WORLD_TEMPLATE_ART[templateId]?.rockCollision : undefined);
}
