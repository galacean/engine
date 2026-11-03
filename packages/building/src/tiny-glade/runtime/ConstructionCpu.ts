import { ConstructionSurfaceQuery } from "./ConstructionSurfaceQuery";
import { prepareConstruction, type ConstructionUnitAssets } from "./ConstructionCompiler";
import { constructionContactSource } from "./ConstructionContacts";
import { constructionPreview } from "./ConstructionPreview";
import { parseMasonryDocument, type MasonryDocument } from "./MasonryDocument";
import { prepareConstructionTerrain, type ConstructionTerrainGrid } from "./ConstructionTerrain";

export function prepareConstructionCpu(
  document: MasonryDocument,
  terrain: ArrayBuffer | ConstructionTerrainGrid,
  assets: ConstructionUnitAssets,
  options: { includeStructure?: boolean; retainDecorationParts?: boolean; requireAllDecorations?: boolean } = {}
) {
  document = parseMasonryDocument(document);
  const ground = prepareConstructionTerrain(document, terrain);
  const prepared = prepareConstruction(
    constructionContactSource(document.construction, document.bindings),
    ground.height,
    assets,
    document.bindings
  );
  const preview = constructionPreview(document, ground.height, prepared, {
    assets,
    includeStructure: true,
    includeAppearance: true,
    retainDecorationParts: true,
    requireAllDecorations: true,
    ...options
  });
  const structure =
    preview.structuralParts && new ConstructionSurfaceQuery(preview.structuralParts, [0, 0, 0], (id) => id).snapshot();
  return { prepared, preview, structure };
}
export type ConstructionCpuPreparation = ReturnType<typeof prepareConstructionCpu>;
