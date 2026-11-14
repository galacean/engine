import { type Buffer, type Engine, type ModelMesh, VertexAttribute } from "@galacean/engine-core";
import { registerWaterContentRestorer } from "./WaterContentRestorer";

export interface WaterMeshRestoreSource {
  readonly vertexCount: number;
  readonly indices: Uint16Array | Uint32Array;
  read(attribute: string, vertex: number, component: number): number;
}

const COMPONENTS: Readonly<Record<string, number>> = {
  [VertexAttribute.Position]: 3,
  [VertexAttribute.Normal]: 3,
  [VertexAttribute.Tangent]: 4,
  [VertexAttribute.Color]: 4,
  [VertexAttribute.UV]: 2,
  [VertexAttribute.UV1]: 2,
  [VertexAttribute.UV2]: 2
};

/** Restore existing buffers after uploadData(true), without retaining a second packed vertex array. */
export function registerWaterMeshContentRestorer(
  engine: Engine,
  mesh: ModelMesh,
  source: () => WaterMeshRestoreSource
): void {
  registerWaterContentRestorer(engine, mesh, () => {
    const data = source();
    for (const [bindingIndex, binding] of mesh.vertexBufferBindings.entries()) {
      if (!binding) continue;
      const packed = new Float32Array(binding.buffer.byteLength / Float32Array.BYTES_PER_ELEMENT);
      for (const element of mesh.vertexElements) {
        if (element.bindingIndex !== bindingIndex) continue;
        const components = COMPONENTS[element.attribute];
        if (!components) throw new Error(`Unexpected Water mesh attribute: ${element.attribute}`);
        for (let vertex = 0; vertex < data.vertexCount; vertex++) {
          const offset = (vertex * binding.stride + element.offset) / Float32Array.BYTES_PER_ELEMENT;
          for (let component = 0; component < components; component++) {
            packed[offset + component] = data.read(element.attribute, vertex, component);
          }
        }
      }
      binding.buffer.setData(packed);
    }
    // Same buffer-level restoration as RiverMeshUploader; the index accessor is omitted from engine declarations.
    const primitive = (mesh as ModelMesh & { _primitive: { indexBufferBinding: { buffer: Buffer } } })._primitive;
    primitive.indexBufferBinding.buffer.setData(data.indices);
  });
}
