import {
  Color,
  type Engine,
  type Entity,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  type Scene
} from "@galacean/engine";

type ColorTuple = readonly [red: number, green: number, blue: number, alpha: number];

interface TargetPalette {
  readonly timber: ColorTuple;
  readonly timberEmissive: ColorTuple;
  readonly stone: ColorTuple;
  readonly stoneEmissive: ColorTuple;
  readonly marker: ColorTuple;
  readonly markerEmissive: ColorTuple;
}

const TARGET_POSITION = Object.freeze([1482, 12.2, 1574] as const);
const EXPECTED_REFLECTION_POSITION = Object.freeze([1482, 12.2, 1583] as const);
const TARGET_TO_REFLECTION_DISTANCE_METRES = Math.hypot(
  TARGET_POSITION[0] - EXPECTED_REFLECTION_POSITION[0],
  TARGET_POSITION[2] - EXPECTED_REFLECTION_POSITION[2]
);

const PRODUCTION_PALETTE: TargetPalette = Object.freeze({
  timber: [0.24, 0.105, 0.045, 1] as const,
  timberEmissive: [0.008, 0.003, 0.001, 1] as const,
  stone: [0.62, 0.58, 0.48, 1] as const,
  stoneEmissive: [0.008, 0.007, 0.005, 1] as const,
  marker: [0.82, 0.48, 0.08, 1] as const,
  markerEmissive: [0.018, 0.007, 0.001, 1] as const
});

const ACCEPTANCE_PALETTE: TargetPalette = Object.freeze({
  timber: [0.12, 0.045, 0.018, 1] as const,
  timberEmissive: [0.006, 0.001, 0, 1] as const,
  stone: [0.88, 0.82, 0.65, 1] as const,
  stoneEmissive: [0.025, 0.02, 0.012, 1] as const,
  marker: [0.96, 0.55, 0.045, 1] as const,
  markerEmissive: [0.055, 0.014, 0.001, 1] as const
});

/** Detached diagnostics for the stable lakeside target used by the Integrated World composition. */
export interface TerrainSsrReflectionTargetSnapshot {
  readonly name: "Lakeside wayfinding gate";
  readonly visible: boolean;
  readonly acceptancePresentation: boolean;
  readonly position: readonly [x: number, y: number, z: number];
  readonly expectedReflectionPosition: readonly [x: number, y: number, z: number];
  readonly targetToReflectionDistanceMetres: number;
  readonly productionMaterialFamily: "timber-stone-ochre";
}

/**
 * A natural, high-contrast lakeside wayfinding gate placed behind the expected Water reflection patch.
 * Production and deterministic acceptance palettes are deliberately separate while sharing geometry.
 */
export class TerrainSsrReflectionTarget {
  private readonly _root: Entity;
  private readonly _mesh: ReturnType<typeof PrimitiveMesh.createCuboid>;
  private readonly _timberMaterial: PBRMaterial;
  private readonly _stoneMaterial: PBRMaterial;
  private readonly _markerMaterial: PBRMaterial;
  private _acceptancePresentation = false;
  private _destroyed = false;

  constructor(engine: Engine, scene: Scene) {
    const root = (this._root = scene.createRootEntity("Lakeside wayfinding gate"));
    root.transform.setPosition(...TARGET_POSITION);
    this._mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
    this._timberMaterial = createMaterial(engine, "Weathered cedar", 0.74, 0.02);
    this._stoneMaterial = createMaterial(engine, "Pale shoreline stone", 0.86, 0);
    this._markerMaterial = createMaterial(engine, "Ochre trail marker", 0.58, 0.01);

    this._createPart("Stone footing", [0, 0.35, 0], [3.8, 0.7, 1.55], this._stoneMaterial);
    this._createPart("Left cedar post", [-1.25, 3.35, 0], [0.72, 6, 0.72], this._timberMaterial);
    this._createPart("Right cedar post", [1.25, 3.35, 0], [0.72, 6, 0.72], this._timberMaterial);
    this._createPart("Stone lintel", [0, 6.15, 0], [4.25, 0.7, 0.8], this._stoneMaterial);
    this._createPart("Ochre direction marker", [0, 4.55, -0.43], [1.35, 1.8, 0.18], this._markerMaterial);
    this._applyPalette(PRODUCTION_PALETTE);
  }

  /** Applies deterministic presentation contrast without changing the production geometry or default materials. */
  setAcceptancePresentation(enabled: boolean): void {
    if (this._destroyed) throw new Error("Terrain SSR reflection target has been destroyed.");
    this._acceptancePresentation = !!enabled;
    this._applyPalette(enabled ? ACCEPTANCE_PALETTE : PRODUCTION_PALETTE);
  }

  inspect(): TerrainSsrReflectionTargetSnapshot {
    return Object.freeze({
      name: "Lakeside wayfinding gate",
      visible: !this._destroyed && this._root.isActive,
      acceptancePresentation: this._acceptancePresentation,
      position: TARGET_POSITION,
      expectedReflectionPosition: EXPECTED_REFLECTION_POSITION,
      targetToReflectionDistanceMetres: TARGET_TO_REFLECTION_DISTANCE_METRES,
      productionMaterialFamily: "timber-stone-ochre"
    });
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._root.destroy();
    this._mesh.destroy();
    this._timberMaterial.destroy();
    this._stoneMaterial.destroy();
    this._markerMaterial.destroy();
  }

  private _createPart(
    name: string,
    position: readonly [number, number, number],
    scale: readonly [number, number, number],
    material: PBRMaterial
  ): void {
    const part = this._root.createChild(name);
    part.transform.setPosition(...position);
    part.transform.setScale(...scale);
    const renderer = part.addComponent(MeshRenderer);
    renderer.mesh = this._mesh;
    renderer.setMaterial(material);
    renderer.castShadows = true;
    renderer.receiveShadows = true;
  }

  private _applyPalette(palette: TargetPalette): void {
    applyMaterialColor(this._timberMaterial, palette.timber, palette.timberEmissive);
    applyMaterialColor(this._stoneMaterial, palette.stone, palette.stoneEmissive);
    applyMaterialColor(this._markerMaterial, palette.marker, palette.markerEmissive);
  }
}

function createMaterial(engine: Engine, name: string, roughness: number, metallic: number): PBRMaterial {
  const material = new PBRMaterial(engine);
  material.name = name;
  material.roughness = roughness;
  material.metallic = metallic;
  return material;
}

function applyMaterialColor(material: PBRMaterial, base: ColorTuple, emissive: ColorTuple): void {
  material.baseColor = new Color(...base);
  material.emissiveColor = new Color(...emissive);
}
