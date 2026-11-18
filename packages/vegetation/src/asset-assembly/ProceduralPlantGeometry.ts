/** Runtime-only geometry compiler. Source mesh analysis and fitting belong in offline/. */
import {
  calculateProceduralTreeCanopyOpticalDepths,
  resampleProceduralTreeCanopyOpticalDepths,
  type ProceduralTreeCanopyOcclusionFrame
} from "./ProceduralTreeCanopyOcclusion";

export type PlantPoint = readonly [number, number, number];
export type PlantQuaternion = readonly [number, number, number, number];

/** A shading field in plant-local metres, independent of surface tessellation. */
export interface PlantNormalField {
  readonly origin: PlantPoint;
  readonly radialBlend: number;
}

/** A smooth volume direction field in plant space, independent of source vertices and UVs. */
export interface PlantPolynomialNormalField {
  readonly kind: "polynomial";
  readonly origin: PlantPoint;
  readonly extent: PlantPoint;
  readonly degree: number;
  /** Tensor Chebyshev coefficients, ordered x, then y, then z (z varies fastest). */
  readonly coefficients: readonly PlantPoint[];
}

export type PlantShadingField = PlantNormalField | PlantPolynomialNormalField;

export function validatePlantShadingField(field: PlantShadingField): void {
  if (!field || typeof field !== "object") throw new Error("Invalid plant shading field");
  if (!("kind" in field)) return validatePlantNormalField(field);
  exactKeys(field, ["kind", "origin", "extent", "degree", "coefficients"]);
  if (field.kind !== "polynomial") throw new Error("Unknown plant shading field");
  point(field.origin);
  point(field.extent);
  field.extent.forEach(positive);
  if (!Number.isInteger(field.degree) || field.degree < 1) throw new RangeError("Invalid normal polynomial degree");
  if (!Array.isArray(field.coefficients) || field.coefficients.length !== (field.degree + 1) ** 3)
    throw new Error("Normal polynomial coefficient count does not match its degree");
  field.coefficients.forEach(point);
}

export function evaluatePlantShadingField(
  position: PlantPoint,
  normal: PlantPoint,
  field?: PlantShadingField
): PlantPoint {
  if (!field || !("kind" in field)) return evaluatePlantNormalField(position, normal, field);
  const axes = position.map((p, axis) => {
    const x = (p - field.origin[axis]) / field.extent[axis];
    const values = [1, x];
    for (let i = 2; i <= field.degree; i++) values.push(2 * x * values[i - 1] - values[i - 2]);
    return values;
  });
  let direction: PlantPoint = [0, 0, 0];
  let index = 0;
  for (const x of axes[0]) {
    for (const y of axes[1]) {
      for (const z of axes[2]) direction = add(direction, scale(field.coefficients[index++], x * y * z));
    }
  }
  return length(direction) === 0 ? normal : unitOrZero(direction);
}

export function validatePlantNormalField(field: PlantNormalField): void {
  exactKeys(field, ["origin", "radialBlend"]);
  point(field.origin);
  finite(field.radialBlend);
  if (field.radialBlend < 0 || field.radialBlend > 1) throw new RangeError("Normal field blend must be in [0, 1]");
}

export function evaluatePlantNormalField(
  position: PlantPoint,
  normal: PlantPoint,
  field?: PlantNormalField
): PlantPoint {
  if (!field || field.radialBlend === 0) return normal;
  const direction = sub(position, field.origin);
  const distance = length(direction);
  if (distance === 0) return normal;
  const blended = add(scale(unitOrZero(normal), 1 - field.radialBlend), scale(direction, field.radialBlend / distance));
  return length(blended) === 0 ? normal : unitOrZero(blended);
}

interface PlantSection {
  /** Normalized longitudinal coordinate; independent of tessellation. */
  readonly at: number;
  readonly center: PlantPoint;
}

export interface PlantSurfaceSection extends PlantSection {
  readonly leftWidth: number;
  readonly rightWidth: number;
  /** Radians, positive toward the front of the surface on either side. */
  readonly leftFold: number;
  readonly rightFold: number;
  /** Radians of additional rotation from the center to the edge. */
  readonly leftCurl: number;
  readonly rightCurl: number;
  readonly twist: number;
  /** Optional longitudinal shear of a rib; permits swept/asymmetric leaf edges. */
  readonly leftSweep?: number;
  readonly rightSweep?: number;
  readonly uvLeft?: number;
  readonly uvCenter?: number;
  readonly uvRight?: number;
}

export interface PlantTubeSection extends PlantSection {
  readonly radius: number;
  /** Optional elliptical section axes in shape space; independent of centerline curvature. */
  readonly axisX?: PlantPoint;
  readonly axisZ?: PlantPoint;
}

/** Curves describe shape; no input vertices, triangle indices, or baked normals. */
export type PlantShape =
  | {
      readonly kind: "surface";
      readonly sections: readonly PlantSurfaceSection[];
      readonly shading: "smooth" | "flat";
      readonly centerCrease?: boolean;
      readonly diagonal?: "forward" | "backward";
    }
  | {
      /** Also covers flower centers and buds as a swept radius profile. */
      readonly kind: "tube";
      readonly sections: readonly PlantTubeSection[];
      readonly capStart: boolean;
      readonly capEnd: boolean;
      readonly radialPhase?: number;
    };

export interface PlantGeometryResolution {
  readonly subdivisionsPerSpan: number;
  readonly widthSegments: number;
  readonly radialSegments: number;
}

export interface PlantPart {
  readonly id: string;
  readonly shapeId: string;
  readonly materialId: string;
  /** null allows independent basal stems and stemless leaves in the same plant. */
  readonly parentId: string | null;
  /** Position along the parent's shape curve. Zero for root parts. */
  readonly attachment: number;
  /** In the attachment frame: right, along, front. */
  readonly offset: PlantPoint;
  readonly orientation: PlantQuaternion;
  readonly scale: number;
  /** Keep this organ's shape when the plant instance is stretched along different axes. */
  readonly scaleMode?: "uniform";
  /** Shape-local attachment about which uniform organ scaling operates. */
  readonly scalePivot?: PlantPoint;
  /** Affine map from local shape UVs to appearance UVs; does not own a texture. */
  readonly uvTransform?: readonly [number, number, number, number, number, number];
  /** Affine texture projection in plant space, for charts projected onto folded surfaces. */
  readonly uvProjection?: readonly [number, number, number, number, number, number, number, number];
  /** Authored direction field in plant space; independent of the card's geometric facing. */
  readonly normalField?: PlantShadingField;
  readonly reverseWinding?: boolean;
}

export interface ProceduralPlantStructure {
  readonly version: 1;
  readonly shapes: Readonly<Record<string, PlantShape>>;
  readonly parts: readonly PlantPart[];
  readonly normalFields?: Readonly<Record<string, PlantShadingField>>;
  /** Geometry LOD is explicit and independent of plant anatomy or category. */
  readonly lods: readonly {
    readonly partIds: readonly string[];
    readonly resolution: PlantGeometryResolution;
    /** Optional simplified shape per retained part. Attachments still use the canonical structure. */
    readonly shapeIdsByPart?: Readonly<Record<string, string>>;
    readonly normalFields?: Readonly<Record<string, PlantShadingField>>;
    readonly resolutionsByShape?: Readonly<Record<string, PlantGeometryResolution>>;
  }[];
}

export interface PlantMeshData {
  readonly positions: readonly PlantPoint[];
  readonly normals: readonly PlantPoint[];
  readonly uvs: readonly (readonly [number, number])[];
  readonly indices: Uint16Array | Uint32Array;
  readonly bounds: readonly [PlantPoint, PlantPoint];
  readonly triangleCount: number;
  /** Per-leaf attachment and stable thinning rank, derived from final structure parts. */
  readonly leafFrames?: readonly (readonly [number, number, number, number])[];
  /** Geometric canopy optical depth, independent of material density and shadow maps. */
  readonly canopyOpticalDepths?: readonly number[];
  /** Tree hinge axis / flower beam section, plus canonical height. Rigid organs share an attachment. */
  readonly windFrames?: readonly (readonly [number, number, number, number])[];
}

export interface PlantPartMesh {
  readonly partId: string;
  readonly materialId: string;
  readonly mesh: PlantMeshData;
}

/** Evaluate once on the full crown; lower LODs receive its area-weighted field.
 * Each generated organ contributes its actual triangle area, centroid and authored
 * shading hemisphere. This never alters the organ geometry, UVs or normals.
 */
export function attachPlantCanopyOpticalDepth(
  parts: readonly PlantPartMesh[],
  leafMaterialIds: ReadonlySet<string>,
  reference?: readonly PlantPartMesh[]
): readonly PlantPartMesh[] {
  const frames = plantCanopyFrames(parts, leafMaterialIds);
  const source = reference && plantCanopyFrames(reference, leafMaterialIds);
  const depths = source
    ? resampleProceduralTreeCanopyOpticalDepths(
        source.map((item) => item.frame),
        source.map(({ partIndex }) => reference![partIndex].mesh.canopyOpticalDepths![0]),
        frames.map((item) => item.frame)
      )
    : calculateProceduralTreeCanopyOpticalDepths(frames.map((item) => item.frame));
  const byPart = new Map(frames.map(({ partIndex }, index) => [partIndex, depths[index]]));
  return parts.map((part, index) =>
    !leafMaterialIds.has(part.materialId)
      ? part
      : {
          ...part,
          mesh: { ...part.mesh, canopyOpticalDepths: part.mesh.positions.map(() => byPart.get(index) ?? 0) }
        }
  );
}

function plantCanopyFrames(parts: readonly PlantPartMesh[], leafMaterialIds: ReadonlySet<string>) {
  const frames: { partIndex: number; frame: ProceduralTreeCanopyOcclusionFrame }[] = [];
  parts.forEach(({ materialId, mesh }, partIndex) => {
    if (!leafMaterialIds.has(materialId)) return;
    let area = 0,
      center: PlantPoint = [0, 0, 0],
      normal: PlantPoint = [0, 0, 0];
    let right: PlantPoint = [0, 0, 0],
      up: PlantPoint = [0, 0, 0];
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const [a, b, c] = [mesh.indices[i], mesh.indices[i + 1], mesh.indices[i + 2]];
      const ab = sub(mesh.positions[b], mesh.positions[a]),
        ac = sub(mesh.positions[c], mesh.positions[a]);
      const triangleArea = length(cross(ab, ac)) / 2;
      if (triangleArea === 0) continue;
      if (area === 0) {
        right = unit(ab);
        up = unit(ac);
      }
      area += triangleArea;
      center = add(center, scale(add(add(mesh.positions[a], mesh.positions[b]), mesh.positions[c]), triangleArea / 3));
      normal = add(normal, scale(add(add(mesh.normals[a], mesh.normals[b]), mesh.normals[c]), triangleArea / 3));
    }
    if (area === 0) return;
    center = scale(center, 1 / area);
    const side = Math.sqrt(area);
    frames.push({
      partIndex,
      frame: {
        pivot: sub(center, scale(up, side / 2)),
        right,
        up,
        normal: length(normal) > 0 ? unit(normal) : unit(cross(right, up)),
        width: side,
        height: side
      }
    });
  });
  return frames;
}

/** Material bindings may use canonical shape coordinates instead of the source atlas. */

/** Concatenates generated parts by material so a whole plant costs one draw per material and LOD. */
export function mergePlantGeometryByMaterial(parts: readonly PlantPartMesh[]): readonly PlantPartMesh[] {
  const groups = new Map<string, PlantPartMesh[]>();
  for (const part of parts) {
    const group = groups.get(part.materialId) ?? [];
    group.push(part);
    groups.set(part.materialId, group);
  }
  return [...groups].map(([materialId, group]) => {
    const positions: PlantPoint[] = [];
    const normals: PlantPoint[] = [];
    const uvs: (readonly [number, number])[] = [];
    const indices: number[] = [];
    const leafFrames: (readonly [number, number, number, number])[] = [];
    const hasLeafFrames = group.some(({ mesh }) => mesh.leafFrames);
    const canopyOpticalDepths: number[] = [];
    const hasCanopy = group.some(({ mesh }) => mesh.canopyOpticalDepths);
    const windFrames: (readonly [number, number, number, number])[] = [];
    const hasWindFrames = group.some(({ mesh }) => mesh.windFrames);
    for (const { mesh } of group) {
      const offset = positions.length;
      for (const p of mesh.positions) positions.push(p);
      for (const n of mesh.normals) normals.push(n);
      for (const uv of mesh.uvs) uvs.push(uv);
      for (const index of mesh.indices) indices.push(index + offset);
      if (hasLeafFrames)
        for (let i = 0; i < mesh.positions.length; i++)
          leafFrames.push(mesh.leafFrames?.[i] ?? [...mesh.positions[i], 0]);
      if (hasCanopy)
        for (let i = 0; i < mesh.positions.length; i++) canopyOpticalDepths.push(mesh.canopyOpticalDepths?.[i] ?? 0);
      if (hasWindFrames) {
        if (!mesh.windFrames) throw new Error("Cannot merge incompatible plant wind contracts");
        for (const frame of mesh.windFrames) windFrames.push(frame);
      }
    }
    return {
      materialId,
      partId: materialId,
      mesh: {
        positions,
        normals,
        uvs,
        ...(leafFrames.length ? { leafFrames } : {}),
        ...(hasCanopy ? { canopyOpticalDepths } : {}),
        ...(windFrames.length ? { windFrames } : {}),
        indices: positions.length < 2 ** 16 ? new Uint16Array(indices) : new Uint32Array(indices),
        triangleCount: indices.length / 3,
        bounds: boundsOf(positions)
      }
    };
  });
}

interface Frame {
  center: PlantPoint;
  right: PlantPoint;
  up: PlantPoint;
  front: PlantPoint;
}
/** Authoring tools use the same attachment frame as the runtime hierarchy. */
export { shapeFrame as samplePlantShapeFrame };
interface Pose {
  position: PlantPoint;
  orientation: PlantQuaternion;
  scale: number;
}
const RIGHT: PlantPoint = [1, 0, 0];
const UP: PlantPoint = [0, 1, 0];
const IDENTITY: Pose = { position: [0, 0, 0], orientation: [0, 0, 0, 1], scale: 1 };

/** Convenience shape for existing rectangular tree cards, expressed with the same surface contract. */
export function plantRectangleShape(width: number, height: number): Extract<PlantShape, { kind: "surface" }> {
  return {
    kind: "surface",
    shading: "smooth",
    sections: [0, 1].map((at) => ({
      at,
      center: [0, at * height, 0],
      leftWidth: width / 2,
      rightWidth: width / 2,
      leftFold: 0,
      rightFold: 0,
      leftCurl: 0,
      rightCurl: 0,
      twist: 0
    }))
  };
}

export function validatePlantShape(shape: PlantShape): void {
  if (!shape || (shape.kind !== "surface" && shape.kind !== "tube")) throw new Error("Unknown plant shape kind");
  exactKeys(
    shape,
    shape.kind === "surface"
      ? [
          "kind",
          "sections",
          "shading",
          ...(shape.centerCrease === undefined ? [] : ["centerCrease"]),
          ...(shape.diagonal === undefined ? [] : ["diagonal"])
        ]
      : ["kind", "sections", "capStart", "capEnd", ...(shape.radialPhase === undefined ? [] : ["radialPhase"])]
  );
  if (!Array.isArray(shape.sections) || shape.sections.length < 2)
    throw new Error("Plant shape needs at least two sections");
  if (shape.sections[0].at !== 0 || shape.sections[shape.sections.length - 1].at !== 1)
    throw new Error("Plant sections must cover [0, 1]");
  shape.sections.forEach((section, index) => {
    finite(section.at);
    point(section.center);
    if (
      index > 0 &&
      (section.at <= shape.sections[index - 1].at ||
        length(sub(section.center, shape.sections[index - 1].center)) === 0)
    )
      throw new Error("Plant sections must advance with distinct centers");
    if (shape.kind === "surface") {
      const s = section as PlantSurfaceSection;
      exactKeys(s, [
        "at",
        "center",
        "leftWidth",
        "rightWidth",
        "leftFold",
        "rightFold",
        "leftCurl",
        "rightCurl",
        "twist",
        ...(s.leftSweep === undefined ? [] : ["leftSweep"]),
        ...(s.rightSweep === undefined ? [] : ["rightSweep"]),
        ...["uvLeft", "uvCenter", "uvRight"].filter((key) => key in s)
      ]);
      nonnegative(s.leftWidth);
      nonnegative(s.rightWidth);
      [s.leftFold, s.rightFold, s.leftCurl, s.rightCurl, s.twist].forEach(finite);
      [s.leftSweep ?? 0, s.rightSweep ?? 0].forEach(finite);
      [s.uvLeft ?? 0, s.uvCenter ?? 0.5, s.uvRight ?? 1].forEach(finite);
    } else {
      const tube = section as PlantTubeSection;
      exactKeys(section, [
        "at",
        "center",
        "radius",
        ...(tube.axisX === undefined ? [] : ["axisX"]),
        ...(tube.axisZ === undefined ? [] : ["axisZ"])
      ]);
      nonnegative(tube.radius);
      if ((tube.axisX === undefined) !== (tube.axisZ === undefined))
        throw new Error("Plant section needs both ellipse axes");
      if (tube.axisX) {
        point(tube.axisX);
        point(tube.axisZ!);
      }
    }
  });
  if (shape.kind === "surface" && shape.shading !== "smooth" && shape.shading !== "flat")
    throw new Error("Invalid plant surface shading");
  if (shape.kind === "surface" && shape.centerCrease !== undefined && typeof shape.centerCrease !== "boolean")
    throw new Error("Invalid plant crease");
  if (shape.kind === "surface" && shape.diagonal !== undefined && !["forward", "backward"].includes(shape.diagonal))
    throw new Error("Invalid plant surface diagonal");
  if (shape.kind === "tube" && (typeof shape.capStart !== "boolean" || typeof shape.capEnd !== "boolean"))
    throw new Error("Invalid plant tube caps");
  if (
    shape.kind === "tube" &&
    shape.sections.some((s) => (s.axisX === undefined) !== (shape.sections[0].axisX === undefined))
  )
    throw new Error("Plant ellipse axes must cover the whole tube");
  if (shape.kind === "tube") finite(shape.radialPhase ?? 0);
}

export function validateProceduralPlantStructure(structure: ProceduralPlantStructure): void {
  if (!structure || structure.version !== 1) throw new Error("Unsupported plant structure version");
  exactKeys(structure, [
    "version",
    "shapes",
    "parts",
    "lods",
    ...(structure.normalFields === undefined ? [] : ["normalFields"])
  ]);
  if (structure.normalFields !== undefined) {
    if (!structure.normalFields || typeof structure.normalFields !== "object" || Array.isArray(structure.normalFields))
      throw new Error("Invalid plant normal fields");
    Object.values(structure.normalFields).forEach(validatePlantShadingField);
  }
  if (!structure.shapes || typeof structure.shapes !== "object" || Array.isArray(structure.shapes))
    throw new Error("Invalid plant shapes");
  Object.values(structure.shapes).forEach(validatePlantShape);
  if (!Array.isArray(structure.parts) || !Array.isArray(structure.lods) || structure.lods.length === 0)
    throw new Error("Plant structure requires parts and LODs");
  const parts = new Map<string, PlantPart>();
  for (const part of structure.parts) {
    exactKeys(part, [
      "id",
      "shapeId",
      "materialId",
      "parentId",
      "attachment",
      "offset",
      "orientation",
      "scale",
      ...(part.scaleMode === undefined ? [] : ["scaleMode"]),
      ...(part.scalePivot === undefined ? [] : ["scalePivot"]),
      ...(part.uvTransform === undefined ? [] : ["uvTransform"]),
      ...(part.uvProjection === undefined ? [] : ["uvProjection"]),
      ...(part.normalField === undefined ? [] : ["normalField"]),
      ...(part.reverseWinding === undefined ? [] : ["reverseWinding"])
    ]);
    if (typeof part.id !== "string" || !part.id || parts.has(part.id))
      throw new Error("Duplicate or invalid plant part ID");
    if (!Object.prototype.hasOwnProperty.call(structure.shapes, part.shapeId)) throw new Error("Missing plant shape");
    if (typeof part.materialId !== "string" || !part.materialId) throw new Error("Invalid plant material ID");
    finite(part.attachment);
    if (part.attachment < 0 || part.attachment > 1 || (part.parentId === null && part.attachment !== 0))
      throw new Error("Invalid plant attachment");
    point(part.offset);
    positive(part.scale);
    if (part.scaleMode !== undefined && part.scaleMode !== "uniform") throw new Error("Invalid plant part scale mode");
    if (part.scalePivot !== undefined) {
      if (part.scaleMode !== "uniform") throw new Error("Plant scale pivot requires uniform scaling");
      point(part.scalePivot);
    }
    if (part.reverseWinding !== undefined && typeof part.reverseWinding !== "boolean")
      throw new Error("Invalid plant winding");
    if (part.uvTransform !== undefined) {
      if (!Array.isArray(part.uvTransform) || part.uvTransform.length !== 6)
        throw new Error("Invalid plant UV transform");
      part.uvTransform.forEach(finite);
    }
    if (part.uvProjection !== undefined) {
      if (!Array.isArray(part.uvProjection) || part.uvProjection.length !== 8)
        throw new Error("Invalid plant UV projection");
      if (part.uvTransform !== undefined) throw new Error("Plant UV mappings are mutually exclusive");
      part.uvProjection.forEach(finite);
    }
    if (part.normalField !== undefined) validatePlantShadingField(part.normalField);
    if (!Array.isArray(part.orientation) || part.orientation.length !== 4) throw new Error("Invalid plant orientation");
    part.orientation.forEach(finite);
    const norm = Math.hypot(...part.orientation);
    // Allow roundoff from the four-component Euclidean norm, not a shape-fitting tolerance.
    if (Math.abs(norm - 1) > part.orientation.length * Number.EPSILON)
      throw new Error("Plant orientation must be a unit quaternion");
    parts.set(part.id, part);
  }
  const resolved = new Set<string>();
  for (const part of structure.parts) {
    const path = new Set<string>();
    let current: PlantPart | undefined = part;
    while (current && !resolved.has(current.id)) {
      if (path.has(current.id)) throw new Error("Cyclic plant parent graph");
      path.add(current.id);
      if (current.parentId === null) break;
      const parent = parts.get(current.parentId);
      if (!parent) throw new Error("Missing plant parent");
      current = parent;
    }
    path.forEach((id) => resolved.add(id));
  }
  let previous = new Set(parts.keys());
  for (const lod of structure.lods) {
    exactKeys(lod, [
      "partIds",
      "resolution",
      ...(lod.shapeIdsByPart === undefined ? [] : ["shapeIdsByPart"]),
      ...(lod.normalFields === undefined ? [] : ["normalFields"]),
      ...(lod.resolutionsByShape === undefined ? [] : ["resolutionsByShape"])
    ]);
    if (lod.normalFields !== undefined) {
      if (!lod.normalFields || typeof lod.normalFields !== "object" || Array.isArray(lod.normalFields))
        throw new Error("Invalid plant LOD normal fields");
      Object.values(lod.normalFields as Readonly<Record<string, PlantShadingField>>).forEach(validatePlantShadingField);
    }
    validateResolution(lod.resolution);
    if (lod.resolutionsByShape !== undefined) {
      if (
        !lod.resolutionsByShape ||
        typeof lod.resolutionsByShape !== "object" ||
        Array.isArray(lod.resolutionsByShape)
      )
        throw new Error("Invalid per-shape plant resolution");
      for (const [shapeId, resolution] of Object.entries(
        lod.resolutionsByShape as Readonly<Record<string, PlantGeometryResolution>>
      )) {
        if (!Object.prototype.hasOwnProperty.call(structure.shapes, shapeId))
          throw new Error("Missing plant resolution shape");
        validateResolution(resolution);
      }
    }
    if (!Array.isArray(lod.partIds)) throw new Error("Invalid plant LOD membership");
    const selected = new Set<string>(lod.partIds);
    if (selected.size !== lod.partIds.length || lod.partIds.some((id: string) => !previous.has(id)))
      throw new Error("Plant LOD memberships must be unique and nested");
    if (lod.shapeIdsByPart !== undefined) {
      if (!lod.shapeIdsByPart || typeof lod.shapeIdsByPart !== "object" || Array.isArray(lod.shapeIdsByPart))
        throw new Error("Invalid plant LOD shape assignments");
      for (const [id, shapeId] of Object.entries(lod.shapeIdsByPart)) {
        if (
          !selected.has(id) ||
          typeof shapeId !== "string" ||
          !Object.prototype.hasOwnProperty.call(structure.shapes, shapeId)
        )
          throw new Error("Plant LOD references missing part or shape");
      }
    }
    previous = selected;
  }
}

/** Pure deterministic compilation; no source asset or stochastic placement is consulted. */
export function buildProceduralPlantGeometry(
  structure: ProceduralPlantStructure,
  lodIndex: number,
  leafMaterialIds?: ReadonlySet<string>,
  windHeight?: number,
  windKind: "tree" | "flower" = "tree",
  windMaximumBendRadians = 0
): readonly PlantPartMesh[] {
  validateProceduralPlantStructure(structure);
  if (windHeight !== undefined && (!Number.isFinite(windHeight) || windHeight <= 0))
    throw new RangeError("Plant wind requires a positive canonical height");
  if (!Number.isFinite(windMaximumBendRadians) || windMaximumBendRadians < 0)
    throw new RangeError("Plant wind requires a finite non-negative bend limit");
  if (!Number.isInteger(lodIndex) || lodIndex < 0 || lodIndex >= structure.lods.length)
    throw new Error("Invalid plant LOD");
  const lod = structure.lods[lodIndex];
  const parts = new Map(structure.parts.map((part) => [part.id, part]));
  const poses = new Map<string, Pose>();
  const poseFor = (part: PlantPart): Pose => {
    const cached = poses.get(part.id);
    if (cached) return cached;
    // Iterative resolution permits arbitrary-depth anatomy without consuming the JS stack.
    const pending: PlantPart[] = [];
    let current: PlantPart | undefined = part;
    while (current && !poses.has(current.id)) {
      pending.push(current);
      current = current.parentId === null ? undefined : parts.get(current.parentId);
    }
    for (const node of pending.reverse()) {
      const parent = node.parentId === null ? undefined : parts.get(node.parentId)!;
      const parentPose = parent ? poses.get(parent.id)! : IDENTITY;
      const frame = parent
        ? shapeFrame(structure.shapes[parent.shapeId], node.attachment)
        : { center: [0, 0, 0] as PlantPoint, right: RIGHT, up: UP, front: [0, 0, 1] as PlantPoint };
      const local = add(frame.center, inFrame(frame, node.offset));
      const orientation = quaternionMultiply(
        parentPose.orientation,
        quaternionMultiply(frameQuaternion(frame), node.orientation)
      );
      poses.set(node.id, {
        position: add(parentPose.position, rotate(parentPose.orientation, scale(local, parentPose.scale))),
        orientation,
        scale: parentPose.scale * node.scale
      });
    }
    return poses.get(part.id)!;
  };
  const meshes = new Map<string, PlantMeshData>();
  return lod.partIds.map((id) => {
    const part = parts.get(id)!;
    const shapeId =
      lod.shapeIdsByPart && Object.prototype.hasOwnProperty.call(lod.shapeIdsByPart, id)
        ? lod.shapeIdsByPart[id]
        : part.shapeId;
    const pose = poseFor(part);
    const leaf = part.scaleMode === "uniform" || leafMaterialIds?.has(part.materialId);
    const shape = structure.shapes[shapeId];
    let resolution = lod.resolutionsByShape?.[shapeId] ?? lod.resolution;
    if (windKind === "flower" && windHeight !== undefined && windMaximumBendRadians > 0 && !leaf) {
      // Bound the bend's chord error by the stem's own half-width. For a circular
      // beam R = H/theta, sagitta = R*(1-cos(span/(2R))). Its inverse gives the
      // necessary samples without species, LOD, or arbitrary segment-count rules.
      const radius = windHeight / windMaximumBendRadians;
      const widths = shape.sections
        .map((section) =>
          shape.kind === "tube"
            ? (section as PlantTubeSection).radius
            : ((section as PlantSurfaceSection).leftWidth + (section as PlantSurfaceSection).rightWidth) / 2
        )
        .filter((width) => width > 0);
      if (widths.length) {
        // Use the organ's physical radius, including tapered/zero-area endpoints.
        // A vanishing tip cannot define a finite sampling error for the whole stem.
        const error = Math.max(...widths) * pose.scale;
        const maximumSpan = 4 * radius * Math.asin(Math.sqrt(Math.min(error / (2 * radius), 1)));
        const longestSpan = Math.max(
          ...shape.sections
            .slice(1)
            .map((section, i) => length(sub(section.center, shape.sections[i].center)) * pose.scale)
        );
        const refinement = Math.max(1, Math.ceil(longestSpan / maximumSpan / resolution.subdivisionsPerSpan));
        resolution = { ...resolution, subdivisionsPerSpan: resolution.subdivisionsPerSpan * refinement };
      }
    }
    const meshKey = `${shapeId}/${resolution.subdivisionsPerSpan}`;
    let mesh = meshes.get(meshKey);
    if (!mesh) {
      mesh = buildPlantShapeGeometry(shape, resolution);
      meshes.set(meshKey, mesh);
    }
    const positions = mesh.positions.map((p) => add(pose.position, rotate(pose.orientation, scale(p, pose.scale))));
    // Stable membership across tessellation/LOD changes; every vertex of a leaf uses one rank.
    let rank = 2166136261;
    for (let i = 0; i < id.length; i++) rank = Math.imul(rank ^ id.charCodeAt(i), 16777619);
    rank ^= rank >>> 16;
    rank = Math.imul(rank, 0x7feb352d);
    rank ^= rank >>> 15;
    const pivot = part.scalePivot
      ? add(pose.position, rotate(pose.orientation, scale(part.scalePivot, pose.scale)))
      : pose.position;
    const leafFrame = [...pivot, (rank >>> 8) / 2 ** 24] as const;
    // Lighting normals may vary at every corner. The mechanical hinge instead comes from
    // the authored organ frame, so flutter cannot shear a reconstructed leaf/card.
    const hingeAxis = rotate(pose.orientation, RIGHT);
    return {
      partId: id,
      materialId: part.materialId,
      mesh: {
        ...mesh,
        positions,
        ...(leaf ? { leafFrames: positions.map(() => leafFrame) } : {}),
        ...(windHeight === undefined
          ? {}
          : {
              windFrames: positions.map((p) => {
                // Rigid organs sample their authored attachment, independent of UVs and normals.
                const height = Math.max(0, leaf ? pivot[1] : p[1]);
                return [...(windKind === "flower" ? [0, height, 0] : hingeAxis), Math.min(1, height / windHeight)] as [
                  number,
                  number,
                  number,
                  number
                ];
              })
            }),
        indices: part.reverseWinding
          ? mesh.indices.map((_, index) => mesh!.indices[index - (index % 3) + (index % 3 === 0 ? 0 : 3 - (index % 3))])
          : mesh.indices,
        uvs: part.uvProjection
          ? positions.map(([x, y, z]) => {
              const [a, b, c, d, e, f, g, h] = part.uvProjection!;
              return [a * x + b * y + c * z + d, e * x + f * y + g * z + h] as const;
            })
          : part.uvTransform
            ? mesh.uvs.map(([u, v]) => {
                const [a, b, c, d, e, f] = part.uvTransform!;
                return [a * u + b * v + c, d * u + e * v + f] as const;
              })
            : mesh.uvs,
        normals: mesh.normals.map((n, index) =>
          evaluatePlantShadingField(
            positions[index],
            rotate(pose.orientation, part.reverseWinding ? scale(n, -1) : n),
            part.normalField ?? lod.normalFields?.[part.materialId] ?? structure.normalFields?.[part.materialId]
          )
        ),
        bounds: boundsOf(positions)
      }
    };
  });
}

export function buildPlantShapeGeometry(shape: PlantShape, resolution: PlantGeometryResolution): PlantMeshData {
  validatePlantShape(shape);
  validateResolution(resolution);
  const positions: PlantPoint[] = [];
  const uvs: [number, number][] = [];
  const indices: number[] = [];
  const samples: number[] = [];
  for (let i = 0; i < shape.sections.length - 1; i++) {
    const a = shape.sections[i].at,
      b = shape.sections[i + 1].at;
    for (let j = 0; j < resolution.subdivisionsPerSpan; j++)
      samples.push(a + ((b - a) * j) / resolution.subdivisionsPerSpan);
  }
  samples.push(1);
  const frames = samples.map((t) => shapeFrame(shape, t));
  const triangle = (a: number, b: number, c: number) => {
    if (length(cross(sub(positions[b], positions[a]), sub(positions[c], positions[a]))) > 0) indices.push(a, b, c);
  };
  if (shape.kind === "surface") {
    const widths = Array.from(
      { length: resolution.widthSegments + 1 },
      (_, i) => 1 - (2 * i) / resolution.widthSegments
    );
    // A center fold needs an actual centerline; it must not depend on odd/even requested resolution.
    if (
      !widths.includes(0) &&
      shape.centerCrease !== false &&
      shape.sections.some((s) => s.leftFold !== 0 || s.rightFold !== 0)
    ) {
      widths.push(0);
      widths.sort((a, b) => b - a);
    }
    const vertex = (column: number, row: number) =>
      column * samples.length + (column % 2 ? samples.length - 1 - row : row);
    for (let column = 0; column < widths.length; column++) {
      for (let j = 0; j < samples.length; j++) {
        const row = column % 2 ? samples.length - 1 - j : j;
        const t = samples[row],
          u = widths[column],
          frame = frames[row];
        const s = surfaceSection(shape.sections, t);
        const rightSide = u >= 0,
          fraction = Math.abs(u);
        const width = rightSide ? s.rightWidth : s.leftWidth;
        const fold = rightSide ? s.rightFold : s.leftFold;
        const curl = rightSide ? s.rightCurl : s.leftCurl;
        // Integrate a circular cross-section. sinc form remains stable as curl approaches zero.
        const angle = curl * fraction,
          halfAngle = angle / 2;
        const distance = width * fraction * (halfAngle === 0 ? 1 : Math.sin(halfAngle) / halfAngle);
        const x = (rightSide ? 1 : -1) * distance * Math.cos(fold + halfAngle);
        const z = distance * Math.sin(fold + halfAngle);
        const sweep = scalarSection(shape.sections, t, rightSide ? "rightSweep" : "leftSweep") * fraction;
        positions.push(
          add(frame.center, add(add(scale(frame.right, x), scale(frame.front, z)), scale(frame.up, sweep)))
        );
        const uvCoordinate = (key: "uvLeft" | "uvCenter" | "uvRight", fallback: number) => {
          const [i, alpha] = interval(shape.sections, t);
          return (shape.sections[i][key] ?? fallback) * (1 - alpha) + (shape.sections[i + 1][key] ?? fallback) * alpha;
        };
        const uvCenter = uvCoordinate("uvCenter", 0.5);
        const uvEdge = rightSide ? uvCoordinate("uvRight", 1) : uvCoordinate("uvLeft", 0);
        uvs.push([uvCenter + (uvEdge - uvCenter) * fraction, t]);
      }
    }
    for (let c = 0; c < widths.length - 1; c++)
      for (let r = 0; r < samples.length - 1; r++) {
        const a = vertex(c, r),
          b = vertex(c, r + 1),
          d = vertex(c + 1, r),
          e = vertex(c + 1, r + 1);
        if (shape.diagonal === "forward") {
          triangle(a, b, e);
          triangle(a, e, d);
        } else {
          triangle(a, b, d);
          triangle(d, b, e);
        }
      }
  } else {
    const ringSize = resolution.radialSegments + 1;
    for (let row = 0; row < samples.length; row++) {
      const t = samples[row],
        frame = frames[row],
        radius = scalarSection(shape.sections, t, "radius");
      const [sectionIndex, alpha] = interval(shape.sections, t);
      const axis = (key: "axisX" | "axisZ", fallback: PlantPoint) => {
        const a = shape.sections[sectionIndex][key],
          b = shape.sections[sectionIndex + 1][key];
        if ((a === undefined) !== (b === undefined)) throw new Error("Plant ellipse axes must cover the whole tube");
        return a && b ? add(scale(a, 1 - alpha), scale(b, alpha)) : scale(fallback, radius);
      };
      const axisX = axis("axisX", frame.right),
        axisZ = axis("axisZ", frame.front);
      for (let side = 0; side <= resolution.radialSegments; side++) {
        // Identical seam positions are necessary for both zero-area rejection and normal welding.
        const angle =
          ((side % resolution.radialSegments) * 2 * Math.PI) / resolution.radialSegments + (shape.radialPhase ?? 0);
        positions.push(add(frame.center, add(scale(axisX, Math.cos(angle)), scale(axisZ, Math.sin(angle)))));
        uvs.push([side / resolution.radialSegments, t]);
      }
    }
    for (let row = 0; row < samples.length - 1; row++)
      for (let side = 0; side < resolution.radialSegments; side++) {
        const a = row * ringSize + side,
          b = a + ringSize;
        triangle(a, b, a + 1);
        triangle(a + 1, b, b + 1);
      }
    for (const [row, enabled, start] of [
      [0, shape.capStart, true],
      [samples.length - 1, shape.capEnd, false]
    ] as const) {
      if (!enabled) continue;
      const center = positions.length;
      positions.push(frames[row].center);
      uvs.push([0.5, 0.5]);
      for (let side = 0; side < ringSize; side++) {
        positions.push(positions[row * ringSize + side]);
        const angle = (side * 2 * Math.PI) / resolution.radialSegments;
        uvs.push([(1 + Math.cos(angle)) / 2, (1 + Math.sin(angle)) / 2]);
      }
      for (let side = 0; side < resolution.radialSegments; side++) {
        const a = center + 1 + side;
        if (start) triangle(center, a, a + 1);
        else triangle(center, a + 1, a);
      }
    }
  }
  if (shape.kind === "surface" && shape.shading === "flat") {
    const flatPositions = indices.map((i) => positions[i]),
      flatUvs = indices.map((i) => uvs[i]);
    return finishMesh(
      flatPositions,
      flatUvs,
      indices.map((_, i) => i)
    );
  }
  const seams: [number, number][] =
    shape.kind === "tube"
      ? samples.map((_, row) => {
          const first = row * (resolution.radialSegments + 1);
          return [first, first + resolution.radialSegments];
        })
      : [];
  return finishMesh(positions, uvs, indices, seams);
}

/** UV-derived tangent frame for normal-mapped materials, including collapsed UVs at tips and caps. */
export function buildPlantMeshTangents(mesh: PlantMeshData): readonly (readonly [number, number, number, number])[] {
  const tangents: PlantPoint[] = mesh.positions.map(() => [0, 0, 0]);
  const bitangents: PlantPoint[] = mesh.positions.map(() => [0, 0, 0]);
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const ids = [mesh.indices[i], mesh.indices[i + 1], mesh.indices[i + 2]];
    const e1 = sub(mesh.positions[ids[1]], mesh.positions[ids[0]]);
    const e2 = sub(mesh.positions[ids[2]], mesh.positions[ids[0]]);
    const [u0, v0] = mesh.uvs[ids[0]],
      [u1, v1] = mesh.uvs[ids[1]],
      [u2, v2] = mesh.uvs[ids[2]];
    const determinant = (u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0);
    if (determinant === 0) continue;
    const t = scale(sub(scale(e1, v2 - v0), scale(e2, v1 - v0)), 1 / determinant);
    const b = scale(sub(scale(e2, u1 - u0), scale(e1, u2 - u0)), 1 / determinant);
    for (const index of ids) {
      tangents[index] = add(tangents[index], t);
      bitangents[index] = add(bitangents[index], b);
    }
  }
  return mesh.normals.map((normal, index) => {
    const n = length(normal) === 0 ? UP : unit(normal);
    let t = sub(tangents[index], scale(n, dot(n, tangents[index])));
    if (length(t) === 0) {
      // Choose the least parallel coordinate axis, so a collapsed UV never creates NaNs.
      const axis = [0, 1, 2].reduce((best, next) => (Math.abs(n[next]) < Math.abs(n[best]) ? next : best));
      const reference: [number, number, number] = [0, 0, 0];
      reference[axis] = 1;
      t = cross(reference, n);
    }
    t = unit(t);
    return [t[0], t[1], t[2], dot(cross(n, t), bitangents[index]) < 0 ? -1 : 1];
  });
}

function finishMesh(
  positions: PlantPoint[],
  uvs: [number, number][],
  indices: number[],
  seams: readonly (readonly [number, number])[] = []
): PlantMeshData {
  const normals: PlantPoint[] = positions.map(() => [0, 0, 0]);
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = indices.slice(i, i + 3);
    const n = cross(sub(positions[b], positions[a]), sub(positions[c], positions[a]));
    for (const vertex of [a, b, c]) normals[vertex] = add(normals[vertex], n);
  }
  // Weld UV seam area vectors before normalization; cap normals remain independent.
  for (const [a, b] of seams) normals[a] = normals[b] = add(normals[a], normals[b]);
  return {
    positions,
    uvs,
    normals: normals.map(unitOrZero),
    // WebGL2 reserves the all-ones index for primitive restart.
    indices: positions.length < 2 ** 16 ? Uint16Array.from(indices) : Uint32Array.from(indices),
    bounds: boundsOf(positions),
    triangleCount: indices.length / 3
  };
}

function interval(sections: readonly PlantSection[], t: number): [number, number] {
  const index = Math.max(0, sections.findIndex((s) => s.at >= t) - 1);
  const a = sections[index],
    b = sections[index + 1];
  return [index, (t - a.at) / (b.at - a.at)];
}
function scalarSection<T extends PlantSection>(sections: readonly T[], t: number, key: keyof T): number {
  const [i, u] = interval(sections, t);
  return ((sections[i][key] ?? 0) as number) * (1 - u) + ((sections[i + 1][key] ?? 0) as number) * u;
}
function surfaceSection(sections: readonly PlantSurfaceSection[], t: number) {
  const result = {} as Record<
    "leftWidth" | "rightWidth" | "leftFold" | "rightFold" | "leftCurl" | "rightCurl" | "twist",
    number
  >;
  for (const key of ["leftWidth", "rightWidth", "leftFold", "rightFold", "leftCurl", "rightCurl", "twist"] as const)
    result[key] = scalarSection(sections, t, key);
  return result;
}
function shapeFrame(shape: PlantShape, t: number): Frame {
  const [index, u] = interval(shape.sections, t);
  let right = RIGHT;
  let previous = UP;
  let up = UP;
  for (let i = 0; i <= index; i++) {
    up = unit(sub(shape.sections[i + 1].center, shape.sections[i].center));
    const axis = cross(previous, up),
      sine = length(axis),
      cosine = dot(previous, up);
    if (sine > 0) {
      const n = scale(axis, 1 / sine);
      right = add(add(scale(right, cosine), scale(cross(n, right), sine)), scale(n, dot(n, right) * (1 - cosine)));
    } else if (cosine < 0) {
      // The antiparallel limit uses the previous right axis as the deterministic rotation axis.
      right = unit(right);
    }
    right = unit(sub(right, scale(up, dot(up, right))));
    previous = up;
  }
  let front = unit(cross(right, up));
  if (shape.kind === "surface") {
    const twist = scalarSection(shape.sections, t, "twist");
    const twistedRight = add(scale(right, Math.cos(twist)), scale(front, -Math.sin(twist)));
    front = add(scale(right, Math.sin(twist)), scale(front, Math.cos(twist)));
    right = twistedRight;
  }
  return {
    center: add(scale(shape.sections[index].center, 1 - u), scale(shape.sections[index + 1].center, u)),
    right,
    up,
    front
  };
}
function frameQuaternion(f: Frame): PlantQuaternion {
  const m = [f.right, f.up, f.front];
  const trace = m[0][0] + m[1][1] + m[2][2];
  let q: number[];
  if (trace > 0) {
    const s = 2 * Math.sqrt(1 + trace);
    q = [(m[1][2] - m[2][1]) / s, (m[2][0] - m[0][2]) / s, (m[0][1] - m[1][0]) / s, s / 4];
  } else {
    let i = 0;
    if (m[1][1] > m[i][i]) i = 1;
    if (m[2][2] > m[i][i]) i = 2;
    const j = (i + 1) % 3,
      k = (i + 2) % 3;
    const s = 2 * Math.sqrt(1 + m[i][i] - m[j][j] - m[k][k]);
    q = [0, 0, 0, (m[j][k] - m[k][j]) / s];
    q[i] = s / 4;
    q[j] = (m[j][i] + m[i][j]) / s;
    q[k] = (m[k][i] + m[i][k]) / s;
  }
  const norm = Math.hypot(...q);
  return q.map((v) => v / norm) as unknown as PlantQuaternion;
}
function quaternionMultiply(a: PlantQuaternion, b: PlantQuaternion): PlantQuaternion {
  const v = add(add(scale([b[0], b[1], b[2]], a[3]), scale([a[0], a[1], a[2]], b[3])), cross(a, b));
  const q = [v[0], v[1], v[2], a[3] * b[3] - (a[0] * b[0] + a[1] * b[1] + a[2] * b[2])];
  const norm = Math.hypot(...q);
  return q.map((v) => v / norm) as unknown as PlantQuaternion;
}
function rotate(q: PlantQuaternion, v: PlantPoint): PlantPoint {
  const t = scale(cross(q, v), 2);
  return add(v, add(scale(t, q[3]), cross(q, t)));
}
function inFrame(f: Frame, v: PlantPoint): PlantPoint {
  return add(add(scale(f.right, v[0]), scale(f.up, v[1])), scale(f.front, v[2]));
}
function add(a: PlantPoint, b: PlantPoint): PlantPoint {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function sub(a: PlantPoint, b: PlantPoint): PlantPoint {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function scale(a: PlantPoint, s: number): PlantPoint {
  return [a[0] * s, a[1] * s, a[2] * s];
}
function dot(a: PlantPoint, b: PlantPoint): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a: readonly number[], b: readonly number[]): PlantPoint {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function length(a: PlantPoint): number {
  return Math.hypot(...a);
}
function unit(a: PlantPoint): PlantPoint {
  const n = length(a);
  if (n === 0) throw new Error("Degenerate plant frame");
  return scale(a, 1 / n);
}
function unitOrZero(a: PlantPoint): PlantPoint {
  return length(a) === 0 ? [0, 0, 0] : unit(a);
}
function finite(value: number): void {
  if (!Number.isFinite(value)) throw new Error("Plant parameters must be finite");
}
function positive(value: number): void {
  finite(value);
  if (value <= 0) throw new Error("Plant parameter must be positive");
}
function nonnegative(value: number): void {
  finite(value);
  if (value < 0) throw new Error("Plant parameter must be nonnegative");
}
function point(value: PlantPoint): void {
  if (!Array.isArray(value) || value.length !== 3) throw new Error("Invalid plant point");
  value.forEach(finite);
}
function exactKeys(value: object, keys: readonly string[]): void {
  if (
    !value ||
    typeof value !== "object" ||
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new Error("Unsupported or missing plant parameter fields");
}
function validateResolution(resolution: PlantGeometryResolution): void {
  exactKeys(resolution, ["subdivisionsPerSpan", "widthSegments", "radialSegments"]);
  for (const key of ["subdivisionsPerSpan", "widthSegments", "radialSegments"] as const)
    if (!Number.isSafeInteger(resolution[key]) || resolution[key] < (key === "radialSegments" ? 3 : 1))
      throw new Error("Invalid plant tessellation resolution");
}
function boundsOf(positions: readonly PlantPoint[]): readonly [PlantPoint, PlantPoint] {
  if (!positions.length)
    return [
      [0, 0, 0],
      [0, 0, 0]
    ];
  const minimum = [Infinity, Infinity, Infinity],
    maximum = [-Infinity, -Infinity, -Infinity];
  for (const p of positions)
    for (let axis = 0; axis < 3; axis++) {
      minimum[axis] = Math.min(minimum[axis], p[axis]);
      maximum[axis] = Math.max(maximum[axis], p[axis]);
    }
  return [minimum as unknown as PlantPoint, maximum as unknown as PlantPoint];
}
