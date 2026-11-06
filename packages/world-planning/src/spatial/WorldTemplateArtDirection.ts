import type { TemplateNode } from "./WorldTemplateGeometry";

/** Authored scene measurements from the fifteen supplied reference images.
 * These are template inputs, not geometry guessed from a Seed or renderer output.
 * A model entry is a single unavailable asset envelope; it is never a primitive
 * reconstruction of the named asset. Camera fitting uses only the focus entries. */
export interface WorldTemplateArtDirection {
  reference: string;
  focus: string[];
  frameFraction: number;
  azimuthDegrees: number;
  /** Composition aim relative to the focus envelope; a side subject stays at the side. */
  lookAtOffset?: [number, number, number];
  models: TemplateNode[];
  grass: [string, string];
  ground: string;
  foliage: string;
  bark: string;
  flowers: string;
  stone: string;
  lighting: Record<string, number | boolean>;
  postProcess: Record<string, number | boolean>;
  landscape?: Record<string, number>;
  flowerCoverage?: number;
  weather?: {
    cloudCoverage?: number;
    rainRate?: number;
    snowRate?: number;
    temperatureCelsius?: number;
    relativeHumidity?: number;
  };
  /** Real native water bodies. Depth/level are independent from their colour. */
  water?: { id: string; x: number; z: number; radius: number; depth: number; color: [number, number, number] }[];
  support?: "land" | "submerged";
  /** Authored vegetation areas form the reference's core foreground/background. */
  plantings?: { id: string; kind: "tree" | "shrub"; x: number; z: number; radius: number; densityScale: number }[];
  /** Relative core landforms. Heights and positions remain fixed with the subject. */
  terrain?: {
    id: string;
    x: number;
    z: number;
    kind: "ridge" | "plateau" | "valley" | "basin";
    length: number;
    width: number;
    height: number;
    heading: number;
  }[];
}
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
const plateau = (id: string, x: number, z: number, length: number, width: number, height: number) => ({
  id,
  x,
  z,
  length,
  width,
  height,
  heading: 0,
  kind: "plateau" as const
});

export const WORLD_TEMPLATE_ART: Readonly<Record<string, WorldTemplateArtDirection>> = {
  "sakura-pearl": {
    reference: "SeedWorld-01-sakura-pearl.png",
    focus: ["pearl-cherry-tree"],
    frameFraction: 0.8,
    azimuthDegrees: 0,
    models: [
      model("pearl-cherry-tree", [0, 0, 15], [92, 82, 70]),
      model("garden-pavilion", [67, 0, -4], [16, 18, 15]),
      model("garden-tower", [82, 0, 20], [12, 27, 12])
    ],
    grass: ["#c96398", "#f3b5d1"],
    ground: "#f0d4e3",
    foliage: "#f0a4c7",
    bark: "#e4dce8",
    flowers: "#fff2fa",
    stone: "#c9b6d1",
    lighting: {
      ...lighting(9.5, 2.1, 1.25, 1.3, 0.00025, 0.55),
      ...atmosphere([0.765, 1.6, 1.6], [1.1, 1.15, 1.2]),
      skyTintR: 0.557,
      skyTintG: 0.626,
      skyTintB: 0.747,
      sunColorR: 1.04,
      sunColorG: 1,
      sunColorB: 1.08
    },
    postProcess: post(8, 7),
    landscape: { treeHeightMinM: 8, treeHeightMaxM: 18 },
    flowerCoverage: 0.65,
    terrain: [plateau("west-cliffs", -190, 65, 330, 100, 58), plateau("east-cliffs", 180, 100, 330, 115, 65)],
    water: [
      { id: "west-garden-pool", x: -75, z: -80, radius: 32, depth: 2, color: [159, 193, 202] },
      { id: "east-garden-pool", x: 72, z: -92, radius: 34, depth: 2, color: [159, 193, 202] }
    ]
  },
  "aurora-palace": {
    reference: "SeedWorld-02-aurora-ice-palace.png",
    focus: ["ice-cavern-shell"],
    frameFraction: 0.8,
    azimuthDegrees: 0,
    models: [
      model("central-ice-crystal", [8, 0, 36], [17, 33, 17]),
      model("ice-cavern-shell", [0, 0, 60], [124, 80, 110]),
      model("west-crystal-cluster", [-46, 0, -10], [13, 27, 12]),
      model("east-crystal-cluster", [50, 0, 8], [14, 38, 15])
    ],
    grass: ["#b2c9ef", "#edf4ff"],
    ground: "#d0e0f8",
    foliage: "#d9e9f5",
    bark: "#b6cedf",
    flowers: "#ffffff",
    stone: "#b3c9eb",
    lighting: {
      ...lighting(21.5, 0.12, 2.8, 1.1, 0.00045, 0.45),
      ...atmosphere([1, 1, 1], [1, 1, 1], [1.3, 1.25, 1.05], 0.55)
    },
    postProcess: post(6, 3, -3),
    terrain: [ridge("west-ice-wall", -110, 55, 330, 72, 65), ridge("east-ice-wall", 110, 55, 330, 72, 65)]
  },
  "emerald-forest": {
    reference: "SeedWorld-03-emerald-rainforest.png",
    focus: ["giant-luminous-mushroom"],
    frameFraction: 0.65,
    azimuthDegrees: -8,
    lookAtOffset: [-12, 0, 0],
    models: [
      model("giant-luminous-mushroom", [12, 0, 7], [15, 18, 15]),
      model("small-luminous-mushroom", [22, 0, 3], [6, 8, 6]),
      model("fallen-forest-trunk", [-8, 3, 28], [40, 7, 8], false, 12)
    ],
    grass: ["#174e2b", "#4a822d"],
    ground: "#756b34",
    foliage: "#23854b",
    bark: "#69532d",
    flowers: "#8be3c1",
    stone: "#3d7562",
    lighting: {
      ...lighting(10.3, 1.7, 1.5, 1.1, 0.0009, 0.7),
      ...atmosphere([0.45, 1.25, 0.85], [0.65, 1.5, 0.75]),
      sunColorR: 0.95,
      sunColorG: 1.12,
      sunColorB: 0.85
    },
    postProcess: post(12, 10),
    landscape: { treeHeightMinM: 23, treeHeightMaxM: 42 },
    flowerCoverage: 0.18,
    plantings: [
      { id: "west-forest-grove", kind: "tree", x: -28, z: 8, radius: 18, densityScale: 0.15 },
      { id: "east-forest-grove", kind: "tree", x: 42, z: 18, radius: 18, densityScale: 0.15 },
      { id: "forest-backdrop", kind: "tree", x: 0, z: 60, radius: 35, densityScale: 0.15 }
    ],
    terrain: [ridge("west-forest-bank", -70, 40, 220, 46, 18), ridge("east-forest-bank", 70, 40, 220, 46, 20)]
  },
  "amethyst-ruins": {
    reference: "SeedWorld-04-amethyst-cosmic-ruins.png",
    focus: ["amethyst-temple"],
    frameFraction: 0.75,
    azimuthDegrees: 8,
    lookAtOffset: [10, 0, 0],
    models: [
      model("amethyst-temple", [-10, 0, 18], [45, 58, 35]),
      model("temple-crystal", [-12, 0, 28], [24, 67, 22]),
      model("east-floating-ruins", [85, 45, 95], [35, 42, 30], false),
      model("cosmic-whale", [100, 93, 155], [75, 22, 20], false),
      model("floating-jellyfish", [40, 20, -10], [12, 30, 12], false)
    ],
    grass: ["#684ba2", "#bd8cde"],
    ground: "#a599bd",
    foliage: "#9871cc",
    bark: "#77728d",
    flowers: "#e3a5ff",
    stone: "#9a8db4",
    lighting: {
      ...lighting(22, 0.12, 3.2, 0.8, 0.0005, 0.45),
      ...atmosphere([1, 1, 1], [1, 1, 1], [2.4, 0.5, 1.2], 0.65),
      fogTintR: 1.2,
      fogTintG: 0.8,
      fogTintB: 1.15
    },
    postProcess: post(9, 8),
    landscape: { treeHeightMinM: 7, treeHeightMaxM: 14 },
    flowerCoverage: 0.25,
    terrain: [plateau("ruin-terrace", 0, 25, 160, 130, 18)]
  },
  "cobalt-atlantis": {
    reference: "SeedWorld-05-cobalt-atlantis.png",
    focus: ["sapphire-temple"],
    frameFraction: 0.75,
    azimuthDegrees: -5,
    models: [
      model("sapphire-temple", [12, 0, 20], [42, 55, 36]),
      model("west-ruined-arch", [-37, 0, 5], [20, 31, 12]),
      model("east-ruined-column", [53, 0, 12], [8, 39, 8]),
      model("west-coral-reef", [-43, 0, -43], [23, 12, 22]),
      model("east-coral-reef", [44, 0, -34], [22, 14, 20])
    ],
    grass: ["#125b91", "#258ec3"],
    ground: "#7cbacb",
    foliage: "#197799",
    bark: "#3d6f91",
    flowers: "#5cc9ed",
    stone: "#4e9ec5",
    lighting: {
      ...lighting(11.5, 2, 1.7, 1.1, 0.005, 0.35),
      ...atmosphere([0.22, 0.9, 1.8], [0.28, 1.2, 1.7]),
      sunColorR: 0.25,
      sunColorG: 1.05,
      sunColorB: 1.65,
      fogTintR: 0.18,
      fogTintG: 1.05,
      fogTintB: 1.7
    },
    postProcess: post(8, 10, -3),
    terrain: [ridge("west-reef", -110, 45, 300, 70, 28), ridge("east-reef", 115, 65, 320, 75, 35)],
    support: "submerged",
    water: [{ id: "atlantis-water", x: 0, z: 0, radius: 280, depth: 75, color: [42, 115, 151] }]
  },
  "golden-palace": {
    reference: "SeedWorld-06-golden-sun-palace.png",
    focus: ["sacred-chalice", "golden-colonnade"],
    frameFraction: 0.75,
    azimuthDegrees: -12,
    lookAtOffset: [-10, 0, 0],
    models: [model("golden-colonnade", [21, 0, 25], [58, 53, 35]), model("sacred-chalice", [6, 0, -3], [9, 12, 9])],
    grass: ["#9d833f", "#d2b963"],
    ground: "#f0d6a6",
    foliage: "#cba552",
    bark: "#92704d",
    flowers: "#ffe4a3",
    stone: "#d4c5b1",
    lighting: {
      ...lighting(17.3, 2, 1.4, 1.5, 0.00035, 0.55),
      ...atmosphere([2.3, 1.1, 0.8], [2.2, 1.2, 0.75]),
      sunColorR: 1.25,
      sunColorG: 1.05,
      sunColorB: 0.85,
      sunSize: 0.035,
      fogTintR: 1.2,
      fogTintG: 1,
      fogTintB: 0.85
    },
    postProcess: post(9, 4, 1),
    landscape: { treeHeightMinM: 7, treeHeightMaxM: 14 },
    flowerCoverage: 0.12,
    terrain: [plateau("temple-terrace", 20, 35, 190, 120, 15)]
  },
  "crimson-torii": {
    reference: "SeedWorld-07-crimson-torii-eclipse.png",
    focus: ["great-torii", "suspended-bell"],
    frameFraction: 0.75,
    azimuthDegrees: -10,
    lookAtOffset: [12, 0, 0],
    models: [
      model("great-torii", [-8, 0, 12], [35, 35, 8]),
      model("suspended-bell", [-8, 17, 10], [10, 16, 10], false),
      model("distant-torii", [45, 0, 95], [16, 18, 4]),
      model("eclipse-disc", [70, 120, 200], [80, 80, 4], false)
    ],
    grass: ["#9d2534", "#e45649"],
    ground: "#a3918d",
    foliage: "#d02c36",
    bark: "#543a43",
    flowers: "#ef6552",
    stone: "#7e778d",
    lighting: {
      ...lighting(18.4, 1.5, 2.1, 1.1, 0.0007, 0.6),
      ...atmosphere([5, 0.6, 0.24], [3.2, 0.8, 0.4], [1.5, 0.6, 0.65], 0.2),
      sunColorR: 1.5,
      sunColorG: 0.65,
      sunColorB: 0.5,
      fogTintR: 1.4,
      fogTintG: 0.65,
      fogTintB: 0.8
    },
    postProcess: post(10, 9),
    landscape: { treeHeightMinM: 8, treeHeightMaxM: 18 },
    terrain: [ridge("west-canyon", -150, 100, 360, 85, 90), ridge("east-canyon", 170, 110, 380, 100, 110)]
  },
  "cyber-void": {
    reference: "SeedWorld-08-obsidian-cyber-void.png",
    focus: ["mechanical-cube"],
    frameFraction: 0.75,
    azimuthDegrees: 0,
    models: [
      model("mechanical-cube", [0, 32, 0], [35, 44, 35], false),
      model("west-obsidian-pillar", [-39, 0, -2], [6, 17, 6]),
      model("east-obsidian-pillar", [39, 0, -2], [6, 17, 6])
    ],
    grass: ["#161820", "#2b2e3c"],
    ground: "#252839",
    foliage: "#38404c",
    bark: "#30343d",
    flowers: "#7798a3",
    stone: "#37394c",
    lighting: {
      ...lighting(23.2, 0.03, 2, 0.13, 0.0007, 0.55),
      ...atmosphere([1, 1, 1], [1, 1, 1], [1.1, 0.9, 1.1], 0.12),
      starIntensity: 0.2
    },
    postProcess: post(10),
    terrain: []
  },
  "amber-dunes": {
    reference: "SeedWorld-09-amber-sunset-dunes.png",
    focus: ["weathered-stone-ring"],
    frameFraction: 0.65,
    azimuthDegrees: -10,
    lookAtOffset: [-8, 0, 0],
    models: [
      model("weathered-stone-ring", [15, 0, 15], [38, 42, 10]),
      model("desert-obelisk", [12, 0, -3], [9, 24, 8])
    ],
    grass: ["#c58743", "#e8b96e"],
    ground: "#e1a66b",
    foliage: "#aa874f",
    bark: "#826340",
    flowers: "#e2b25f",
    stone: "#bd865d",
    lighting: {
      ...lighting(17.6, 2.25, 1.55, 1.2, 0.00045, 0.6),
      ...atmosphere([5, 0.95, 0.18], [3.1, 1.1, 0.2]),
      sunColorR: 1.6,
      sunColorG: 0.86,
      sunColorB: 0.43,
      sunSize: 0.04,
      fogTintR: 1.35,
      fogTintG: 0.9,
      fogTintB: 0.45
    },
    postProcess: post(9, 9, 2),
    terrain: [ridge("west-dune", -150, 80, 380, 120, 24, 20), ridge("east-dune", 170, 110, 450, 140, 32, -20)]
  },
  "voxel-arcade": {
    reference: "SeedWorld-10-voxel-arcade-world.png",
    focus: ["giant-voxel-arcade"],
    frameFraction: 0.75,
    azimuthDegrees: -8,
    models: [
      model("giant-voxel-arcade", [0, 0, 15], [28, 40, 23]),
      model("west-arcade-machine", [-23, 0, -12], [5, 7, 4]),
      model("east-arcade-machine", [24, 0, -8], [5, 7, 4]),
      model("voxel-spaceship", [34, 0, -31], [12, 8, 10])
    ],
    grass: ["#32983b", "#a2ca42"],
    ground: "#c5c8c4",
    foliage: "#408d35",
    bark: "#8e785c",
    flowers: "#e6b5e5",
    stone: "#b9c4ce",
    lighting: {
      ...lighting(11, 2, 1.5, 1.3, 0.00025, 0.6),
      ...atmosphere([0.765, 1.6, 1.6], [0.95, 1.15, 1.25]),
      skyTintR: 0.557,
      skyTintG: 0.626,
      skyTintB: 0.747,
      sunColorR: 1.05,
      sunColorG: 1.03,
      sunColorB: 1
    },
    postProcess: post(12, 12),
    flowerCoverage: 0.3,
    landscape: { treeHeightMinM: 5, treeHeightMaxM: 10 }
  },
  "cosmic-islets": {
    reference: "SeedWorld-11-cosmic-islets.png",
    focus: ["foreground-stone-arch"],
    frameFraction: 0.65,
    azimuthDegrees: 0,
    lookAtOffset: [20, 0, 0],
    models: [
      model("foreground-stone-arch", [-20, 0, 5], [18, 28, 8]),
      model("east-floating-island", [92, 30, 110], [50, 42, 45], false),
      model("distant-floating-island", [-77, 56, 140], [34, 32, 30], false),
      model("cosmic-whale", [90, 110, 200], [95, 26, 24], false)
    ],
    grass: ["#4d8749", "#99b967"],
    ground: "#a7b0b5",
    foliage: "#688c69",
    bark: "#7b7e8c",
    flowers: "#c5e4dd",
    stone: "#9aabc2",
    lighting: {
      ...lighting(22.4, 0.08, 3.4, 0.8, 0.00045, 0.45),
      ...atmosphere([1, 1, 1], [1, 1, 1], [1.45, 0.65, 1.25], 0.7)
    },
    postProcess: post(8, 7),
    flowerCoverage: 0.35,
    landscape: { treeHeightMinM: 7, treeHeightMaxM: 13 }
  },
  "neon-alley": {
    reference: "SeedWorld-12-cyberpunk-alley.png",
    focus: ["west-street-facade", "east-street-facade"],
    frameFraction: 0.8,
    azimuthDegrees: 0,
    models: [
      model("west-street-facade", [-25, 0, 15], [22, 38, 65]),
      model("east-street-facade", [25, 0, 22], [22, 44, 65]),
      model("overhead-street-bridge", [0, 20, 43], [32, 7, 10], false),
      model("vending-machine", [-18, 0, -24], [6, 10, 5])
    ],
    grass: ["#31595e", "#597f7b"],
    ground: "#52638b",
    foliage: "#4b806c",
    bark: "#53677b",
    flowers: "#d399c9",
    stone: "#667b9c",
    lighting: {
      ...lighting(20.4, 0.2, 3.2, 0.65, 0.0008, 0.5),
      ...atmosphere([1, 1, 1], [1, 1, 1], [1.6, 1.1, 1.4], 0.7),
      fogTintR: 1.15,
      fogTintG: 0.9,
      fogTintB: 1.3
    },
    postProcess: post(9, 10),
    flowerCoverage: 0.12,
    landscape: { treeHeightMinM: 5, treeHeightMaxM: 10 },
    weather: { cloudCoverage: 0.65, rainRate: 0.28, temperatureCelsius: 14, relativeHumidity: 0.85 }
  },
  "titan-wasteland": {
    reference: "SeedWorld-13-titan-wasteland.png",
    focus: ["ancient-mech-wreck"],
    frameFraction: 0.7,
    azimuthDegrees: -7,
    models: [
      model("ancient-mech-wreck", [15, 0, 38], [115, 93, 80]),
      model("foreground-round-house", [-69, 0, -57], [17, 14, 16])
    ],
    grass: ["#bc7339", "#dfaa54"],
    ground: "#cf9462",
    foliage: "#ac793d",
    bark: "#775341",
    flowers: "#e1b66a",
    stone: "#9b8583",
    lighting: {
      ...lighting(17, 2.3, 1.65, 1.2, 0.0004, 0.6),
      ...atmosphere([4, 0.85, 0.32], [2.5, 1, 0.4]),
      sunColorR: 1.5,
      sunColorG: 0.88,
      sunColorB: 0.6,
      sunSize: 0.035,
      fogTintR: 1.35,
      fogTintG: 0.95,
      fogTintB: 0.7
    },
    postProcess: post(10, 8, 1),
    landscape: { treeHeightMinM: 5, treeHeightMaxM: 12 },
    flowerCoverage: 0.15,
    terrain: [ridge("west-red-dune", -220, 80, 450, 140, 30, 20), ridge("east-red-dune", 220, 120, 500, 145, 36, -20)]
  },
  "luminous-abyss": {
    reference: "SeedWorld-14-bioluminescent-abyss.png",
    focus: ["great-jellyfish"],
    frameFraction: 0.75,
    azimuthDegrees: 0,
    models: [
      model("great-jellyfish", [-5, 24, 5], [25, 44, 25], false),
      model("west-jellyfish", [-40, 18, 22], [18, 32, 18], false),
      model("east-jellyfish", [32, 20, 32], [18, 34, 18], false),
      model("sunken-ship", [65, 0, 70], [64, 31, 25], true, -20),
      model("west-coral-reef", [-48, 0, -35], [24, 14, 20]),
      model("east-coral-reef", [45, 0, -24], [22, 12, 23])
    ],
    grass: ["#155b83", "#338e9f"],
    ground: "#6d9ead",
    foliage: "#24747e",
    bark: "#3c637d",
    flowers: "#80c6e9",
    stone: "#467a9c",
    lighting: {
      ...lighting(11.8, 1.7, 1.6, 1, 0.006, 0.3),
      ...atmosphere([0.18, 0.9, 1.8], [0.25, 1.1, 1.7]),
      sunColorR: 0.22,
      sunColorG: 0.95,
      sunColorB: 1.6,
      fogTintR: 0.18,
      fogTintG: 0.9,
      fogTintB: 1.6
    },
    postProcess: post(9, 10, -3),
    terrain: [ridge("west-seabed", -110, 70, 350, 70, 22), ridge("east-seabed", 125, 100, 370, 80, 30)],
    support: "submerged",
    water: [{ id: "abyss-water", x: 0, z: 0, radius: 280, depth: 70, color: [28, 93, 126] }]
  },
  "aurora-glacier": {
    reference: "SeedWorld-15-aurora-glacier.png",
    focus: ["great-glacier-arch"],
    frameFraction: 0.7,
    azimuthDegrees: 0,
    models: [
      model("great-glacier-arch", [5, 0, 35], [100, 67, 30]),
      model("west-crystal-cluster", [-63, 0, -35], [18, 34, 18]),
      model("east-crystal-cluster", [65, 0, -4], [19, 28, 20]),
      model("aurora-dragon", [15, 115, 150], [175, 30, 22], false)
    ],
    grass: ["#a9d8e9", "#e4f5ff"],
    ground: "#b9e0ee",
    foliage: "#c1e0e5",
    bark: "#c3d4df",
    flowers: "#e6fbff",
    stone: "#9acddd",
    lighting: {
      ...lighting(22, 0.1, 2.8, 0.7, 0.0004, 0.4),
      ...atmosphere([1, 1, 1], [1, 1, 1], [0.8, 1.8, 1.3], 0.65)
    },
    postProcess: post(7, 7, -2),
    terrain: [ridge("west-glacier", -155, 80, 400, 100, 43), ridge("east-glacier", 165, 100, 400, 105, 50)]
  }
};
