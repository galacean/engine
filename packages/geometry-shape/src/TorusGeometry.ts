import { IndexBufferGeometry } from "@alipay/o3-geometry";
import { vec3 } from "@alipay/o3-math";
import { DataType } from "@alipay/o3-base";

export class TorusGeometry extends IndexBufferGeometry {
  constructor(private parameters: {
    radius?: number,
    tube?: number,
    radialSegments?: number,
    tubularSegments?: number,
    arc?: number
  } = {}) {
    super();

    this.type = 'TorusBufferGeometry';

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

    const center = Float32Array.from([0, 0, 0]);
    const vertex = Float32Array.from([0, 0, 0]);
    const normal = Float32Array.from([0, 0, 0]);

    // generate vertices, normals and uvs

    for (let j = 0; j <= radialSegments; j++) {

      for (let i = 0; i <= tubularSegments; i++) {

        const u = i / tubularSegments * arc;
        const v = j / radialSegments * Math.PI * 2;

        // vertex

        vertex[0] = (radius + tube * Math.cos(v)) * Math.cos(u);
        vertex[1] = (radius + tube * Math.cos(v)) * Math.sin(u);
        vertex[2] = tube * Math.sin(v);

        vertices.push([vertex[0], vertex[1], vertex[2]]);

        // normal

        center[0] = radius * Math.cos(u);
        center[1] = radius * Math.sin(u);
        vec3.sub(normal, vertex, center);
        vec3.normalize(normal, normal);

        normals.push(normal[0], normal[1], normal[2]);

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

    // build geometry

    this.initialize(
      [
        { semantic: 'POSITION', size: 3, type: DataType.FLOAT, normalized: false },
      ],
      vertices.length,
      indices
    );
    vertices.forEach((value, index) => {
      this.setValue("POSITION", index, value);
    });
  }

}
