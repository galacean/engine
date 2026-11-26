import { BoundingBox, ForwardOpaqueOrder, MeshRenderer, RendererUpdateFlags, ShaderProperty } from "@galacean/engine";

/** Clipmap segment renderer containing only segment-specific shader state. */
export class TerrainRenderer extends MeshRenderer {
  private static readonly _lod = ShaderProperty.getByName("renderer_Lod");
  private static readonly _clipmapMeshSize = ShaderProperty.getByName("renderer_ClipmapMeshSize");

  /** @internal */
  override _forwardOpaqueOrder = ForwardOpaqueOrder.Background;

  private _localMinY: number | undefined;
  private _localMaxY: number | undefined;
  private readonly _localBoundsScratch = new BoundingBox();

  /**
   * Overrides the shared template mesh vertical range with segment-local bounds.
   * @param minY Conservative world-space minimum terrain height inside this segment.
   * @param maxY Conservative world-space maximum terrain height inside this segment.
   */
  setVerticalBounds(minY: number, maxY: number): void {
    if (this._localMinY === minY && this._localMaxY === maxY) return;
    this._localMinY = minY;
    this._localMaxY = maxY;
    this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
  }

  /** Restores inheritance of the shared template mesh vertical bounds. */
  clearVerticalBounds(): void {
    if (this._localMinY === undefined && this._localMaxY === undefined) return;
    this._localMinY = undefined;
    this._localMaxY = undefined;
    this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
  }

  /** @internal */
  protected override _updateBounds(worldBounds: BoundingBox): void {
    const mesh = this._mesh;
    if (!mesh || this._localMinY === undefined || this._localMaxY === undefined) {
      super._updateBounds(worldBounds);
      return;
    }
    const localBounds = this._localBoundsScratch;
    localBounds.copyFrom(mesh.bounds);
    localBounds.min.y = this._localMinY;
    localBounds.max.y = this._localMaxY;
    BoundingBox.transform(localBounds, this._transformEntity!.transform.worldMatrix, worldBounds);
  }

  /**
   * Records the segment's Clipmap sampling level and topology size.
   * @param lod Zero-based clipmap LOD.
   * @param meshSize Number of quads along one reusable square tile edge.
   * @throws If either renderer value is invalid.
   */
  setLod(lod: number, meshSize: number): void {
    if (!Number.isInteger(lod) || lod < 0 || !Number.isInteger(meshSize) || meshSize < 8) {
      throw new Error("Terrain Clipmap renderer LOD values are invalid");
    }
    this.shaderData.setFloat(TerrainRenderer._lod, lod);
    this.shaderData.setFloat(TerrainRenderer._clipmapMeshSize, meshSize);
  }
}
