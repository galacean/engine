import { Matrix, Quaternion, Vector3 } from "@galacean/engine-math";
import { Entity } from "../Entity";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { Buffer } from "../graphic/Buffer";
import { VertexElement } from "../graphic/VertexElement";
import { BufferUsage } from "../graphic/enums/BufferUsage";
import { MeshTopology } from "../graphic/enums/MeshTopology";
import { VertexElementFormat } from "../graphic/enums/VertexElementFormat";
import { BufferMesh } from "../mesh/BufferMesh";
import { MeshRenderer } from "../mesh/MeshRenderer";
import { Texture2D } from "../texture";
import { TrailMaterial } from "./TrailMaterial";

const _tempVector3 = new Vector3();

/**
 * @deprecated
 */
export class TrailRenderer extends MeshRenderer {
  private _vertexStride: number;
  private _vertices: Float32Array;
  private _vertexBuffer: Buffer;
  private _stroke;
  private _minSeg;
  private _lifetime;
  private _maxPointNum;
  private _points: Array<Vector3>;
  private _pointStates: Array<number>;
  private _strapPoints: Array<Vector3>;
  private _curPointNum;
  private _prePointsNum;
  /**
   * @deprecated
   */
  constructor(entity: Entity, props: any) {
    super(entity);

    this._stroke = props.stroke || 0.2;
    this._minSeg = props.minSeg || 0.02;
    this._lifetime = props.lifetime || 1000;
    this._maxPointNum = (this._lifetime / 1000.0) * entity.engine.targetFrameRate;

    this._points = [];
    this._pointStates = [];
    this._strapPoints = [];
    for (let i = 0; i < this._maxPointNum; i++) {
      this._points.push(new Vector3());
      this._pointStates.push(this._lifetime);

      this._strapPoints.push(new Vector3());
      this._strapPoints.push(new Vector3());
    }
    this._curPointNum = 0;

    const mtl = props.material || new TrailMaterial(this.engine);
    this.setMaterial(mtl);

    this.setTexture(props.texture);
    this._initGeometry();
  }

  /**
   * @internal
   */
  override update(deltaTime: number) {
    let mov = 0,
      newIdx = 0;
    for (let i = 0; i < this._curPointNum; i++) {
      this._pointStates[i] -= deltaTime;
      if (this._pointStates[i] < 0) {
        mov++;
      } else if (mov > 0) {
        newIdx = i - mov;

        // Move data
        this._pointStates[newIdx] = this._pointStates[i];

        // Move point
        this._points[newIdx].copyFrom(this._points[i]);
      }
    }
    this._curPointNum -= mov;

    let appendNewPoint = true;
    if (this._curPointNum === this._maxPointNum) {
      appendNewPoint = false;
    } else if (this._curPointNum > 0) {
      const lastPoint = this._points[this._points.length - 1];
      if (Vector3.distance(this.entity.transform.worldPosition, lastPoint) < this._minSeg) {
        appendNewPoint = false;
      } else {
        // debugger
      }
    }

    if (appendNewPoint) {
      this._pointStates[this._curPointNum] = this._lifetime;
      this._points[this._curPointNum].copyFrom(this.entity.transform.worldPosition);

      this._curPointNum++;
    }
  }

  /**
   * @deprecated
   * Set trail texture.
   * @param texture
   */
  setTexture(texture: Texture2D) {
    if (texture) {
      this.getMaterial().shaderData.setTexture("u_texture", texture);
    }
  }

  /**
   * @internal
   */
  protected override _render(context: RenderContext): void {
    this._updateStrapVertices(context.camera, this._points);
    this._updateStrapCoords();
    this._vertexBuffer.setData(this._vertices);

    super._render(context);
  }

  private _initGeometry() {
    const mesh = new BufferMesh(this._entity.engine);

    const vertexStride = 20;
    const vertexCount = this._maxPointNum * 2;
    const vertexFloatCount = vertexCount * vertexStride;
    const vertices = new Float32Array(vertexFloatCount);
    const vertexElements = [
      new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0),
      new VertexElement("TEXCOORD_0", 12, VertexElementFormat.Vector2, 0)
    ];
    const vertexBuffer = new Buffer(this.engine, vertexFloatCount * 4, BufferUsage.Dynamic);

    mesh.setVertexBufferBinding(vertexBuffer, vertexStride);
    mesh.setVertexElements(vertexElements);
    mesh.addSubMesh(0, vertexCount, MeshTopology.TriangleStrip);

    this._vertexBuffer = vertexBuffer;
    this._vertexStride = vertexStride;
    this._vertices = vertices;
    this.mesh = mesh;
  }

  private _updateStrapVertices(camera, points: Array<Vector3>) {
    const m: Matrix = camera.viewMatrix;
    const e = m.elements;
    const vx = new Vector3(e[0], e[4], e[8]);
    const vy = new Vector3(e[1], e[5], e[9]);
    const vz = new Vector3(e[2], e[6], e[10]);
    const s = this._stroke;

    vy.scale(s);

    const up = new Vector3();
    const down = new Vector3();

    const rotation = new Quaternion();

    Vector3.transformByQuat(vx, rotation, vx);
    Vector3.transformByQuat(vy, rotation, vy);

    const dy = new Vector3();
    const cross = new Vector3();
    const perpVector = new Vector3();

    vx.normalize();

    const vertices = this._vertices;
    //-- quad pos
    for (let i = 0; i < this._maxPointNum; i++) {
      //-- center pos
      if (i < this._curPointNum) {
        const p = points[i];

        if (i === this._curPointNum - 1 && i !== 0) {
          Vector3.subtract(p, points[i - 1], perpVector);
        } else {
          Vector3.subtract(points[i + 1], p, perpVector);
        }

        this._projectOnPlane(perpVector, vz, perpVector);
        perpVector.normalize();

        // Calculate angle between vectors
        let angle = Math.acos(Vector3.dot(vx, perpVector));
        Vector3.cross(vx, perpVector, cross);
        if (Vector3.dot(cross, vz) <= 0) {
          angle = Math.PI * 2 - angle;
        }
        Quaternion.rotationAxisAngle(vz, angle, rotation);
        Vector3.transformByQuat(vy, rotation, dy);

        Vector3.add(p, dy, up);
        Vector3.subtract(p, dy, down);
      }

      const p0 = (i * 2 * this._vertexStride) / 4;
      const p1 = ((i * 2 + 1) * this._vertexStride) / 4;
      vertices[p0] = up.x;
      vertices[p0 + 1] = up.y;
      vertices[p0 + 2] = up.z;

      vertices[p1] = down.x;
      vertices[p1 + 1] = down.y;
      vertices[p1 + 2] = down.z;
    }
  }

  private _updateStrapCoords() {
    if (this._prePointsNum === this._curPointNum) {
      return;
    }

    this._prePointsNum = this._curPointNum;

    const count = this._curPointNum;
    const texDelta = 1.0 / count;
    const vertices = this._vertices;
    for (let i = 0; i < count; i++) {
      const d = 1.0 - i * texDelta;
      const p0 = (i * 2 * this._vertexStride) / 4;
      const p1 = ((i * 2 + 1) * this._vertexStride) / 4;

      vertices[p0] = 0;
      vertices[p0 + 1] = d;

      vertices[p1] = 1.0;
      vertices[p1 + 1] = d;
    }
  }

  private _projectOnVector(a: Vector3, p: Vector3, out: Vector3): void {
    const n_p = p.clone();
    Vector3.normalize(n_p, n_p);
    const cosine = Vector3.dot(a, n_p);
    out.x = n_p.x * cosine;
    out.y = n_p.y * cosine;
    out.z = n_p.z * cosine;
  }

  private _projectOnPlane(a: Vector3, n: Vector3, out: Vector3) {
    this._projectOnVector(a, n, _tempVector3);
    Vector3.subtract(a, _tempVector3, out);
  }
}
