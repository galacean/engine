import { Rand, Vector3, Vector4 } from "@galacean/engine-math";
import { TypedArray } from "../../../base";
import { ignoreClone } from "../../../clone/CloneDecorators";
import type { ICloneHook } from "../../../clone/ICloneHook";
import type { Buffer, VertexElement } from "../../../graphic";
import { MeshModifyFlags } from "../../../graphic/Mesh";
import { ModelMesh, VertexAttribute } from "../../../mesh";
import { BaseShape } from "./BaseShape";
import { ParticleShapeType } from "./enums/ParticleShapeType";

/**
 * Particle shape that emits particles from a mesh.
 */
export class MeshShape extends BaseShape implements ICloneHook<MeshShape> {
  readonly shapeType = ParticleShapeType.Mesh;

  @ignoreClone
  private _mesh: ModelMesh | null;
  @ignoreClone
  private _positionBuffer: TypedArray | null;
  @ignoreClone
  private _normalBuffer: TypedArray | null;
  @ignoreClone
  private _positionElementInfo = new Vector4(); // x:offset, y:stride, z:isNormalized, w:normalizedScaleFactor
  @ignoreClone
  private _normalElementInfo = new Vector4(); // x:offset, y:stride, z:isNormalized, w:normalizedScaleFactor

  @ignoreClone
  private _revision = 0;
  @ignoreClone
  private _pending?: Promise<void>;
  @ignoreClone
  private _readError?: Error;

  /** Resolve once the shape can sample this mesh, including GPU-only vertex buffers. */
  prepare(): Promise<void> {
    const pending = this._pending;
    return Promise.resolve(pending).then(() => {
      if (pending !== this._pending) return this.prepare();
      if (this._readError) throw this._readError;
    });
  }

  /** @internal */
  get _ready(): boolean {
    if (this._readError) throw this._readError;
    return !!this._positionBuffer && !!this._normalBuffer;
  }

  /**
   * Mesh to emit particles from.
   */
  get mesh(): ModelMesh | null {
    return this._mesh;
  }

  set mesh(value: ModelMesh | null) {
    const lastMesh = this._mesh!;
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
  override _destroy(): void {
    this.mesh = null;
  }

  /**
   * @internal
   */
  _generateLocalPositionAndDirection(rand: Rand, emitTime: number, position: Vector3, direction: Vector3): void {
    const {
      _positionBuffer: optionalPositions,
      _positionElementInfo: positionInfo,
      _normalBuffer: optionalNormals,
      _normalElementInfo: normalInfo
    } = this;

    const positions = optionalPositions!;
    const normals = optionalNormals!;
    const randomIndex = Math.floor(rand.random() * this._mesh!.vertexCount);

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
  _getLocalPositionRange(outMin: Vector3, outMax: Vector3): void {
    const { bounds } = this._mesh!;
    bounds.min.copyTo(outMin);
    bounds.max.copyTo(outMax);
  }

  /**
   * @internal
   */
  _getLocalDirectionRange(outMin: Vector3, outMax: Vector3): void {
    // @todo: Should use min and max of normal, use bounds is worst, but we can't get the min and max of normal by fast way.
    const { bounds } = this._mesh!;
    bounds.min.copyTo(outMin);
    bounds.max.copyTo(outMax);
  }

  private _setAttribute(mesh: ModelMesh, element: VertexElement, bytes: Uint8Array, info: Vector4): TypedArray {
    const format = element._formatMetaInfo;
    const view = mesh._getVertexTypedArray(bytes.buffer, format.type, bytes.byteOffset, bytes.byteLength);
    if (!view) throw new Error("Unsupported mesh emission attribute format for " + element.attribute);
    const unit = view.BYTES_PER_ELEMENT;
    info.set(
      element.offset / unit,
      mesh.vertexBufferBindings[element.bindingIndex]!.stride / unit,
      format.normalized ? 1 : 0,
      format.normalizedScaleFactor
    );
    return view;
  }

  @ignoreClone
  private _onMeshChanged = (type: MeshModifyFlags): void => {
    if (!(type & MeshModifyFlags.VertexElements)) return;
    const revision = ++this._revision;
    this._positionBuffer = this._normalBuffer = null;
    this._pending = this._readError = undefined;
    const mesh = this._mesh;
    if (!mesh) return;
    const position = mesh.getVertexElement(VertexAttribute.Position);
    const normal = mesh.getVertexElement(VertexAttribute.Normal);
    if (!position || !normal) throw new Error("Mesh must have both POSITION and NORMAL attributes.");
    const bindings = mesh.vertexBufferBindings;
    const posBuffer = bindings[position.bindingIndex]?.buffer;
    const normalBuffer = bindings[normal.bindingIndex]?.buffer;
    if (!posBuffer || !normalBuffer) throw new Error("Mesh emission attributes require bound vertex buffers.");
    const pending: Promise<void>[] = [];
    const read = (buffer: Buffer): Uint8Array => {
      const source = buffer._getVertexSource();
      if (source) return source;
      const bytes = new Uint8Array(buffer.byteLength);
      pending.push(buffer.getDataAsync(bytes));
      return bytes;
    };
    const posBytes = read(posBuffer);
    const normalBytes = posBuffer === normalBuffer ? posBytes : read(normalBuffer);
    const apply = () => {
      if (revision !== this._revision) return;
      this._positionBuffer = this._setAttribute(mesh, position, posBytes, this._positionElementInfo);
      this._normalBuffer = this._setAttribute(mesh, normal, normalBytes, this._normalElementInfo);
    };
    if (pending.length) {
      this._pending = Promise.all(pending)
        .then(apply)
        .catch((error) => {
          if (revision === this._revision) this._readError = error instanceof Error ? error : new Error(String(error));
        });
    } else {
      apply();
    }
  };

  /**
   * @internal
   * @inheritdoc
   */
  _onClone(target: MeshShape): void {
    target.mesh = this._mesh!;
  }
}
