import { MeshRenderer, ShaderProperty } from "@galacean/engine";

/** Clipmap segment renderer containing only segment-specific shader state. */
export class TerrainRenderer extends MeshRenderer {
  private static readonly _lod = ShaderProperty.getByName("renderer_Lod");
  private static readonly _debugWire = ShaderProperty.getByName("renderer_DebugWire");

  /**
   * Records the segment's clipmap LOD for production-shader diagnostics.
   * @param lod Zero-based clipmap LOD.
   */
  setLod(lod: number): void {
    this.shaderData.setFloat(TerrainRenderer._lod, lod);
  }

  /**
   * Marks a renderer as the line-topology companion of a clipmap segment.
   * @param enabled Whether the production shader should emit the wireframe diagnostic color.
   */
  setDebugWire(enabled: boolean): void {
    this.shaderData.setFloat(TerrainRenderer._debugWire, enabled ? 1 : 0);
  }
}
