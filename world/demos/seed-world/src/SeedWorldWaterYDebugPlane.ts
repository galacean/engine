import { Color, type Engine, type Entity, MeshRenderer, PrimitiveMesh, UnlitMaterial } from "@galacean/engine";

export interface SeedWorldWaterYDebugPlaneSpec {
  readonly bodyId: string;
  readonly centerXMetres: number;
  readonly centerZMetres: number;
  readonly sizeMetres: number;
  readonly waterYMetres: number;
}

/** Renders one uncut square at an authoritative Lake water level for Terrain/Water diagnosis. */
export class SeedWorldWaterYDebugPlane {
  private readonly _root: Entity;
  private readonly _mesh: ReturnType<typeof PrimitiveMesh.createPlane>;
  private readonly _material: UnlitMaterial;

  /**
   * Creates one opaque horizontal square without invoking Water shoreline compilation.
   * @param engine Engine owning the diagnostic GPU resources.
   * @param parent Parent generated-world entity.
   * @param spec Authoritative Lake bounds and water level expressed in world metres.
   */
  constructor(engine: Engine, parent: Entity, readonly spec: Readonly<SeedWorldWaterYDebugPlaneSpec>) {
    this._root = parent.createChild(`WaterY Debug Plane · ${spec.bodyId}`);
    this._root.transform.setPosition(spec.centerXMetres, spec.waterYMetres, spec.centerZMetres);
    this._mesh = PrimitiveMesh.createPlane(engine, spec.sizeMetres, spec.sizeMetres, 1, 1, false);
    this._material = new UnlitMaterial(engine);
    this._material.name = "Seed World WaterY Debug Plane";
    this._material.baseColor = new Color(0.08, 0.58, 0.92, 1);
    const renderer = this._root.addComponent(MeshRenderer);
    renderer.mesh = this._mesh;
    renderer.setMaterial(this._material);
    renderer.castShadows = false;
    renderer.priority = 4;
  }

  /** Releases the diagnostic entity and its GPU resources. */
  destroy(): void {
    this._root.destroy();
    this._mesh.destroy(true);
    this._material.destroy();
  }
}
