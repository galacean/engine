import { masonryVertexTintTag } from "./MasonryAppearance";
import { uvCount, uvU, uvV, type ConstructionPreviewPart, type PackedUv2 } from "./ConstructionPreview";
import { packDecorationMaterial } from "./ConstructionDecorationMaterial";

function writePlannedPartVertices(
  part: ConstructionPreviewPart,
  pickIndex: number,
  hasAppearance: boolean,
  stride: number,
  data: Float32Array,
  vertexOffset: number,
  bounds: [number, number, number, number, number, number]
): number {
  const count = part.positions.length / 3,
    appearance = part.appearance,
    uv = (appearance?.materialUVs ?? part.uvs) as PackedUv2;
  if (
    (part.plaster && part.plaster.edgeDistances.length !== count) ||
    !Number.isInteger(count) ||
    part.normals?.length !== count * 3 ||
    part.colors?.length !== count * 3 ||
    part.emission?.length !== count ||
    uvCount(uv) !== count ||
    Boolean(appearance) !== hasAppearance ||
    (appearance &&
      (appearance.centers.length !== count * 3 ||
        appearance.kinds.length !== count ||
        appearance.colorIds.length !== count))
  )
    throw Error("Incomplete decoration vertex attributes");
  const neutralColors = part.neutralColors ?? part.colors;
  const warpPad = part.plaster || appearance ? 0.03 : 0;
  for (let i = 0, offset = vertexOffset * stride; i < count; i++, offset += stride) {
    const xyz = i * 3;
    const px = part.positions[xyz]!,
      py = part.positions[xyz + 1]!,
      pz = part.positions[xyz + 2]!;
    if (px - warpPad < bounds[0]) bounds[0] = px - warpPad;
    if (py < bounds[1]) bounds[1] = py;
    if (pz - warpPad < bounds[2]) bounds[2] = pz - warpPad;
    if (px + warpPad > bounds[3]) bounds[3] = px + warpPad;
    if (py > bounds[4]) bounds[4] = py;
    if (pz + warpPad > bounds[5]) bounds[5] = pz + warpPad;
    data[offset] = px;
    data[offset + 1] = py;
    data[offset + 2] = pz;
    data[offset + 3] = part.normals![xyz]!;
    data[offset + 4] = part.normals![xyz + 1]!;
    data[offset + 5] = part.normals![xyz + 2]!;
    data[offset + 6] = part.colors![xyz]!;
    data[offset + 7] = part.colors![xyz + 1]!;
    data[offset + 8] = part.colors![xyz + 2]!;
    data[offset + 9] = part.plaster
      ? part.plaster.edgeDistances[i]!
      : part.tintRoles
        ? masonryVertexTintTag(
            part.tintRoles[i] ?? -1,
            [part.colors![xyz]!, part.colors![xyz + 1]!, part.colors![xyz + 2]!],
            [neutralColors[xyz]!, neutralColors[xyz + 1]!, neutralColors[xyz + 2]!]
          )
        : 1;
    data[offset + 10] = uvU(uv, i);
    data[offset + 11] = uvV(uv, i);
    data[offset + 12] = pickIndex;
    data[offset + 13] = part.emission![i]!;
    if (appearance) {
      data[offset + 14] = appearance.centers[xyz]!;
      data[offset + 15] = appearance.centers[xyz + 1]!;
      data[offset + 16] = appearance.centers[xyz + 2]!;
      data[offset + 17] = packDecorationMaterial(appearance.kinds[i]!, appearance.colorIds[i]!);
    }
  }
  return count;
}

/** Immutable published attributes, in the same Float32 formats as ModelMesh's
 * advanced setters. Avoid per-vertex vectors/colors and the subsequent repack.
 * TEXCOORD_1 retains pickIndex in x and emission in y; TANGENT carries the decoration payload.
 * Plaster stores effective boundary distance in COLOR_0.a (RGB stays unchanged). */
export function plannedMasonryVertexData(part: ConstructionPreviewPart) {
  const count = part.positions.length / 3,
    hasAppearance = Boolean(part.appearance),
    stride = hasAppearance ? 18 : 14,
    data = new Float32Array(count * stride),
    bounds: [number, number, number, number, number, number] = [
      Infinity,
      Infinity,
      Infinity,
      -Infinity,
      -Infinity,
      -Infinity
    ];
  writePlannedPartVertices(part, 0, hasAppearance, stride, data, 0, bounds);
  return { data, stride: stride * 4, count };
}

/** Merge multiple same-material LOD1 decoration/plaster parts into one vertex + index buffer
 * while writing each part's per-batch pickIndex into UV1.x so WorldPick stays exact. */
export function mergePlannedMasonryVertexData(
  entries: readonly { part: ConstructionPreviewPart; pickIndex: number }[]
) {
  const hasAppearance = Boolean(entries[0]?.part.appearance);
  const stride = hasAppearance ? 18 : 14;
  let totalVertices = 0;
  let totalIndices = 0;
  for (let i = 0; i < entries.length; i++) {
    totalVertices += entries[i]!.part.positions.length / 3;
    totalIndices += entries[i]!.part.indices.length;
  }
  const data = new Float32Array(totalVertices * stride);
  const indices = totalVertices > 65535 ? new Uint32Array(totalIndices) : new Uint16Array(totalIndices);
  const bounds: [number, number, number, number, number, number] = [
    Infinity,
    Infinity,
    Infinity,
    -Infinity,
    -Infinity,
    -Infinity
  ];
  let vertexCursor = 0;
  let indexCursor = 0;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const count = writePlannedPartVertices(
      entry.part,
      entry.pickIndex,
      hasAppearance,
      stride,
      data,
      vertexCursor,
      bounds
    );
    const srcIdx = entry.part.indices;
    for (let k = 0; k < srcIdx.length; k++) {
      indices[indexCursor++] = vertexCursor + srcIdx[k]!;
    }
    vertexCursor += count;
  }
  return { data, stride: stride * 4, count: totalVertices, indices, bounds, hasAppearance };
}
