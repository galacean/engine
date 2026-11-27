import { Matrix, Quaternion, Vector3 } from "@galacean/engine-math";

export type AssetReadValue =
  | { kind: "text"; content: string }
  | { kind: "structured"; data: unknown }
  | { kind: "image"; format: string; width: number; height: number }
  | {
      kind: "model";
      scenes: unknown[];
      nodes: unknown[];
      meshes: unknown[];
      materials: unknown[];
      bounds: { min: number[]; max: number[] } | null;
      boundsComplete: boolean;
    };

export const readAssetText = (content: string | Uint8Array): AssetReadValue => ({
  kind: "text",
  content: typeof content === "string" ? content : new TextDecoder("utf-8", { fatal: true }).decode(content)
});
export const readAssetJson = (content: string | Uint8Array): AssetReadValue => ({
  kind: "structured",
  data: JSON.parse(typeof content === "string" ? content : new TextDecoder("utf-8", { fatal: true }).decode(content))
});

export function readAssetImage(content: string | Uint8Array): AssetReadValue {
  if (!(content instanceof Uint8Array)) throw new Error("Image requires binary content");
  const v = new DataView(content.buffer, content.byteOffset, content.byteLength);
  if (
    content.length >= 33 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((x, i) => content[i] === x) &&
    v.getUint32(12) === 0x49484452
  ) {
    const width = v.getUint32(16),
      height = v.getUint32(20);
    if (width && height) return { kind: "image", format: "PNG", width, height };
  }
  if (content[0] === 255 && content[1] === 216) {
    let offset = 2;
    while (offset + 3 < content.length) {
      if (content[offset++] !== 255) break;
      while (content[offset] === 255) offset++;
      const marker = content[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > content.length) break;
      const size = v.getUint16(offset);
      if (size < 2 || offset + size > content.length) break;
      if (
        [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) &&
        size >= 8
      ) {
        const height = v.getUint16(offset + 3),
          width = v.getUint16(offset + 5);
        if (width && height) return { kind: "image", format: "JPEG", width, height };
      }
      offset += size;
    }
  }
  throw new Error("Image inspection supports PNG/JPEG; invalid or unsupported image encoding");
}

/** Static model-local bounds from accessor boxes transformed through the default scene.
 * Skinning, animation and morph deformation are intentionally not world-instance bounds. */
export function readAssetGlb(content: string | Uint8Array): AssetReadValue {
  if (!(content instanceof Uint8Array) || content.length < 20) throw new Error("Model inspection requires GLB 2.0");
  const view = new DataView(content.buffer, content.byteOffset, content.byteLength);
  const size = view.getUint32(12, true);
  if (
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== content.length ||
    view.getUint32(16, true) !== 0x4e4f534a ||
    size + 20 > content.length
  )
    throw new Error("Invalid GLB header");
  const doc = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(content.subarray(20, 20 + size)));
  const nodes = doc.nodes ?? [],
    meshes = doc.meshes ?? [],
    scenes = doc.scenes ?? [];
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  let complete = true;
  const visited = new Set<number>();
  const pending = (scenes[doc.scene ?? 0]?.nodes ?? []).map((id: number) => ({ id, parent: new Matrix() }));
  while (pending.length) {
    const { id, parent } = pending.pop()!;
    if (visited.has(id) || !nodes[id]) throw new Error("Invalid GLB node hierarchy");
    visited.add(id);
    const node = nodes[id],
      local = new Matrix(),
      world = new Matrix();
    if (node.matrix) local.copyFromArray(node.matrix);
    else
      Matrix.affineTransformation(
        new Vector3(...(node.scale ?? [1, 1, 1])),
        new Quaternion(...(node.rotation ?? [0, 0, 0, 1])),
        new Vector3(...(node.translation ?? [0, 0, 0])),
        local
      );
    Matrix.multiply(parent, local, world);
    if (node.skin !== undefined || node.weights) complete = false;
    for (const primitive of meshes[node.mesh]?.primitives ?? []) {
      const accessor = doc.accessors?.[primitive.attributes?.POSITION];
      if (primitive.targets) complete = false;
      if (
        !accessor?.min ||
        !accessor?.max ||
        accessor.min.length !== 3 ||
        accessor.max.length !== 3 ||
        [...accessor.min, ...accessor.max].some((x) => !Number.isFinite(x))
      ) {
        complete = false;
        continue;
      }
      for (let corner = 0; corner < 8; corner++) {
        const p = new Vector3(...[0, 1, 2].map((axis) => (corner & (1 << axis) ? accessor.max : accessor.min)[axis]));
        Vector3.transformCoordinate(p, world, p);
        [p.x, p.y, p.z].forEach((x, i) => {
          min[i] = Math.min(min[i], x);
          max[i] = Math.max(max[i], x);
        });
      }
    }
    for (const child of node.children ?? []) pending.push({ id: child, parent: world });
  }
  return {
    kind: "model",
    scenes,
    nodes,
    meshes,
    materials: doc.materials ?? [],
    bounds: Number.isFinite(min[0]) ? { min, max } : null,
    boundsComplete: complete && Number.isFinite(min[0])
  };
}
