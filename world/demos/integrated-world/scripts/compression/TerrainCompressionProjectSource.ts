import type { TerrainProjectFile } from "@galacean/engine-terrain/terrain/project/TerrainProjectContract";
import {
  TerrainBrotliResultType,
  TerrainCompressionAssetType,
  type TerrainBrotliLoaderParams
} from "@galacean/engine-terrain/terrain/compression/TerrainCompressionAssetType";

const BROTLI_SUFFIX = ".br";

/**
 * Restores a generated compression Project manifest to its canonical source declarations.
 * @param project Raw or previously generated runtime Project.
 * @returns A detached Project whose compressed entries point at original build inputs.
 * @throws If a compressed declaration cannot identify one standard source asset.
 */
export function restoreTerrainCompressionSourceProject(project: TerrainProjectFile): TerrainProjectFile {
  return {
    ...project,
    files: project.files.map((file) => {
      if (
        file.type !== TerrainCompressionAssetType.Brotli &&
        file.type !== TerrainCompressionAssetType.BrotliHeightmap
      ) {
        return { ...file };
      }
      if (!file.path.endsWith(BROTLI_SUFFIX)) {
        throw new Error(`Terrain compression source path must end in .br: "${file.path}"`);
      }
      let type: string = TerrainBrotliResultType.Buffer;
      if (file.type === TerrainCompressionAssetType.Brotli) {
        const params = file.params as Partial<TerrainBrotliLoaderParams> | undefined;
        if (
          params?.resultType !== TerrainBrotliResultType.Buffer &&
          params?.resultType !== TerrainBrotliResultType.JSON
        ) {
          throw new Error(`Terrain Brotli source type is invalid for "${file.virtualPath}"`);
        }
        type = params.resultType;
      }
      const { params: _params, ...declaration } = file;
      return { ...declaration, path: file.path.slice(0, -BROTLI_SUFFIX.length), type };
    })
  };
}
