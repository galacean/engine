import type { TemplateNode, TemplateAssetSlot } from "./WorldTemplateGeometry";
import type { TemplateProceduralPlantInstance } from "./runtime/TemplateProceduralPlants";
import type { SeedWorldCameraBookmark } from "../world/SeedWorldCameraBookmark";
import type { SpatialCompositionParameters } from "./SpatialCompositionParameters";
import { WORLD_TEMPLATE_CONFIGS } from "./WorldTemplateConfig";
import { LOW_POLY_VALLEY } from "./world-templates/LowPolyValley";
import { OASIS_BANK_PLANTS, OASIS_BANK_STONES, OASIS_SANDBARS, OASIS_SHORELINE } from "./world-templates/OasisFloodplain";

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
  "sakura-petal": new URL("../assets/sakura-petal.png", import.meta.url).href
};
const sakuraPetals =
  sakura.petals &&
  (() => {
    const { texture, ...effect } = sakura.petals;
    const textureUrl = templateAssets[texture];
    if (!textureUrl) throw new Error(`未知花瓣粒子贴图：${texture}`);
    return { ...effect, textureUrl };
  })();

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
      forestOak("giant-oak-distant-center", -2, 133, 130, -70),
      forestOak("giant-oak-west-outer", -67, 65, 140, -25),
      forestOak("giant-oak-east-outer", 70, 95, 130, 65),
      forestOak("giant-oak-west-distance", -43, 153, 115, 120),
      forestOak("giant-oak-east-distance", 43, 185, 150, -100),
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
      relief: { reliefNearAmplitudeM: 0.1, reliefAmplitudeM: 0.7, reliefFarAmplitudeM: 7, reliefScaleM: 230 },
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
        assetUrl: templateAssets["forest-giant-oak"]
      }
    ],
    terrain: [
      { id: "overlook-dune", x: -2, z: -72, kind: "patch", radius: 34, height: 5.4 },
      { id: "island-sandbar", x: -14, z: -1, kind: "patch", radius: 16.5, height: 0.15 },
      { id: "east-dune-slope", x: 68, z: -18, kind: "patch", radius: 24, height: 1.8 },
      { id: "west-canyon-bench", x: -56, z: 151, kind: "plateau", length: 106, width: 47, height: 3.5, heading: 83 },
      { id: "east-canyon-bench", x: 70, z: 198, kind: "plateau", length: 124, width: 60, height: 5.0, heading: 102 },
      { id: "far-canyon-bench", x: -35, z: 267, kind: "ridge", length: 154, width: 52, height: 3.5, heading: 71 },
      { id: "gap-west-peak", x: -23, z: 295, kind: "mountain", length: 105, width: 58, height: 42, heading: 82 },
      { id: "gap-east-peak", x: 6, z: 320, kind: "mountain", length: 112, width: 62, height: 34, heading: 96 },
      { id: "west-skyline-peak", x: -145, z: 365, kind: "mountain", length: 185, width: 95, height: 54, heading: 76 },
      { id: "center-skyline-peak", x: -10, z: 420, kind: "mountain", length: 175, width: 85, height: 34, heading: 94 },
      { id: "east-skyline-peak", x: 152, z: 395, kind: "mountain", length: 155, width: 82, height: 54, heading: 72 }
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
        // Left midground warm amber-ochre stepped canyon wall + pointed red spire framing the hero tree
        ["left-cliff-apron-e", -28, 21, -2, 22, 19, 10, 18],
        ["left-gap-spire", -25.5, 30, -2, 16, 15, 24, 28],
        ["left-cliff-front-e", -34, 26, -2, 28, 24, 14, 35],
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
        ["far-east-crag-peak", 113, 168, -2, 34, 30, 32, 132]
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
        // Prominent foreground center-right weathered limestone boulders & slabs bridging behind the orb to lower-right (x = -4..26, z = -18..-40)
        [-3.8, -18.6, -0.22, 2.8, 2.3, 1.55, 28],
        [-1.4, -21.2, -0.26, 3.6, 3.0, 1.95, 116],
        [1.4, -23.8, -0.24, 3.2, 2.6, 1.75, 204],
        [4.2, -26.4, -0.28, 4.0, 3.3, 2.15, 54],
        [7.0, -28.8, -0.26, 3.5, 2.9, 1.88, 142],
        [9.6, -30.6, -0.3, 4.2, 3.5, 2.2, 232],
        [12.2, -32.2, -0.34, 4.8, 3.9, 2.45, 24],
        [15.0, -33.6, -0.36, 5.1, 4.2, 2.55, 112],
        [18.2, -35.2, -0.34, 4.9, 4.0, 2.45, 62],
        [21.6, -36.8, -0.38, 5.3, 4.3, 2.6, 148],
        [25.0, -38.2, -0.32, 4.5, 3.7, 2.25, 32],
        // Scattered foreground cobbles & flat rock chips in front of the boulder bank
        [-0.4, -24.8, -0.18, 1.6, 1.3, 0.88, 84],
        [2.8, -28.2, -0.18, 1.7, 1.4, 0.92, 172],
        [6.2, -31.2, -0.2, 1.9, 1.5, 1.02, 42],
        [10.2, -33.8, -0.2, 2.1, 1.7, 1.1, 194],
        [13.6, -35.8, -0.22, 2.3, 1.8, 1.18, 76],
        [17.2, -37.8, -0.2, 1.9, 1.5, 0.98, 164],
        [20.6, -39.4, -0.2, 2.1, 1.7, 1.05, 252],
        [23.8, -40.8, -0.18, 1.6, 1.3, 0.82, 44],
        [-21.8, -28.6, -0.18, 1.3, 1.1, 0.68, 88],
        // Slabs exposed on the dry outer bank, behind the wading shoal.
        [19, 12.8, -0.48, 3.8, 2.6, 1.45, 24],
        [23, 12.5, -0.34, 2.3, 1.7, 1.0, 96],
        [28, 12.2, -0.6, 4.6, 3.1, 1.8, 158],
        [36, 10.5, -0.46, 3.2, 2.1, 1.3, 52],
        // Foothill talus rocks scattered naturally at the base of the sandstone cliffs
        [13.5, 22.0, -0.6, 3.4, 2.9, 2.1, 36],
        [22.5, 24.5, -0.7, 3.8, 3.2, 2.3, 128],
        [56.0, 19.5, -0.65, 3.6, 3.0, 2.2, 214],
        [69.0, 17.5, -0.6, 3.2, 2.8, 2.0, 86],
        [-26.5, 16.5, -0.55, 3.0, 2.6, 1.85, 54],
        [-38.5, 18.0, -0.65, 3.5, 3.0, 2.15, 146]
      ].map(([x, z, y, width, depth, height, yawDegrees], i) => ({
        id: `shore-boulder-${i + 1}`,
        x,
        z,
        y,
        width,
        depth,
        height,
        yawDegrees,
        collision: false
      }))
    ],
    grass: ["#c89b68", "#dfc094"],
    ground: "#d8aa80",
    road: "#cd9c70",
    foliage: "#6d784e",
    bark: "#6c4832",
    flowers: "#f0a6f4",
    stone: "#e87e4e",
    shoreStone: "#ffdfb0",
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
        // Foreground sandbar tongue blossom accents (dry bank at z = -15.5..-18.5)
        [-16.4, -16.8, 0.58, 74, 0, 1.28],
        [-13.8, -15.8, 0.62, 146, 1, 1.32],
        [-11.4, -15.4, 0.58, 218, 2, 1.28]
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
        // Right massif front buttress tops, mid shelves, upper crown & eastern shoulders
        [20.5, 28.5, 1.68, 86, 2, 1.35],
        [23.5, 31.0, 1.85, 24, 0, 1.42],
        [26.5, 32.4, 1.62, 118, 1, 1.34],
        [35.0, 33.2, 1.88, 204, 2, 1.42],
        [39.0, 34.0, 1.58, 68, 3, 1.32],
        [43.5, 39.2, 1.78, 158, 0, 1.38],
        [49.0, 33.2, 1.68, 152, 0, 1.34],
        [57.5, 34.5, 1.85, 242, 1, 1.4],
        [61.5, 35.0, 1.55, 34, 2, 1.3],
        [64.5, 26.8, 1.65, 126, 3, 1.32],
        [74.5, 30.5, 1.75, 218, 0, 1.35],
        [83.5, 34.5, 1.62, 88, 1, 1.32],
        [28.5, 42.5, 1.72, 174, 2, 1.34],
        [36.5, 45.0, 1.86, 264, 0, 1.4],
        [44.5, 46.2, 1.66, 46, 3, 1.32],
        [35.5, 51.5, 1.76, 138, 1, 1.36],
        [39.2, 53.0, 1.56, 224, 2, 1.28],
        // Left massif front bluff tops, stepped shelves & upper ridge ledges
        [-28.0, 20.8, 1.45, 52, 1, 1.28],
        [-34.5, 25.2, 1.68, 144, 0, 1.34],
        [-38.5, 26.4, 1.5, 236, 2, 1.28],
        [-44.5, 27.5, 1.78, 18, 3, 1.38],
        [-48.5, 28.2, 1.56, 108, 0, 1.3],
        [-42.0, 32.8, 1.72, 196, 1, 1.35],
        [-55.0, 28.5, 1.8, 284, 2, 1.38],
        [-64.5, 22.8, 1.62, 74, 3, 1.32],
        [-55.5, 41.2, 1.75, 164, 0, 1.35],
        [-65.5, 44.5, 1.82, 252, 1, 1.38],
        [-77.0, 48.2, 1.72, 38, 2, 1.34]
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
      // Extra feathery golden plume-grass (`plume-grass`) in foreground boulder crevices behind the orb & around the snag.
      ...[
        [-10.2, -15.6, 0.96, 28, 0, 1.18],
        [-5.8, -16.8, 1.04, 118, 1, 1.22],
        [-1.8, -20.2, 1.12, 208, 2, 1.25],
        [2.6, -24.6, 1.22, 64, 0, 1.28],
        [5.4, -27.2, 1.18, 154, 1, 1.26],
        [8.6, -29.8, 1.15, 244, 2, 1.24],
        [13.4, -33.2, 1.2, 38, 0, 1.26],
        [17.8, -35.8, 1.24, 128, 1, 1.28],
        [22.4, -38.2, 1.16, 218, 2, 1.24],
        [-22.2, -27.6, 0.94, 84, 0, 1.15],
        [-24.4, -28.8, 0.88, 174, 2, 1.12]
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
      // Foreground wind-swept golden dry grass tufts across the dry overlook sand ripples (all strictly inland of nearBank!).
      ...[
        [-24.5, -29.5, 0.68, 12, 0],
        [-21.5, -31.2, 0.62, 85, 1],
        [-19.0, -35.5, 0.72, 160, 2],
        [-15.2, -22.5, 0.58, 42, 0],
        [-12.4, -19.8, 0.62, 134, 1],
        [-14.8, -39.5, 0.78, 218, 2],
        [-11.2, -32.8, 0.68, 48, 0],
        [-8.4, -42.5, 0.76, 225, 1],
        [-5.2, -24.5, 0.6, 95, 2],
        [-4.0, -38.0, 0.72, 310, 0],
        [-1.2, -31.5, 0.64, 65, 1],
        [2.8, -41.5, 0.78, 145, 2],
        [5.6, -34.2, 0.68, 200, 0],
        [9.4, -43.5, 0.76, 30, 1],
        [12.8, -37.2, 0.66, 118, 2],
        [16.8, -41.2, 0.74, 240, 0],
        [21.4, -42.6, 0.7, 175, 1],
        [25.8, -43.8, 0.76, 52, 2],
        [-26.5, -35.5, 0.72, 285, 0],
        [-14.2, -45.5, 0.74, 15, 1],
        [1.2, -46.5, 0.68, 190, 2],
        [15.6, -46.2, 0.72, 68, 1],
        [-8.8, -28.4, 0.64, 134, 0],
        [-2.8, -44.2, 0.74, 260, 2],
        [7.2, -39.8, 0.68, 12, 1],
        [19.8, -45.4, 0.72, 88, 0],
        [-18.2, -43.5, 0.74, 175, 2],
        [-23.8, -41.5, 0.7, 38, 1],
        [-6.2, -47.5, 0.76, 152, 0],
        [8.4, -48.2, 0.74, 244, 2]
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
      sunIntensity: 2.35,
      ambientIntensity: 0.88,
      iblIntensity: 0.92,
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
      customSkyZenithG: 0.34,
      customSkyZenithB: 0.96,
      customSkyHorizonR: 0.44,
      customSkyHorizonG: 0.68,
      customSkyHorizonB: 1.04,
      groundTintR: 0.28,
      groundTintG: 0.21,
      groundTintB: 0.16,
      fogDensity: 0.0024,
      fogExponent: 1.5,
      fogTintR: 0.56,
      fogTintG: 0.74,
      fogTintB: 1.12,
      fog: true,
      direct: true,
      environment: true,
      shadows: true,
      shadowStrength: 0.85
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
      bloom: false
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
      "species.min": 1,
      "species.max": 1,
      "birdCount.min": 8,
      "birdCount.max": 11,
      "birdCount.species": "flamingo",
      "birdCount.offsetX": 19,
      "birdCount.offsetZ": -13,
      birdSpawnPointWeight: 64,
      spawnPointRadius: 7.5
    }
  }
};
