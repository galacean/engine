import {
  Entity,
  Mesh,
  MeshRenderer,
  Primitive,
  BufferGeometry,
  BufferAttribute,
  DataType,
  InterleavedBuffer
} from "@alipay/o3-core";
import { Matrix, Quaternion, Vector3 } from "@alipay/o3-math";
import { fromBufferAttribute, makeRotationFromQuaternion, setPosition, transformDirection } from "./util";

type FloatArray = Array<number> | Float32Array;

interface Intersection {
  entity: Entity;
  distance: Number;
  point: FloatArray;
  normal: FloatArray;
  primitive: Primitive;
  materialName: String;
}

export class DecalGeometry extends BufferGeometry {
  public size: Vector3;
  public readonly node: Entity;
  public readonly targetMesh: Mesh;
  public readonly targetPrimitive: Primitive;
  public readonly position: Vector3;
  public readonly orientation: Quaternion;
  public readonly projectorMatrix: Matrix;
  public readonly projectorMatrixInverse: Matrix;
  public constructor(intersection: Intersection, position: Vector3, orientation: Quaternion, size: Vector3) {
    super();
    this.node = intersection.entity;
    const meshRenderer: MeshRenderer = this.node.getComponent(MeshRenderer);
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
    this.projectorMatrix = makeRotationFromQuaternion(orientation);
    setPosition(this.projectorMatrix, position);

    // get projectorMatrixInverse
    Matrix.invert(this.projectorMatrix, this.projectorMatrixInverse);

    const vertexValues = this.generate();
    const vertexCount = vertexValues.length;
    const pos = new BufferAttribute({
      semantic: "POSITION",
      size: 3,
      type: DataType.FLOAT,
      normalized: false
    });
    const normal = new BufferAttribute({
      semantic: "NORMAL",
      size: 3,
      type: DataType.FLOAT,
      normalized: true
    });
    const uv = new BufferAttribute({
      semantic: "TEXCOORD_0",
      size: 2,
      type: DataType.FLOAT,
      normalized: true
    });
    const buffer = new InterleavedBuffer([pos, normal, uv], vertexCount);
    this.addVertexBufferParam(buffer);
    console.log(vertexValues);
    // this.setAllVertexValues(vertexValues);
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

    const index = primitive.indexBuffers[0];
    const count = primitive.indexBuffers.length;

    // first, create an array of 'DecalVertex' objects
    // three consecutive 'DecalVertex' objects represent a single face
    //
    // this data structure will be later used to perform the clipping
    for (let i = 0; i < count; i += 1) {
      const vertex = fromBufferAttribute(positionAttribute, index[i]);
      let normal;
      if (normalAttribute) {
        normal = fromBufferAttribute(normalAttribute, index[i]);
      }

      this.pushDecalVertex(decalVertices, vertex, normal);
    }
    // second, clip the geometry so that it doesn't extend out from the projector
    decalVertices = this.clipGeometry(decalVertices, new Vector3(1, 0, 0));
    decalVertices = this.clipGeometry(decalVertices, new Vector3(-1, 0, 0));
    decalVertices = this.clipGeometry(decalVertices, new Vector3(0, 1, 0));
    decalVertices = this.clipGeometry(decalVertices, new Vector3(0, -1, 0));
    decalVertices = this.clipGeometry(decalVertices, new Vector3(0, 0, 1));
    decalVertices = this.clipGeometry(decalVertices, new Vector3(0, 0, -1));

    // third, generate final vertices, normals and uvs
    const size = this.size;
    for (let i = 0; i < decalVertices.length; i += 1) {
      let decalVertex = decalVertices[i];

      // create texture coordinates (we are still in projector space)
      // 旋转180度
      const uvx = 0.5 + decalVertex.position.x / size.x;
      const uvy = 0.5 + decalVertex.position.y / size.y;

      const uv = [uvx, 1 - uvy];

      // transform the vertex back to world space
      Vector3.transformCoordinate(decalVertex.position, this.projectorMatrix, decalVertex.position);

      // now create vertex and normal buffer data

      const position = [decalVertex.position.x, decalVertex.position.y, decalVertex.position.z];
      const normal = [decalVertex.normal.x, decalVertex.normal.y, decalVertex.normal.z];

      vertexValues.push({
        POSITION: position,
        NORMAL: normal,
        TEXCOORD_0: uv
      });
    }

    return vertexValues;
  }

  pushDecalVertex(decalVertices, vertexInput: Vector3, normalInput: Vector3) {
    // 投影矩阵的逆
    const projectorMatrixInverse: Matrix = this.projectorMatrixInverse;

    // transform the vertex to world space, then to projector space
    const targetMatrix: Matrix = this.node.transform.worldMatrix;
    const local: Vector3 = new Vector3();
    const vertex: Vector3 = new Vector3();
    const normal: Vector3 = new Vector3();

    Vector3.transformCoordinate(vertexInput, targetMatrix, local);
    Vector3.transformCoordinate(local, projectorMatrixInverse, vertex);

    if (normalInput) {
      transformDirection(normal, normalInput, targetMatrix);
    } else {
      normal.setValue(0, 0, 0);
    }

    decalVertices.push(new DecalVertex(vertex, normal));
  }

  clipGeometry(inVertices, plane: Vector3) {
    const outVertices = [];
    const s = 0.5 * Math.abs(Vector3.dot(this.size, plane));

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

      const d1 = Vector3.dot(inVertices[i + 0].position, plane) - s;
      const d2 = Vector3.dot(inVertices[i + 1].position, plane) - s;
      const d3 = Vector3.dot(inVertices[i + 2].position, plane) - s;
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

  clip(v0: DecalVertex, v1: DecalVertex, p: Vector3, s: number) {
    const d0: number = Vector3.dot(v0.position, p) - s;
    const d1: number = Vector3.dot(v1.position, p) - s;

    const s0: number = d0 / (d0 - d1);

    const v = new DecalVertex(
      new Vector3(
        v0.position.x + s0 * (v1.position.x - v0.position.x),
        v0.position.y + s0 * (v1.position.y - v0.position.y),
        v0.position.z + s0 * (v1.position.z - v0.position.z)
      ),
      new Vector3(
        v0.normal.x + s0 * (v1.normal.x - v0.normal.x),
        v0.normal.y + s0 * (v1.normal.y - v0.normal.y),
        v0.normal.z + s0 * (v1.normal.z - v0.normal.z)
      )
    );

    // need to clip more values (texture coordinates)? do it this way:
    // intersectpoint.value = a.value + s * ( b.value - a.value );
    return v;
  }
}

class DecalVertex {
  public position: Vector3;
  public normal: Vector3;
  public constructor(position: Vector3, normal: Vector3) {
    this.position = position;
    this.normal = normal;
  }

  clone() {
    const pos = new Vector3();
    this.position.cloneTo(pos);
    const normal = new Vector3();
    this.normal.cloneTo(normal);

    return new DecalVertex(pos, normal);
  }
}
