import { masonryVertexTintTag } from "./MasonryAppearance";
import type { ConstructionPreviewPart } from "./ProfilePreview";
import { packDecorationMaterial } from "./ConstructionDecorationMaterial";

/** Immutable published attributes, in the same Float32 formats as ModelMesh's
 * advanced setters. Avoid per-vertex vectors/colors and the subsequent repack.
 * TEXCOORD_1 retains emission; TANGENT carries the decoration shader payload.
 * Plaster stores effective boundary distance in COLOR_0.a (RGB stays unchanged). */
export function plannedMasonryVertexData(part: ConstructionPreviewPart) {
  const count = part.positions.length / 3,
    appearance = part.appearance,
    uv = appearance?.materialUVs ?? part.uvs,
    stride = appearance ? 18 : 14;
  if (
    (part.plaster && part.plaster.edgeDistances.length !== count) ||
    !Number.isInteger(count) ||
    part.normals?.length !== count * 3 ||
    part.colors?.length !== count * 3 ||
    part.emission?.length !== count ||
    uv.length !== count ||
    (appearance &&
      (appearance.centers.length !== count * 3 ||
        appearance.kinds.length !== count ||
        appearance.colorIds.length !== count))
  )
    throw Error("Incomplete decoration vertex attributes");
  const data = new Float32Array(count * stride);
  for (let i = 0, offset = 0; i < count; i++, offset += stride) {
    const xyz = i * 3;
    for (let k = 0; k < 3; k++) {
      data[offset + k] = part.positions[xyz + k];
      data[offset + 3 + k] = part.normals[xyz + k];
      data[offset + 6 + k] = part.colors[xyz + k];
    }
    data[offset + 9] = part.plaster
      ? part.plaster.edgeDistances[i]
      : part.tintRoles
        ? masonryVertexTintTag(
            part.tintRoles[i] ?? -1,
            part.colors.slice(xyz, xyz + 3),
            (part.neutralColors ?? part.colors).slice(xyz, xyz + 3)
          )
        : 1;
    data[offset + 10] = uv[i][0];
    data[offset + 11] = uv[i][1];
    data[offset + 13] = part.emission[i];
    if (appearance) {
      data[offset + 14] = appearance.centers[xyz];
      data[offset + 15] = appearance.centers[xyz + 1];
      data[offset + 16] = appearance.centers[xyz + 2];
      data[offset + 17] = packDecorationMaterial(appearance.kinds[i], appearance.colorIds[i]);
    }
  }
  return { data, stride: stride * 4, count };
}
