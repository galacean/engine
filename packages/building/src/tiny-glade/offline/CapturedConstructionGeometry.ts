import { loadDecorationMeshes } from "./CapturedDecorationMeshes";
import type { ConstructionAssetLibrary, ConstructionAssetLoader } from "./CapturedConstructionAssets";
import type {
  ConstructionPositionMesh,
  ConstructionStoneGeometry,
  ConstructionGeometryUnit
} from "../runtime/ConstructionGeometryAssets";
/** CPU queries decode the same VFS buffers as the native GPU templates. No
 * separately authored proxy mesh or module-global default participates. */
export async function loadConstructionGeometry(library: ConstructionAssetLibrary, read: ConstructionAssetLoader) {
  const pending = new Map<string, Promise<ArrayBuffer>>();
  const bytes = (name: string) => {
    let value = pending.get(name);
    if (!value) {
      value = read(name);
      pending.set(name, value);
    }
    return value;
  };
  const floats = async (name: string, size: number, stride: number, offset = 0) => {
    const raw = await bytes(name);
    if (!stride || raw.byteLength % stride || offset + size * 4 > stride)
      throw Error("Invalid construction vertex buffer: " + name);
    const view = new DataView(raw),
      result: number[] = [];
    for (let start = 0; start < raw.byteLength; start += stride)
      for (let axis = 0; axis < size; axis++) {
        const value = view.getFloat32(start + offset + axis * 4, true);
        if (!Number.isFinite(value)) throw Error("Nonfinite construction vertex: " + name);
        result.push(value);
      }
    if (!result.length) throw Error("Empty construction vertex buffer: " + name);
    return result;
  };
  const indices = async (name: string, count: number, vertices: number) => {
    const raw = await bytes(name);
    if (!count || count % 3 || raw.byteLength !== count * 4)
      throw Error("Invalid construction triangle buffer: " + name);
    const view = new DataView(raw),
      result: number[] = [];
    for (let i = 0; i < count; i++) {
      const value = view.getUint32(i * 4, true);
      if (value >= vertices) throw Error("Construction index outside vertex buffer: " + name);
      result.push(value);
    }
    return result;
  };
  const entries = await Promise.all(
    ([1, 2, 3] as const).map(async (rank) => {
      const unit = library.gothic[rank];
      const flat = await floats(unit.collisionPositions, 3, 12);
      const positions = Array.from({ length: flat.length / 3 }, (_, i) => flat.slice(i * 3, i * 3 + 3));
      const collision = {
        positions,
        indices: await indices(
          unit.collisionIndices,
          library.files[unit.collisionIndices].byteLength / 4,
          positions.length
        )
      };
      const collisionBounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
      for (const position of positions)
        for (let axis = 0; axis < 3; axis++) {
          collisionBounds.min[axis] = Math.min(collisionBounds.min[axis], position[axis]);
          collisionBounds.max[axis] = Math.max(collisionBounds.max[axis], position[axis]);
        }
      return [rank, { ...unit, collisionBounds, geometry: { collision } }] as const;
    })
  );
  const wood = library.templates.wood;
  const position = wood?.attributes.find((attribute) => attribute.location === 0);
  if (!position || position.integer || position.size !== 3) throw Error("Missing wood template position attribute");
  const positions = await floats(position.file, 3, position.stride, position.offset);
  const woodPillar: ConstructionPositionMesh = {
    positions,
    indices: await indices(wood.indices, wood.indexCount, positions.length / 3)
  };
  const stoneGeometry: ConstructionStoneGeometry = Object.fromEntries(
    await Promise.all(
      Object.entries(library.templates)
        .filter(([, template]) => template.family === "stone-decoration")
        .map(async ([name, template]) => {
          const position = template.attributes.find((a) => a.location === 0);
          if (!position || position.integer || position.size !== 3)
            throw Error("Missing decoration position attribute: " + name);
          const positions = await floats(position.file, 3, position.stride, position.offset);
          const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
          for (let i = 0; i < positions.length; i++) {
            const axis = i % 3;
            bounds.min[axis] = Math.min(bounds.min[axis], positions[i]);
            bounds.max[axis] = Math.max(bounds.max[axis], positions[i]);
          }
          const coord = template.attributes.find((a) => a.location === 6);
          if (coord && (coord.integer || coord.size !== 1)) throw Error("Invalid decoration warp attribute: " + name);
          const bbx = coord && (await floats(coord.file, 1, coord.stride, coord.offset));
          if (bbx && bbx.length * 3 !== positions.length) throw Error("Decoration attribute counts differ: " + name);
          return [
            name,
            {
              positions,
              bounds,
              indices: await indices(template.indices, template.indexCount, positions.length / 3),
              ...(bbx ? { bbx } : {})
            }
          ];
        })
    )
  );
  return {
    decorations: await loadDecorationMeshes(library, bytes),
    decorationCollisions: library.decorationCollisions,
    stoneGeometry,
    windowCuts: library.windowCuts,
    roofSpire: library.roofSpire,
    gothic: Object.fromEntries(entries) as unknown as Record<1 | 2 | 3, ConstructionGeometryUnit>,
    woodPillar
  };
}
