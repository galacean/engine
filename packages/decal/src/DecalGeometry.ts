import { BufferGeometry } from "@alipay/o3-geometry";
import { vec3, mat4 } from "@alipay/o3-math";
import { DataType } from "@alipay/o3-base";
import { Node } from "@alipay/o3-core";
import { Mesh } from "@alipay/o3-mesh";
import { Primitive } from "@alipay/o3-primitive";
import { MeshRenderer } from "@alipay/o3-mesh";
import { setPosition, transformDirection, fromBufferAttribute, makeRotationFromQuaternion } from "./util";

type FloatArray = Array<number> | Float32Array;

interface Intersection {
  node: Node;
  distance: Number;
  point: FloatArray;
  normal: FloatArray;
  primitive: Primitive;
  materialName: String;
}

export class DecalGeometry extends BufferGeometry {
  public size: FloatArray;
  public readonly node: Node;
  public readonly targetMesh: Mesh;
  public readonly targetPrimitive: Primitive;
  public readonly position: FloatArray;
  public readonly orientation: FloatArray;
  public readonly projectorMatrix: FloatArray;
  public readonly projectorMatrixInverse: FloatArray;
  public constructor(intersection: Intersection, position: FloatArray, orientation: FloatArray, size: FloatArray) {
    super();
    this.node = intersection.node;
    const meshRenderer = this.node.getComponent(MeshRenderer);
    if (meshRenderer) {
      this.targetMesh = meshRenderer.mesh;
    } else {
      console.error("必须是mesh");
    }
    this.targetPrimitive = intersection.primitive;
    this.position = position;
    this.orientation = orientation;
    this.size = size;

    // get projectorMatrix
    const quatMat = makeRotationFromQuaternion(orientation);
    const projectorMatrix = setPosition(quatMat, position);
    this.projectorMatrix = projectorMatrix;

    // get projectorMatrixInverse
    const tempMat = mat4.create();
    const projectorMatrixInverse = mat4.invert(tempMat, projectorMatrix);
    this.projectorMatrixInverse = projectorMatrixInverse;

    const vertexValues = this.generate();
    const vertexCount = vertexValues.length;
    super.initialize(
      [
        { semantic: "POSITION", size: 3, type: DataType.FLOAT, normalized: false },
        { semantic: "NORMAL", size: 3, type: DataType.FLOAT, normalized: true },
        { semantic: "TEXCOORD_0", size: 2, type: DataType.FLOAT, normalized: true }
      ],
      vertexCount
    );
    this.setAllVertexValues(vertexValues);
  }

  generate() {
    const vertexValues = [];
    let decalVertices = [];
    const primitive = this.targetPrimitive;
    const positionAttributeIndex = primitive.vertexAttributes.POSITION.vertexBufferIndex;
    const positionAttribute = primitive.vertexBuffers[positionAttributeIndex];

    let normalAttributeIndex;
    let normalAttribute;
    if (primitive.vertexAttributes.NORMAL) {
      normalAttributeIndex = primitive.vertexAttributes.NORMAL.vertexBufferIndex;
      normalAttribute = primitive.vertexBuffers[normalAttributeIndex];
    }

    const index = primitive.indexBuffer;
    const count = primitive.indexBuffer.length;

    // first, create an array of 'DecalVertex' objects
    // three consecutive 'DecalVertex' objects represent a single face
    //
    // this data structure will be later used to perform the clipping
    let vertex;
    let normal;
    for (let i = 0; i < count; i += 1) {
      const vertex = fromBufferAttribute(positionAttribute, index[i]);
      let normal;
      if (normalAttribute) {
        normal = fromBufferAttribute(normalAttribute, index[i]);
      }

      this.pushDecalVertex(decalVertices, vertex, normal);
    }
    // second, clip the geometry so that it doesn't extend out from the projector
    decalVertices = this.clipGeometry(decalVertices, [1, 0, 0]);
    decalVertices = this.clipGeometry(decalVertices, [-1, 0, 0]);
    decalVertices = this.clipGeometry(decalVertices, [0, 1, 0]);
    decalVertices = this.clipGeometry(decalVertices, [0, -1, 0]);
    decalVertices = this.clipGeometry(decalVertices, [0, 0, 1]);
    decalVertices = this.clipGeometry(decalVertices, [0, 0, -1]);

    // third, generate final vertices, normals and uvs
    const size = this.size;
    for (let i = 0; i < decalVertices.length; i += 1) {
      let decalVertex = decalVertices[i];

      // create texture coordinates (we are still in projector space)
      // 旋转180度
      const uvx = 0.5 + decalVertex.position[0] / size[0];
      const uvy = 0.5 + decalVertex.position[1] / size[1];

      const uv = [uvx, 1 - uvy];

      // transform the vertex back to world space
      const projectorMatrix = this.projectorMatrix;
      const o = vec3.create();
      const local = vec3.transformMat4(o, decalVertex.position, projectorMatrix);
      decalVertex.position = local;

      // now create vertex and normal buffer data

      const position = [decalVertex.position[0], decalVertex.position[1], decalVertex.position[2]];
      const normal = [decalVertex.normal[0], decalVertex.normal[1], decalVertex.normal[2]];

      vertexValues.push({
        POSITION: position,
        NORMAL: normal,
        TEXCOORD_0: uv
      });
    }

    return vertexValues;
  }

  pushDecalVertex(decalVertices, vertexInput, normalInput) {
    // 目标mesh
    const mesh = this.targetMesh;
    // 投影矩阵的逆
    const projectorMatrixInverse = this.projectorMatrixInverse;

    // transform the vertex to world space, then to projector space
    const targetMatrix = this.node.transform.worldMatrix;
    const temp1 = vec3.create();
    const temp2 = vec3.create();
    const temp3 = vec3.create();

    const local = vec3.transformMat4(temp1, vertexInput, targetMatrix);
    const vertex = vec3.transformMat4(temp2, local, projectorMatrixInverse);

    let normal;
    if (normalInput) {
      normal = transformDirection(temp3, normalInput, targetMatrix);
    } else {
      normal = [0, 0, 0];
    }

    decalVertices.push(new DecalVertex(vertex, normal));
  }

  clipGeometry(inVertices, plane) {
    const outVertices = [];
    const size = this.size;
    const s = 0.5 * Math.abs(vec3.dot(size, plane));

    // a single iteration clips one face,
    // which consists of three consecutive 'DecalVertex' objects
    for (let i = 0; i < inVertices.length; i += 3) {
      let v1Out;
      let v2Out;
      let v3Out;
      let total = 0;

      let nV1;
      let nV2;
      let nV3;
      let nV4;

      const d1 = vec3.dot(inVertices[i + 0].position, plane) - s;
      const d2 = vec3.dot(inVertices[i + 1].position, plane) - s;
      const d3 = vec3.dot(inVertices[i + 2].position, plane) - s;
      v1Out = d1 > 0;
      v2Out = d2 > 0;
      v3Out = d3 > 0;

      // calculate, how many vertices of the face lie outside of the clipping plane
      total = (v1Out ? 1 : 0) + (v2Out ? 1 : 0) + (v3Out ? 1 : 0);

      switch (total) {
        case 0: {
          // the entire face lies inside of the plane, no clipping needed
          outVertices.push(inVertices[i]);
          outVertices.push(inVertices[i + 1]);
          outVertices.push(inVertices[i + 2]);
          break;
        }

        case 1: {
          // one vertex lies outside of the plane, perform clipping

          if (v1Out) {
            nV1 = inVertices[i + 1];
            nV2 = inVertices[i + 2];
            nV3 = this.clip(inVertices[i], nV1, plane, s);
            nV4 = this.clip(inVertices[i], nV2, plane, s);
          }

          if (v2Out) {
            nV1 = inVertices[i];
            nV2 = inVertices[i + 2];
            nV3 = this.clip(inVertices[i + 1], nV1, plane, s);
            nV4 = this.clip(inVertices[i + 1], nV2, plane, s);

            outVertices.push(nV3);
            outVertices.push(nV2.clone());
            outVertices.push(nV1.clone());

            outVertices.push(nV2.clone());
            outVertices.push(nV3.clone());
            outVertices.push(nV4);
            break;
          }

          if (v3Out) {
            nV1 = inVertices[i];
            nV2 = inVertices[i + 1];
            nV3 = this.clip(inVertices[i + 2], nV1, plane, s);
            nV4 = this.clip(inVertices[i + 2], nV2, plane, s);
          }

          outVertices.push(nV1.clone());
          outVertices.push(nV2.clone());
          outVertices.push(nV3);

          outVertices.push(nV4);
          outVertices.push(nV3.clone());
          outVertices.push(nV2.clone());
          break;
        }

        case 2: {
          // two vertices lies outside of the plane, perform clipping
          if (!v1Out) {
            nV1 = inVertices[i].clone();
            nV2 = this.clip(nV1, inVertices[i + 1], plane, s);
            nV3 = this.clip(nV1, inVertices[i + 2], plane, s);
            outVertices.push(nV1);
            outVertices.push(nV2);
            outVertices.push(nV3);
          }

          if (!v2Out) {
            nV1 = inVertices[i + 1].clone();
            nV2 = this.clip(nV1, inVertices[i + 2], plane, s);
            nV3 = this.clip(nV1, inVertices[i], plane, s);
            outVertices.push(nV1);
            outVertices.push(nV2);
            outVertices.push(nV3);
          }

          if (!v3Out) {
            nV1 = inVertices[i + 2].clone();
            nV2 = this.clip(nV1, inVertices[i], plane, s);
            nV3 = this.clip(nV1, inVertices[i + 1], plane, s);
            outVertices.push(nV1);
            outVertices.push(nV2);
            outVertices.push(nV3);
          }
          break;
        }

        case 3: {
          // the entire face lies outside of the plane, so let's discard the corresponding vertices
          break;
        }
      }
    }
    return outVertices;
  }

  clip(v0, v1, p, s) {
    const d0 = vec3.dot(v0.position, p) - s;
    const d1 = vec3.dot(v1.position, p) - s;

    const s0 = d0 / (d0 - d1);

    const v = new DecalVertex(
      [
        v0.position[0] + s0 * (v1.position[0] - v0.position[0]),
        v0.position[1] + s0 * (v1.position[1] - v0.position[1]),
        v0.position[2] + s0 * (v1.position[2] - v0.position[2])
      ],
      [
        v0.normal[0] + s0 * (v1.normal[0] - v0.normal[0]),
        v0.normal[1] + s0 * (v1.normal[1] - v0.normal[1]),
        v0.normal[2] + s0 * (v1.normal[2] - v0.normal[2])
      ]
    );

    // need to clip more values (texture coordinates)? do it this way:
    // intersectpoint.value = a.value + s * ( b.value - a.value );
    return v;
  }
}

class DecalVertex {
  public position;
  public normal;
  public constructor(position, normal = [0, 0, 0]) {
    this.position = position;
    this.normal = normal;
  }

  clone() {
    return new DecalVertex(this.position.slice(0), this.normal.slice(0));
  }
}
