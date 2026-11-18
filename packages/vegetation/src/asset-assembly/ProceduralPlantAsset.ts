import { validateProceduralPlantStructure, type ProceduralPlantStructure } from "./ProceduralPlantGeometry";

/** A source-free plant asset. Each authored LOD is a complete final structure, not an override patch. */
export interface ProceduralPlantAsset {
  readonly version: 1;
  readonly id: string;
  readonly category: string;
  /** Semantic source slots; the caller supplies existing materials independently of geometry. */
  readonly materialSlots: Readonly<Record<string, string>>;
  readonly geometryLods: readonly ProceduralPlantStructure[];
}

export interface ProceduralPlantLibraryEntry {
  readonly id: string;
  readonly category: string;
  /** Human-facing morphology; resource identities remain stable across renames. */
  readonly displayName?: string;
  readonly family?: string;
  /** Instances compile the referenced final structure once and share its Mesh resources. */
  readonly prototypeId?: string;
  readonly instanceScale?: readonly [number, number, number];
  readonly instanceVariation?: PlantInstanceVariation;
  readonly materialAliases?: Readonly<Record<string, string>>;
  /** Repeated components reference a prototype material group without baking their transforms into vertices. */
  readonly geometryInstances?: readonly PlantGeometryInstance[];
  readonly exhibitionOrder?: number;
  /** Runtime instance identity is separate from the reusable appearance asset. */
  readonly sourceAssetId?: string;
  readonly parameterFile?: string;
  readonly geometryAccepted: boolean;
  /** Deliberate authoring reduction; the original source-fit acceptance no longer applies. */
  readonly geometryEdited?: boolean;
  readonly lodCount?: number;
  readonly materialSlots?: Readonly<Record<string, string>>;
  readonly error?: string;
}

/** Renderer-owned appearance; never part of the shared Mesh or Material identity. */
export interface PlantInstanceVariation {
  readonly yawDegrees: number;
  readonly leafSize: number;
  readonly leafDensity: number;
  /** Linear RGB, applied to the existing grayscale leaf texture. */
  readonly leafColor: readonly [number, number, number];
  readonly barkTint: readonly [number, number, number];
}

export function validatePlantInstanceVariation(entry: ProceduralPlantLibraryEntry): void {
  const v = entry.instanceVariation;
  if (
    v &&
    (!Number.isFinite(v.yawDegrees) ||
      !Number.isFinite(v.leafSize) ||
      v.leafSize <= 0 ||
      !Number.isFinite(v.leafDensity) ||
      v.leafDensity < 0 ||
      v.leafDensity > 1 ||
      [v.leafColor, v.barkTint].some(
        (color) =>
          !Array.isArray(color) || color.length !== 3 || color.some((c) => !Number.isFinite(c) || c < 0 || c > 1)
      ))
  )
    throw new Error(`${entry.id}: invalid plant instance variation`);
}

export interface PlantGeometryInstance {
  readonly materialId: string;
  /** Authored levels containing this component; omitted means every level. */
  readonly lods?: readonly number[];
  /** Column-major affine matrix in plant-local metres. */
  readonly transform: readonly number[];
  readonly color: readonly [number, number, number];
}

export function validatePlantGeometryInstances(entry: ProceduralPlantLibraryEntry, asset: ProceduralPlantAsset): void {
  if (!entry.geometryInstances) return;
  if (!entry.geometryInstances.length) throw new Error(`${entry.id}: empty plant component instances`);
  for (const instance of entry.geometryInstances) {
    const m = instance.transform;
    if (
      !Object.prototype.hasOwnProperty.call(asset.materialSlots, instance.materialId) ||
      !Array.isArray(m) ||
      m.length !== 16 ||
      !m.every(Number.isFinite) ||
      m[3] !== 0 ||
      m[7] !== 0 ||
      m[11] !== 0 ||
      m[15] !== 1 ||
      !Array.isArray(instance.color) ||
      instance.color.length !== 3 ||
      !instance.color.every((v) => Number.isFinite(v) && v >= 0 && v <= 1)
    )
      throw new Error(`${entry.id}: invalid plant component instance`);
    const determinant =
      m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
    if (!(determinant > 0)) throw new Error(`${entry.id}: plant component transform must preserve orientation`);
    if (
      instance.lods !== undefined &&
      (!Array.isArray(instance.lods) ||
        !instance.lods.length ||
        new Set(instance.lods).size !== instance.lods.length ||
        instance.lods.some((lod) => !Number.isInteger(lod) || lod < 0 || lod >= asset.geometryLods.length))
    )
      throw new Error(`${entry.id}: invalid plant component LODs`);
  }
  for (let lod = 0; lod < asset.geometryLods.length; lod++) {
    const structure = asset.geometryLods[lod];
    const activeSlots = new Set(
      structure.parts.filter((part) => structure.lods[0].partIds.includes(part.id)).map((part) => part.materialId)
    );
    if (
      !entry.geometryInstances.some(
        (instance) => (!instance.lods || instance.lods.includes(lod)) && activeSlots.has(instance.materialId)
      )
    )
      throw new Error(`${entry.id}: no plant components at LOD${lod}`);
  }
}

export function validateProceduralPlantAsset(asset: ProceduralPlantAsset): void {
  if (!asset || asset.version !== 1 || typeof asset.id !== "string" || !asset.id || typeof asset.category !== "string")
    throw new Error("Invalid procedural plant asset");
  const keys = Object.keys(asset).sort();
  if (keys.join(",") !== ["version", "id", "category", "materialSlots", "geometryLods"].sort().join(","))
    throw new Error("Unknown procedural plant asset fields");
  if (
    !asset.materialSlots ||
    typeof asset.materialSlots !== "object" ||
    Array.isArray(asset.materialSlots) ||
    Object.values(asset.materialSlots).some((name) => typeof name !== "string" || !name)
  )
    throw new Error("Invalid procedural plant material slots");
  if (!Array.isArray(asset.geometryLods) || !asset.geometryLods.length)
    throw new Error("Procedural plant asset needs geometry LODs");
  for (const structure of asset.geometryLods) {
    validateProceduralPlantStructure(structure);
    if (structure.lods.length !== 1) throw new Error("Each plant asset LOD must contain one final geometry level");
    for (const part of structure.parts) {
      if (!Object.prototype.hasOwnProperty.call(asset.materialSlots, part.materialId))
        throw new Error(`Missing procedural plant material slot: ${part.materialId}`);
    }
  }
}

export function proceduralPlantAssetLod(asset: ProceduralPlantAsset, lod: number): ProceduralPlantStructure {
  validateProceduralPlantAsset(asset);
  if (!Number.isInteger(lod) || lod < 0 || lod >= asset.geometryLods.length)
    throw new RangeError("Procedural plant geometry LOD is unavailable");
  return asset.geometryLods[lod];
}

/** Author thicker or thinner woody cross-sections without moving their curves or attached organs. */
export function scaleProceduralPlantWood(
  asset: ProceduralPlantAsset,
  materialIds: ReadonlySet<string>,
  factor: number
): ProceduralPlantAsset {
  validateProceduralPlantAsset(asset);
  if (!Number.isFinite(factor) || factor <= 0) throw new Error("Woody thickness must be finite and positive");
  const geometryLods = asset.geometryLods.map((structure) => {
    const shapeIds = (woody: boolean) =>
      new Set(
        structure.parts
          .filter((part) => materialIds.has(part.materialId) === woody)
          .flatMap((part) => [
            part.shapeId,
            ...structure.lods.flatMap((lod) => (lod.shapeIdsByPart?.[part.id] ? [lod.shapeIdsByPart[part.id]] : []))
          ])
      );
    const woodyShapes = shapeIds(true),
      otherShapes = shapeIds(false);
    const shapes = { ...structure.shapes };
    const replacements = new Map<string, string>();
    for (const id of woodyShapes) {
      const shape = structure.shapes[id];
      if (shape.kind !== "tube") continue;
      // A shape can be reused by unrelated material parts. Split only that shared
      // authored shape so thickness never alters a non-woody organ.
      let target = id;
      if (otherShapes.has(id)) {
        target = `${id}-wood`;
        while (shapes[target]) target += "-wood";
        replacements.set(id, target);
      }
      shapes[target] = {
        ...shape,
        sections: shape.sections.map((section) => ({
          ...section,
          radius: section.radius * factor,
          ...(section.axisX
            ? { axisX: section.axisX.map((value) => value * factor) as unknown as typeof section.axisX }
            : {}),
          ...(section.axisZ
            ? { axisZ: section.axisZ.map((value) => value * factor) as unknown as typeof section.axisZ }
            : {})
        }))
      };
    }
    const woodyParts = new Set(
      structure.parts.filter((part) => materialIds.has(part.materialId)).map((part) => part.id)
    );
    return {
      ...structure,
      shapes,
      parts: structure.parts.map((part) =>
        materialIds.has(part.materialId) && replacements.has(part.shapeId)
          ? { ...part, shapeId: replacements.get(part.shapeId)! }
          : part
      ),
      lods: structure.lods.map((lod) => ({
        ...lod,
        ...(lod.shapeIdsByPart
          ? {
              shapeIdsByPart: Object.fromEntries(
                Object.entries(lod.shapeIdsByPart).map(([part, shape]) => [
                  part,
                  woodyParts.has(part) ? (replacements.get(shape) ?? shape) : shape
                ])
              )
            }
          : {}),
        ...(lod.resolutionsByShape
          ? {
              resolutionsByShape: {
                ...lod.resolutionsByShape,
                ...Object.fromEntries(
                  [...replacements]
                    .filter(([shape]) => lod.resolutionsByShape![shape])
                    .map(([shape, target]) => [target, lod.resolutionsByShape![shape]])
                )
              }
            }
          : {})
      }))
    };
  });
  const next = { ...asset, geometryLods };
  validateProceduralPlantAsset(next);
  return next;
}
