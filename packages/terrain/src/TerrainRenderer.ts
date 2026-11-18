import { MeshRenderer, ShaderProperty } from "@galacean/engine";

/** Clipmap segment renderer containing only segment-specific shader state. */
export class TerrainRenderer extends MeshRenderer {
  private static readonly _lod = ShaderProperty.getByName("renderer_Lod");
  private static readonly _clipmapMeshSize = ShaderProperty.getByName("renderer_ClipmapMeshSize");

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
