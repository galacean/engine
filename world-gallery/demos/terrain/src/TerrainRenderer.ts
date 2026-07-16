import {
  BoundingBox,
  Buffer,
  BufferBindFlag,
  BufferMesh,
  BufferUsage,
  Engine,
  Entity,
  IndexFormat,
  MeshRenderer,
  ShaderProperty,
  Texture2D,
  VertexElement,
  VertexElementFormat,
  Vector2
} from "@galacean/engine";

/**
 * Terrain plane renderer — a subclass of Galacean's MeshRenderer so we inherit the standard render-pipeline
 * hookup (frustum culling, priority sort, shadow caster harvesting) instead of hand-rolling `_render`. The
 * only thing we add is a plane mesh builder and the tile-specific ShaderData bindings; the layer library
 * lives on the shared TerrainMaterial so many tiles can reuse one material.
 */
export class TerrainRenderer extends MeshRenderer {
  // Class-static ShaderProperty handles — matches engine convention (Renderer / BaseMaterial pattern).
  private static readonly _heightMapProp = ShaderProperty.getByName("renderer_HeightMap");
  private static readonly _controlMapProp = ShaderProperty.getByName("renderer_ControlMap");
  private static readonly _heightRangeProp = ShaderProperty.getByName("renderer_HeightRange");
  private static readonly _tileSizeProp = ShaderProperty.getByName("renderer_TileSize");
  private static readonly _heightTexelSizeProp = ShaderProperty.getByName("renderer_HeightTexelSize");

  private _resolution = 129;
  private _tileSize = 256;
  private _heightMin = 0;
  private _heightMax = 1;
  private _heightRange = new Vector2();

  constructor(entity: Entity) {
    super(entity);
    this._rebuildMesh(entity.engine);
  }

  /** Vertex resolution per side. Must be at least 2. Rebuilds the mesh. */
  setResolution(n: number): void {
    if (n < 2 || n === this._resolution) return;
    this._resolution = n;
    this._rebuildMesh(this.engine);
  }

  /** World-space tile side length in metres. Feeds both shader (tile scale) and bounds. */
  setTileSize(metres: number): void {
    this._tileSize = metres;
    this.shaderData.setFloat(TerrainRenderer._tileSizeProp, metres);
    this._updateWorldBoundsDirty();
  }

  setHeightRange(minMetres: number, maxMetres: number): void {
    this._heightMin = minMetres;
    this._heightMax = maxMetres;
    this._heightRange.set(minMetres, maxMetres);
    this.shaderData.setVector2(TerrainRenderer._heightRangeProp, this._heightRange);
    this._updateWorldBoundsDirty();
  }

  setHeightMap(tex: Texture2D): void {
    this.shaderData.setTexture(TerrainRenderer._heightMapProp, tex);
    // 1/resolution → shader normal derivative step size in UV space.
    this.shaderData.setFloat(TerrainRenderer._heightTexelSizeProp, 1 / tex.width);
  }

  setControlMap(tex: Texture2D): void {
    this.shaderData.setTexture(TerrainRenderer._controlMapProp, tex);
  }

  private _rebuildMesh(engine: Engine): void {
    const n = this._resolution;
    const vertexCount = n * n;
    const positions = new Float32Array(vertexCount * 3);
    const step = 1 / (n - 1);

    for (let y = 0; y < n; y++) {
      const zNorm = y * step - 0.5;
      for (let x = 0; x < n; x++) {
        const xNorm = x * step - 0.5;
        const i = (y * n + x) * 3;
        positions[i] = xNorm;
        positions[i + 1] = 0;
        positions[i + 2] = zNorm;
      }
    }

    const quadCount = (n - 1) * (n - 1);
    const indices = new Uint32Array(quadCount * 6);
    let ptr = 0;
    for (let y = 0; y < n - 1; y++) {
      for (let x = 0; x < n - 1; x++) {
        const tl = y * n + x;
        const tr = tl + 1;
        const bl = tl + n;
        const br = bl + 1;
        indices[ptr++] = tl;
        indices[ptr++] = bl;
        indices[ptr++] = br;
        indices[ptr++] = tl;
        indices[ptr++] = br;
        indices[ptr++] = tr;
      }
    }

    const mesh = new BufferMesh(engine, "TerrainPlane");
    const posBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, positions, BufferUsage.Static);
    const indexBuffer = new Buffer(engine, BufferBindFlag.IndexBuffer, indices, BufferUsage.Static);
    mesh.setVertexBufferBinding(posBuffer, 12, 0);
    mesh.setIndexBufferBinding(indexBuffer, IndexFormat.UInt32);
    mesh.setVertexElements([new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0)]);
    mesh.addSubMesh(0, indices.length);
    // MeshRenderer owns the mesh lifecycle after this — assigning replaces the previous mesh reference
    // and MeshRenderer handles refcount/dispose.
    this.mesh = mesh;
    // Ensure the world bounds refresh once the new mesh is up.
    this._updateWorldBoundsDirty();
  }

  protected override _updateBounds(worldBounds: BoundingBox): void {
    const half = 0.5 * this._tileSize;
    worldBounds.min.set(-half, this._heightMin, -half);
    worldBounds.max.set(half, this._heightMax, half);
    BoundingBox.transform(worldBounds, this._transformEntity.transform.worldMatrix, worldBounds);
  }

  private _updateWorldBoundsDirty(): void {
    // Force MeshRenderer's bounds cache to refresh next frame; matches the flag it sets when mesh changes.
    (this as any)._dirtyUpdateFlag |= 0x1;
  }
}
