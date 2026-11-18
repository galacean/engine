export type V2 = [number, number];
export type V3 = [number, number, number];

export type GuideRole = "massif" | "wall" | "ridge" | "basin";
export type FeatureKind = "gully" | "valley" | "ridge";
export type RockAppearanceMode = "bands" | "patches" | "heavy" | "concavity" | "clay";
export type VistaLightingMode = "day" | "golden" | "night" | "overcast";
export type MountainPresetId =
  | "hanyan-valley"
  | "twin-couloirs"
  | "knife-ridge"
  | "cirque-basin"
  | "custom-playground";

export interface MountainGuideOBB {
  id: string;
  name: string;
  role: GuideRole;
  enabled: boolean;
  center: V3;
  size: V3;
  yawDegrees: number;
  /** Vertical metres per horizontal metre of slope ascent/descent. */
  slopeRate: number;
  /** Positive rounds the crown; negative dishes it into a bowl. */
  crownShape: number;
  /** Multiplier for Cold Smoke's ridged multifractal relief inside/around this guide. */
  reliefBoost: number;
}

export interface GullyValleyFeature {
  id: string;
  name: string;
  kind: FeatureKind;
  enabled: boolean;
  /** Quadratic Bézier control points in world [X, Z]: [start, bend, end]. */
  points: [V2, V2, V2];
  /** Depth in metres for gully/valley, or height in metres for ridge. */
  depth: number;
  /** Cross-sectional half-width in metres. */
  width: number;
  /** 0 = broad U-shaped glacial trough; 1 = sharp V-shaped couloir or knife ridge. */
  sharpness: number;
  /** Whether oblique fishbone tributary runnels join this gully/valley along its flanks. */
  tributaries: boolean;
  /** Spacing in metres between tributary side-chutes. */
  tributarySpacing: number;
  /** Relative depth multiplier (0..1) of tributary side-chutes. */
  tributaryStrength: number;
}

export interface CorridorSettings {
  enabled: boolean;
  halfWidth: number;
  apronWidth: number;
  wallHeight: number;
  sinuosity: number;
  baseSlope: number;
}

export interface ReliefSettings {
  enabled: boolean;
  amplitude: number;
  scaleMetres: number;
  octaves: number;
}

export interface ProceduralGullySettings {
  enabled: boolean;
  octaves: 1 | 2 | 3 | 4;
  strength: number;
  tributaryBend: number;
  wavelengthScale: number;
}

export interface StrataSettings {
  enabled: boolean;
  benchCarving: number;
  bedThickness: number;
  foldStrength: number;
  rockMode: RockAppearanceMode;
}

export interface VistaSettings {
  lighting: VistaLightingMode;
  sunAzimuthDegrees: number;
  sunElevationDegrees: number;
  fogDensity: number;
  showCloudSea: boolean;
  showFarRanges: boolean;
  showCity: boolean;
}

export interface ForestSettings {
  enabled: boolean;
  density: number;
  treeLineHeight: number;
}

export interface SculptStamp {
  x: number;
  z: number;
  radius: number;
  deltaHeight: number;
}

export interface FieldDomain {
  minX: number;
  minZ: number;
  width: number;
  depth: number;
  resolution: number;
}

export interface ColdSmokeMountainRecipe {
  presetId: MountainPresetId;
  seed: number;
  domain: FieldDomain;
  corridor: CorridorSettings;
  guides: MountainGuideOBB[];
  features: GullyValleyFeature[];
  relief: ReliefSettings;
  proceduralGullies: ProceduralGullySettings;
  strata: StrataSettings;
  forest: ForestSettings;
  sculptStamps: SculptStamp[];
  vista: VistaSettings;
}

export interface ColdSmokeMountainResult {
  recipe: ColdSmokeMountainRecipe;
  positions: Float32Array;
  normals: Float32Array;
  /** Packed [mountainWeight, concavity, cavityAO, sunHorizonTangent] per vertex. */
  channels: Float32Array;
  /** Packed [slopeX, slopeZ] per vertex. */
  slopes: Float32Array;
  indices: Uint32Array;
  heights: Float32Array;
  diagnostics: {
    generationMs: number;
    minHeight: number;
    maxHeight: number;
    activeGuides: number;
    activeFeatures: number;
    triangles: number;
  };
}

export function createPresetRecipe(presetId: MountainPresetId, seed = 261111): ColdSmokeMountainRecipe {
  const baseDomain: FieldDomain = {
    minX: -600,
    minZ: -600,
    width: 1200,
    depth: 1200,
    resolution: 193
  };
  const baseVista: VistaSettings = {
    lighting: "day",
    sunAzimuthDegrees: -12,
    sunElevationDegrees: 11.5,
    fogDensity: 0.00045,
    showCloudSea: true,
    showFarRanges: true,
    showCity: true
  };
  const baseForest: ForestSettings = {
    enabled: true,
    density: 1.0,
    treeLineHeight: 165
  };

  if (presetId === "twin-couloirs") {
    return {
      presetId,
      seed,
      domain: { ...baseDomain },
      corridor: {
        enabled: true,
        halfWidth: 42,
        apronWidth: 32,
        wallHeight: 110,
        sinuosity: 0.55,
        baseSlope: 0.14
      },
      guides: [
        {
          id: "west-peak",
          name: "West Couloir Massif · 西峰岩体",
          role: "massif",
          enabled: true,
          center: [-310, 0, -90],
          size: [420, 310, 560],
          yawDegrees: 14,
          slopeRate: 1.35,
          crownShape: 0.65,
          reliefBoost: 1.25
        },
        {
          id: "east-peak",
          name: "East Buttress Massif · 东壁主峰",
          role: "massif",
          enabled: true,
          center: [320, 0, -40],
          size: [440, 340, 620],
          yawDegrees: -18,
          slopeRate: 1.45,
          crownShape: 0.72,
          reliefBoost: 1.35
        },
        {
          id: "north-saddle",
          name: "High Col Wall · 北侧鞍部岩墙",
          role: "wall",
          enabled: true,
          center: [10, 0, -390],
          size: [520, 210, 280],
          yawDegrees: 4,
          slopeRate: 1.15,
          crownShape: 0.3,
          reliefBoost: 1.0
        },
        {
          id: "central-basin",
          name: "Runout Bowl · 中央雪盆",
          role: "basin",
          enabled: true,
          center: [0, 0, 120],
          size: [240, 65, 680],
          yawDegrees: -4,
          slopeRate: 0.8,
          crownShape: -0.5,
          reliefBoost: 0.2
        }
      ],
      features: [
        {
          id: "gully-west-main",
          name: "West Great Couloir · 西主雪槽",
          kind: "gully",
          enabled: true,
          points: [
            [-350, -180],
            [-210, -110],
            [-65, -20]
          ],
          depth: 48,
          width: 68,
          sharpness: 0.78,
          tributaries: true,
          tributarySpacing: 75,
          tributaryStrength: 0.55
        },
        {
          id: "gully-east-chute",
          name: "East Hanging Chute · 东悬冰槽",
          kind: "gully",
          enabled: true,
          points: [
            [365, -120],
            [225, -45],
            [72, 45]
          ],
          depth: 54,
          width: 64,
          sharpness: 0.82,
          tributaries: true,
          tributarySpacing: 70,
          tributaryStrength: 0.6
        },
        {
          id: "valley-north-col",
          name: "North Col Trough · 鞍部主谷",
          kind: "valley",
          enabled: true,
          points: [
            [15, -480],
            [-12, -120],
            [18, 460]
          ],
          depth: 38,
          width: 115,
          sharpness: 0.32,
          tributaries: true,
          tributarySpacing: 110,
          tributaryStrength: 0.35
        },
        {
          id: "ridge-east-spur",
          name: "East Arête Spur · 东侧刃脊",
          kind: "ridge",
          enabled: true,
          points: [
            [340, -290],
            [250, -165],
            [115, -80]
          ],
          depth: 42,
          width: 72,
          sharpness: 0.85,
          tributaries: false,
          tributarySpacing: 80,
          tributaryStrength: 0
        }
      ],
      relief: { enabled: true, amplitude: 1.15, scaleMetres: 1350, octaves: 3 },
      proceduralGullies: { enabled: true, octaves: 4, strength: 1.15, tributaryBend: 1.4, wavelengthScale: 1.0 },
      strata: { enabled: true, benchCarving: 1.0, bedThickness: 64, foldStrength: 1.0, rockMode: "bands" },
      forest: { ...baseForest },
      sculptStamps: [],
      vista: baseVista
    };
  }

  if (presetId === "knife-ridge") {
    return {
      presetId,
      seed,
      domain: { ...baseDomain },
      corridor: {
        enabled: false,
        halfWidth: 32,
        apronWidth: 24,
        wallHeight: 60,
        sinuosity: 0.35,
        baseSlope: 0.12
      },
      guides: [
        {
          id: "central-spine",
          name: "Central Spine Ridge · 中央主山脊",
          role: "ridge",
          enabled: true,
          center: [0, 0, -40],
          size: [280, 290, 920],
          yawDegrees: -8,
          slopeRate: 1.4,
          crownShape: 0.85,
          reliefBoost: 1.15
        },
        {
          id: "outer-west-rim",
          name: "West Flank Massif · 西侧远壁",
          role: "massif",
          enabled: true,
          center: [-420, 0, -80],
          size: [320, 260, 860],
          yawDegrees: -4,
          slopeRate: 1.25,
          crownShape: 0.5,
          reliefBoost: 1.2
        },
        {
          id: "outer-east-rim",
          name: "East Flank Massif · 东侧远壁",
          role: "massif",
          enabled: true,
          center: [430, 0, 20],
          size: [320, 240, 840],
          yawDegrees: 10,
          slopeRate: 1.2,
          crownShape: 0.5,
          reliefBoost: 1.15
        }
      ],
      features: [
        {
          id: "west-side-valley",
          name: "West Side Hollow · 西侧深谷",
          kind: "valley",
          enabled: true,
          points: [
            [-210, -460],
            [-185, -20],
            [-220, 460]
          ],
          depth: 85,
          width: 130,
          sharpness: 0.4,
          tributaries: true,
          tributarySpacing: 95,
          tributaryStrength: 0.5
        },
        {
          id: "east-side-valley",
          name: "East Side Hollow · 东侧深谷",
          kind: "valley",
          enabled: true,
          points: [
            [205, -460],
            [220, 10],
            [195, 460]
          ],
          depth: 80,
          width: 125,
          sharpness: 0.42,
          tributaries: true,
          tributarySpacing: 95,
          tributaryStrength: 0.5
        },
        {
          id: "spine-crest",
          name: "Summit Knife Arête · 峰顶刃脊",
          kind: "ridge",
          enabled: true,
          points: [
            [28, -420],
            [-14, -30],
            [22, 390]
          ],
          depth: 46,
          width: 65,
          sharpness: 0.9,
          tributaries: false,
          tributarySpacing: 80,
          tributaryStrength: 0
        }
      ],
      relief: { enabled: true, amplitude: 1.0, scaleMetres: 1400, octaves: 3 },
      proceduralGullies: { enabled: true, octaves: 4, strength: 1.05, tributaryBend: 1.35, wavelengthScale: 1.0 },
      strata: { enabled: true, benchCarving: 1.05, bedThickness: 64, foldStrength: 1.1, rockMode: "heavy" },
      forest: { ...baseForest, density: 0.7 },
      sculptStamps: [],
      vista: { ...baseVista, lighting: "golden", sunElevationDegrees: 5.5 }
    };
  }

  if (presetId === "cirque-basin") {
    return {
      presetId,
      seed,
      domain: { ...baseDomain },
      corridor: {
        enabled: false,
        halfWidth: 45,
        apronWidth: 36,
        wallHeight: 90,
        sinuosity: 0.4,
        baseSlope: 0.1
      },
      guides: [
        {
          id: "cirque-headwall",
          name: "North Cirque Headwall · 冰斗后壁主峰",
          role: "massif",
          enabled: true,
          center: [0, 0, -340],
          size: [760, 350, 380],
          yawDegrees: 0,
          slopeRate: 1.55,
          crownShape: 0.65,
          reliefBoost: 1.35
        },
        {
          id: "cirque-west-wing",
          name: "West Wing Wall · 西翼山肩",
          role: "wall",
          enabled: true,
          center: [-340, 0, 40],
          size: [360, 290, 680],
          yawDegrees: 22,
          slopeRate: 1.35,
          crownShape: 0.55,
          reliefBoost: 1.15
        },
        {
          id: "cirque-east-wing",
          name: "East Wing Wall · 东翼山肩",
          role: "wall",
          enabled: true,
          center: [340, 0, 40],
          size: [360, 280, 680],
          yawDegrees: -22,
          slopeRate: 1.35,
          crownShape: 0.55,
          reliefBoost: 1.15
        },
        {
          id: "cirque-tarn-basin",
          name: "Glacial Tarn Basin · 冰斗谷底",
          role: "basin",
          enabled: true,
          center: [0, 0, 60],
          size: [380, 95, 520],
          yawDegrees: 0,
          slopeRate: 0.9,
          crownShape: -0.7,
          reliefBoost: 0.15
        }
      ],
      features: [
        {
          id: "headwall-central-couloir",
          name: "Headwall King Line · 后壁中央直槽",
          kind: "gully",
          enabled: true,
          points: [
            [0, -430],
            [-18, -220],
            [0, -10]
          ],
          depth: 56,
          width: 72,
          sharpness: 0.84,
          tributaries: true,
          tributarySpacing: 68,
          tributaryStrength: 0.65
        },
        {
          id: "west-wall-gully",
          name: "West Amphitheatre Chute · 西壁支槽",
          kind: "gully",
          enabled: true,
          points: [
            [-360, -180],
            [-220, -60],
            [-70, 50]
          ],
          depth: 44,
          width: 58,
          sharpness: 0.76,
          tributaries: true,
          tributarySpacing: 65,
          tributaryStrength: 0.5
        },
        {
          id: "east-wall-gully",
          name: "East Amphitheatre Chute · 东壁支槽",
          kind: "gully",
          enabled: true,
          points: [
            [360, -160],
            [215, -40],
            [75, 65]
          ],
          depth: 42,
          width: 58,
          sharpness: 0.76,
          tributaries: true,
          tributarySpacing: 65,
          tributaryStrength: 0.5
        },
        {
          id: "outflow-valley",
          name: "Cirque Exit Valley · 冰斗出口山谷",
          kind: "valley",
          enabled: true,
          points: [
            [0, 10],
            [16, 260],
            [-10, 540]
          ],
          depth: 36,
          width: 120,
          sharpness: 0.28,
          tributaries: false,
          tributarySpacing: 90,
          tributaryStrength: 0.3
        }
      ],
      relief: { enabled: true, amplitude: 1.1, scaleMetres: 1400, octaves: 3 },
      proceduralGullies: { enabled: true, octaves: 4, strength: 1.1, tributaryBend: 1.4, wavelengthScale: 1.0 },
      strata: { enabled: true, benchCarving: 1.0, bedThickness: 64, foldStrength: 1.0, rockMode: "bands" },
      forest: { ...baseForest },
      sculptStamps: [],
      vista: baseVista
    };
  }

  // Default: "hanyan-valley" (寒烟山谷 · Mount Cold Smoke Valley & Flanking Massifs)
  return {
    presetId,
    seed,
    domain: { ...baseDomain },
    corridor: {
      enabled: true,
      halfWidth: 48,
      apronWidth: 36,
      wallHeight: 145,
      sinuosity: 1.0,
      baseSlope: 0.16
    },
    guides: [
      {
        id: "west-massif-north",
        name: "West Shoulder Massif · 西北邻山主峰",
        role: "massif",
        enabled: true,
        center: [-350, 0, -180],
        size: [420, 310, 540],
        yawDegrees: 12,
        slopeRate: 1.25,
        crownShape: 0.6,
        reliefBoost: 1.25
      },
      {
        id: "west-massif-south",
        name: "West Lower Buttress · 西南侧壁山肩",
        role: "wall",
        enabled: true,
        center: [-330, 0, 240],
        size: [380, 230, 480],
        yawDegrees: -8,
        slopeRate: 1.15,
        crownShape: 0.45,
        reliefBoost: 1.05
      },
      {
        id: "east-massif-main",
        name: "East Great Massif · 东侧寒烟主壁",
        role: "massif",
        enabled: true,
        center: [355, 0, -40],
        size: [430, 335, 760],
        yawDegrees: -14,
        slopeRate: 1.35,
        crownShape: 0.7,
        reliefBoost: 1.3
      },
      {
        id: "east-high-ridge",
        name: "East Skyline Crest · 东翼天际山脊",
        role: "ridge",
        enabled: true,
        center: [260, 0, -340],
        size: [260, 260, 420],
        yawDegrees: 24,
        slopeRate: 1.45,
        crownShape: 0.8,
        reliefBoost: 1.15
      }
    ],
    features: [
      {
        id: "gully-east-couloir-1",
        name: "East Main Couloir · 东壁一号大雪槽",
        kind: "gully",
        enabled: true,
        points: [
          [410, -140],
          [245, -70],
          [85, 10]
        ],
        depth: 50,
        width: 66,
        sharpness: 0.8,
        tributaries: true,
        tributarySpacing: 72,
        tributaryStrength: 0.58
      },
      {
        id: "gully-west-couloir-1",
        name: "West North Couloir · 西壁北雪槽",
        kind: "gully",
        enabled: true,
        points: [
          [-410, -240],
          [-250, -155],
          [-88, -60]
        ],
        depth: 46,
        width: 62,
        sharpness: 0.76,
        tributaries: true,
        tributarySpacing: 68,
        tributaryStrength: 0.52
      },
      {
        id: "valley-side-trough",
        name: "West Hanging Valley · 西侧悬谷",
        kind: "valley",
        enabled: true,
        points: [
          [-460, 60],
          [-265, 110],
          [-75, 185]
        ],
        depth: 38,
        width: 105,
        sharpness: 0.35,
        tributaries: true,
        tributarySpacing: 90,
        tributaryStrength: 0.4
      },
      {
        id: "ridge-east-buttress",
        name: "East Dividing Rib · 东壁分水肋脊",
        kind: "ridge",
        enabled: true,
        points: [
          [420, 40],
          [255, 65],
          [98, 105]
        ],
        depth: 36,
        width: 60,
        sharpness: 0.84,
        tributaries: false,
        tributarySpacing: 75,
        tributaryStrength: 0
      }
    ],
    relief: { enabled: true, amplitude: 1.0, scaleMetres: 1400, octaves: 3 },
    proceduralGullies: { enabled: true, octaves: 4, strength: 1.0, tributaryBend: 1.4, wavelengthScale: 1.0 },
    strata: { enabled: true, benchCarving: 1.0, bedThickness: 64, foldStrength: 1.0, rockMode: "bands" },
    forest: { ...baseForest },
    sculptStamps: [],
    vista: baseVista
  };
}
