import { Vector2, Vector3 } from "@galacean/engine-math";

/**
 * @internal
 */
export class PrimitiveMeshBuilder {
  vertices: Float32Array;
  indices: Uint16Array | Uint32Array;
  vertexCount = 0;
  indexCount = 0;
  groups: { start: number; count: number }[] = [];
  boundsExtent?: Vector3;

  constructor(vertexCapacity = 0, indexCapacity = 0) {
    this.vertices = new Float32Array(vertexCapacity * 8);
    this.indices = vertexCapacity > 65535 ? new Uint32Array(indexCapacity) : new Uint16Array(indexCapacity);
  }

  addVertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number): number {
    const index = this.vertexCount++;
    this._ensureVertexCapacity(this.vertexCount);
    const length = Math.hypot(nx, ny, nz);
    const inverse = length > 0 ? 1 / length : 0;
    const vertices = this.vertices;
    const offset = index * 8;
    vertices[offset] = x;
    vertices[offset + 1] = y;
    vertices[offset + 2] = z;
    vertices[offset + 3] = nx * inverse;
    vertices[offset + 4] = ny * inverse;
    vertices[offset + 5] = nz * inverse;
    vertices[offset + 6] = u;
    vertices[offset + 7] = v;
    return index;
  }

  addTriangle(a: number, b: number, c: number): void {
    this._ensureIndexCapacity(this.indexCount + 3);
    this.indices[this.indexCount++] = a;
    this.indices[this.indexCount++] = b;
    this.indices[this.indexCount++] = c;
  }

  addIndex(index: number): void {
    this._ensureIndexCapacity(this.indexCount + 1);
    this.indices[this.indexCount++] = index;
  }

  addGroup(start: number): void {
    const count = this.indexCount - start;
    if (count > 0) {
      this.groups.push({ start, count });
    }
  }

  addFace(a: Vector3, b: Vector3, c: Vector3, uvA: Vector2, uvB: Vector2, uvC: Vector2): void {
    const abX = b.x - a.x;
    const abY = b.y - a.y;
    const abZ = b.z - a.z;
    const acX = c.x - a.x;
    const acY = c.y - a.y;
    const acZ = c.z - a.z;
    const nx = abY * acZ - abZ * acY;
    const ny = abZ * acX - abX * acZ;
    const nz = abX * acY - abY * acX;
    const start = this.vertexCount;
    this.addVertex(a.x, a.y, a.z, nx, ny, nz, uvA.x, uvA.y);
    this.addVertex(b.x, b.y, b.z, nx, ny, nz, uvB.x, uvB.y);
    this.addVertex(c.x, c.y, c.z, nx, ny, nz, uvC.x, uvC.y);
    this.addTriangle(start, start + 1, start + 2);
  }

  setData(vertices: Float32Array, indices: Uint16Array | Uint32Array): void {
    this.vertices = vertices;
    this.indices = indices;
    this.vertexCount = vertices.length / 8;
    this.indexCount = indices.length;
  }

  trim(): void {
    if (this.vertices.length !== this.vertexCount * 8) {
      this.vertices = this.vertices.subarray(0, this.vertexCount * 8);
    }
    if (this.indices.length !== this.indexCount) {
      this.indices = this.indices.subarray(0, this.indexCount);
    }
    const IndexArray = this.vertexCount > 65535 ? Uint32Array : Uint16Array;
    if (!(this.indices instanceof IndexArray)) {
      this.indices = new IndexArray(this.indices);
    }
  }

  private _ensureVertexCapacity(count: number): void {
    if (count * 8 > this.vertices.length) {
      const vertices = new Float32Array(Math.max(count * 8, this.vertices.length * 2, 64));
      vertices.set(this.vertices);
      this.vertices = vertices;
    }
  }

  private _ensureIndexCapacity(count: number): void {
    const previous = this.indices;
    const useUint32 = this.vertexCount > 65535;
    if (count > previous.length || (useUint32 && previous instanceof Uint16Array)) {
      const capacity = count > previous.length ? Math.max(count, previous.length * 2, 24) : previous.length;
      const IndexArray = useUint32 || previous instanceof Uint32Array ? Uint32Array : Uint16Array;
      const indices = new IndexArray(capacity);
      indices.set(previous);
      this.indices = indices;
    }
  }
}
