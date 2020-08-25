import { BufferGeometry, InterleavedBuffer, IndexBuffer } from "../geometry";
import { BufferAttribute } from "../primitive/type";
import { Vector3 } from "@alipay/o3-math";
import { DataType } from "../base/Constant";

export class TorusGeometry extends BufferGeometry {
  constructor(
    private parameters: {
      radius?: number;
      tube?: number;
      radialSegments?: number;
      tubularSegments?: number;
      arc?: number;
    } = {}
  ) {
    super();

    this.type = "TorusBufferGeometry";

    const radius = this.parameters.radius || 1;
    const tube = this.parameters.tube || 0.4;
    const radialSegments = Math.floor(this.parameters.radialSegments) || 8;
    const tubularSegments = Math.floor(this.parameters.tubularSegments) || 6;
    const arc = this.parameters.arc || Math.PI * 2;

    // buffers

    const indices = [];
    const vertices = [];
    const normals = [];
    const uvs = [];

    // helper variables

    const center: Vector3 = new Vector3();
    const vertex: Vector3 = new Vector3();
    const normal: Vector3 = new Vector3();

    // generate vertices, normals and uvs

    for (let j = 0; j <= radialSegments; j++) {
      for (let i = 0; i <= tubularSegments; i++) {
        const u = (i / tubularSegments) * arc;
        const v = (j / radialSegments) * Math.PI * 2;

        // vertex

        vertex.x = (radius + tube * Math.cos(v)) * Math.cos(u);
        vertex.y = (radius + tube * Math.cos(v)) * Math.sin(u);
        vertex.z = tube * Math.sin(v);

        vertices.push([vertex.x, vertex.y, vertex.z]);

        // normal

        center.x = radius * Math.cos(u);
        center.y = radius * Math.sin(u);
        Vector3.subtract(vertex, center, normal);
        normal.normalize();

        normals.push(normal.x, normal.y, normal.z);

        // uv

        uvs.push(i / tubularSegments);
        uvs.push(j / radialSegments);
      }
    }

    // generate indices

    for (let j = 1; j <= radialSegments; j++) {
      for (let i = 1; i <= tubularSegments; i++) {
        // indices

        const a = (tubularSegments + 1) * j + i - 1;
        const b = (tubularSegments + 1) * (j - 1) + i - 1;
        const c = (tubularSegments + 1) * (j - 1) + i;
        const d = (tubularSegments + 1) * j + i;

        // faces

        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }
    this.initialize(vertices, indices);
  }

  initialize(vertices, indices) {
    const position = new BufferAttribute({
      semantic: "POSITION",
      size: 3,
      type: DataType.FLOAT,
      normalized: false
    });

    const buffer = new InterleavedBuffer([position], vertices.length);
    this.addVertexBufferParam(buffer);

    const indexBuffer = new IndexBuffer(indices.length);
    this.addIndexBufferParam(indexBuffer);
    this.setIndexBufferData(indices);

    vertices.forEach((value, index) => {
      this.setVertexBufferDataByIndex("POSITION", index, value);
    });
  }
}
