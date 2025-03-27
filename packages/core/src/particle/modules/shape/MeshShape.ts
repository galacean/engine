import { Rand, Vector3, Vector4 } from "@galacean/engine-math";
import { TypedArray } from "../../../base";
import { ignoreClone } from "../../../clone/CloneManager";
import { Entity } from "../../../Entity";
import { VertexElement } from "../../../graphic";
import { MeshModifyFlags } from "../../../graphic/Mesh";
import { ModelMesh, VertexAttribute } from "../../../mesh";
import { BaseShape } from "./BaseShape";
import { ParticleShapeType } from "./enums/ParticleShapeType";

/**
 * Particle shape that emits particles from a mesh.
 */
export class MeshShape extends BaseShape {
  readonly shapeType = ParticleShapeType.Mesh;

  @ignoreClone
  private _mesh: ModelMesh;
  @ignoreClone
  private _positionBuffer: TypedArray;
  @ignoreClone
  private _normalBuffer: TypedArray;
  @ignoreClone
  private _positionElementInfo = new Vector4(); // x:offset, y:stride, z:isNormalized, w:normalizedScaleFactor
  @ignoreClone
  private _normalElementInfo = new Vector4(); // x:offset, y:stride, z:isNormalized, w:normalizedScaleFactor

  /**
   * Mesh to emit particles from.
   */
  get mesh(): ModelMesh {
    return this._mesh;
  }

  set mesh(value: ModelMesh) {
    const lastMesh = this._mesh;
    if (lastMesh !== value) {
      this._mesh = value;

      if (lastMesh) {
        lastMesh._addReferCount(-1);
        lastMesh._updateFlagManager.removeListener(this._onMeshChanged);
      }
      if (value) {
        value._addReferCount(1);
        value._updateFlagManager.addListener(this._onMeshChanged);
      }
      this._onMeshChanged(MeshModifyFlags.VertexElements);

      this._updateManager.dispatch();
    }
  }

  /**
   * @internal
   */
  _generatePositionAndDirection(rand: Rand, emitTime: number, position: Vector3, direction: Vector3): void {
    const {
      _positionBuffer: positions,
      _positionElementInfo: positionInfo,
      _normalBuffer: normals,
      _normalElementInfo: normalInfo
    } = this;

    const randomIndex = Math.floor(rand.random() * this._mesh.vertexCount);

    // index = randomIndex * stride + offset
    const positionIndex = randomIndex * positionInfo.y + positionInfo.x;
    const normalIndex = randomIndex * normalInfo.y + normalInfo.x;

    position.set(positions[positionIndex], positions[positionIndex + 1], positions[positionIndex + 2]);
    positionInfo.z && position.scale(positionInfo.w);

    direction.set(normals[normalIndex], normals[normalIndex + 1], normals[normalIndex + 2]);
    normalInfo.z && direction.scale(normalInfo.w);
  }

  /**
   * @internal
   */
  _getPositionRange(outMin: Vector3, outMax: Vector3): void {
    const { bounds } = this._mesh;
    bounds.min.copyTo(outMin);
    bounds.max.copyTo(outMax);
  }

  /**
   * @internal
   */
  _getDirectionRange(outMin: Vector3, outMax: Vector3): void {
    // @todo: Should use min and max of normal, use bounds is worst, but we can't get the min and max of normal by fast way.
    const { bounds } = this._mesh;
    bounds.min.copyTo(outMin);
    bounds.max.copyTo(outMax);
  }

  private _getAttributeBuffer(
    mesh: ModelMesh,
    vertexElement: VertexElement,
    reusePositionBuffer: boolean,
    outVertexElementInfo: Vector4
  ): TypedArray {
    if (!vertexElement) {
      throw `Mesh must have ${vertexElement.attribute} attribute.`;
    }

    const vertexBufferBinding = mesh.vertexBufferBindings[vertexElement.bindingIndex];
    const formatMetaInfo = vertexElement._formatMetaInfo;

    let typedBuffer: TypedArray;
    if (reusePositionBuffer) {
      return this._positionBuffer;
    } else {
      const buffer = vertexBufferBinding?.buffer;
      if (!buffer) {
        throw `${vertexElement.attribute} buffer not found.`;
      }

      if (buffer.readable) {
        // If buffer is readable, we can get the data directly
        typedBuffer = mesh._getVertexTypedArray(buffer.data.buffer, formatMetaInfo.type);
      } else {
        // Must read from GPU
        const unit8Buffer = new Uint8Array(buffer.byteLength);
        typedBuffer = mesh._getVertexTypedArray(unit8Buffer.buffer, formatMetaInfo.type);
        buffer.getData(typedBuffer);
      }
    }

    outVertexElementInfo.set(
      vertexElement.offset / typedBuffer.BYTES_PER_ELEMENT,
      vertexBufferBinding.stride / typedBuffer.BYTES_PER_ELEMENT,
      formatMetaInfo.normalized ? 1 : 0,
      formatMetaInfo.normalizedScaleFactor
    );

    return typedBuffer;
  }

  @ignoreClone
  private _onMeshChanged(type: MeshModifyFlags): void {
    if (type & MeshModifyFlags.VertexElements) {
      const mesh = this._mesh;
      if (mesh) {
        const positionElement = mesh.getVertexElement(VertexAttribute.Position);
        const normalElement = mesh.getVertexElement(VertexAttribute.Normal);
        this._positionBuffer = this._getAttributeBuffer(mesh, positionElement, false, this._positionElementInfo);
        // If the position and normal use the same buffer, we can reuse the position buffer
        const reusePositionBuffer = positionElement.bindingIndex === normalElement.bindingIndex;
        this._normalBuffer = this._getAttributeBuffer(
          mesh,
          normalElement,
          reusePositionBuffer,
          this._normalElementInfo
        );
      } else {
        this._positionElementInfo.set(-1, -1, -1, -1);
        this._positionBuffer = null;
        this._normalElementInfo.set(-1, -1, -1, -1);
        this._normalBuffer = null;
      }
    }
  }

  /**
   * @internal
   */
  _cloneTo(target: MeshShape, _: Entity, __: Entity): void {
    target.mesh = this._mesh;
  }
}
