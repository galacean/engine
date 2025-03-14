import { Rand, Vector3 } from "@galacean/engine-math";
import { TypedArray } from "../../../base";
import { ignoreClone } from "../../../clone/CloneManager";
import { Entity } from "../../../Entity";
import { VertexElement } from "../../../graphic";
import { MeshModifyFlags } from "../../../graphic/Mesh";
import { ModelMesh, VertexAttribute } from "../../../mesh";
import { BaseShape } from "./BaseShape";
import { ParticleShapeType } from "./enums/ParticleShapeType";

export class MeshShape extends BaseShape {
  readonly shapeType = ParticleShapeType.Mesh;

  @ignoreClone
  private _mesh: ModelMesh;
  @ignoreClone
  private _positionVertexElement: VertexElement;
  @ignoreClone
  private _normalVertexElement: VertexElement;
  @ignoreClone
  private _positionBuffer: TypedArray;
  @ignoreClone
  private _normalBuffer: TypedArray;

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
      _mesh: mesh,
      _positionBuffer: positions,
      _positionVertexElement: positionVertexElement,
      _normalBuffer: normals,
      _normalVertexElement: normalVertexElement
    } = this;

    const randomIndex = Math.floor(rand.random() * mesh.vertexCount);

    const positionByteStride = mesh.vertexBufferBindings[positionVertexElement.bindingIndex].stride;
    const positionByteOffset = positionVertexElement.offset;

    const normalByteStride = this._mesh.vertexBufferBindings[normalVertexElement.bindingIndex].stride;
    const normalByteOffset = normalVertexElement.offset;

    const positionOffset = (randomIndex * positionByteStride + positionByteOffset) / positions.BYTES_PER_ELEMENT;
    const normalOffset = (randomIndex * normalByteStride + normalByteOffset) / normals.BYTES_PER_ELEMENT;
    position.set(positions[positionOffset], positions[positionOffset + 1], positions[positionOffset + 2]);
    direction.set(normals[normalOffset], normals[normalOffset + 1], normals[normalOffset + 2]);
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
    // Should use min and max of normal, use bounds is worst, but we can't get the min and max of normal by fast way.
    const { bounds } = this._mesh;
    bounds.min.copyTo(outMin);
    bounds.max.copyTo(outMax);
  }

  private _getAttributeData(
    mesh: ModelMesh,
    attribute: VertexAttribute,
    out: (buffer: TypedArray, vertexElement: VertexElement) => void
  ): void {
    const vertexElement = mesh.getVertexElement(attribute);
    if (!vertexElement) {
      throw `Mesh must have ${attribute} attribute.`;
    }

    const buffer = mesh.vertexBufferBindings[vertexElement.bindingIndex]?.buffer;
    if (!buffer) {
      throw `${attribute} buffer not found.`;
    }
    if (!buffer.readable) {
      throw `${attribute} buffer must be readable.`;
    }

    const typedBuffer = mesh._getVertexTypedArray(buffer.data.buffer, vertexElement._formatMetaInfo.type);
    out(typedBuffer, vertexElement);
  }

  @ignoreClone
  private _onMeshChanged(type: MeshModifyFlags): void {
    if (type & MeshModifyFlags.VertexElements) {
      const mesh = this._mesh;
      if (mesh) {
        this._getAttributeData(mesh, VertexAttribute.Position, (typedBuffer, vertexElement) => {
          this._positionVertexElement = vertexElement;
          this._positionBuffer = typedBuffer;
        });

        this._getAttributeData(mesh, VertexAttribute.Normal, (typedBuffer, vertexElement) => {
          this._normalVertexElement = vertexElement;
          this._normalBuffer = typedBuffer;
        });
      } else {
        this._positionVertexElement = null;
        this._positionBuffer = null;
        this._normalVertexElement = null;
        this._normalBuffer = null;
      }
    }
  }

  /**
   * @internal
   */
  _cloneTo(target: MeshShape, srcRoot: Entity, targetRoot: Entity): void {
    target.mesh = this._mesh;
  }
}
