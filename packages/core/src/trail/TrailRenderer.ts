import { Matrix, Quaternion, Vector3 } from "@alipay/o3-math";
import { BufferGeometry, GeometryRenderer } from "../geometry";
import { BufferUsage } from "../graphic/enums/BufferUsage";
import { PrimitiveTopology } from "../graphic/enums/PrimitiveTopology";
import { VertexElementFormat } from "../graphic/enums/VertexElementFormat";
import { VertexBuffer } from "../graphic/VertexBuffer";
import { VertexBufferBinding } from "../graphic/VertexBufferBinding";
import { VertexElement } from "../graphic/VertexElement";
import { TrailMaterial } from "./TrailMaterial";

const _tempVector3 = new Vector3();

/**
 * 拖尾效果渲染组件
 */
export class TrailRenderer extends GeometryRenderer {
  private _vertexStride: number;
  private _vertices: Float32Array;
  private _vertexBuffer: VertexBuffer;
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
   * 纹理对象基类
   * @param {Entity} entity 所属的Node对象
   * @param {Object} props 可选配置，包含以下参数
   * @param {float} [props.stroke=0.2] 拖尾的宽度
   * @param {float} [props.minSeg=0.02] 拖尾形状由物体运动轨迹上的点构成，描述相邻点之间最小间隔距离
   * @param {Number} [props.lifetime=1000] 物体运动时，拖尾效果持续的时长
   * @param {Material} [props.material=TrailMaterial] 拖尾使用的材质，默认使用内置的TrailMaterial
   */
  constructor(entity, props) {
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

    const mtl = props.material || new TrailMaterial("trial_mtl");
    this.setMaterial(mtl);

    this.setTexture(props.texture);
    this._initGeometry();
  }

  /**
   * 每帧的更新函数
   * @private
   */
  update(deltaTime) {
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
        this._points[i].cloneTo(this._points[newIdx]);
      }
    }
    this._curPointNum -= mov;

    let appendNewPoint = true;
    if (this._curPointNum === this._maxPointNum) {
      appendNewPoint = false;
    } else if (this._curPointNum > 0) {
      const lastPoint = this._points[this._points.length - 1];
      if (Vector3.distance(this.entity.worldPosition, lastPoint) < this._minSeg) {
        appendNewPoint = false;
      } else {
        // debugger
      }
    }

    if (appendNewPoint) {
      this._pointStates[this._curPointNum] = this._lifetime;
      this.entity.worldPosition.cloneTo(this._points[this._curPointNum]);

      this._curPointNum++;
    }
  }

  /**
   * 更新位置，将数据对象加入渲染队列
   * @param {Camera} camera
   * @private
   */
  render(camera) {
    this._updateStrapVertices(camera, this._points);
    this._updateStrapCoords();
    this._vertexBuffer.setData(this._vertices);

    super.render(camera);
  }

  /**
   * 设置当前拖尾的纹理
   * @param {Texture2D} texture
   */
  setTexture(texture) {
    if (texture) {
      this.getMaterial().setValue("u_texture", texture);
    }
  }

  // ----------  private  -------------------
  /**
   * 初始化 geometry
   * @private
   */
  _initGeometry() {
    const geometry = new BufferGeometry();
    geometry.primitiveTopology = PrimitiveTopology.TriangleStrip;

    const vertexStride = 20;
    const vertexCount = this._maxPointNum * 2;
    const vertexFloatCount = vertexCount * vertexStride;
    const vertices = new Float32Array(vertexFloatCount);
    const vertexElements = [
      new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0),
      new VertexElement("TEXCOORD_0", 12, VertexElementFormat.Vector2, 0)
    ];
    const vertexBuffer = new VertexBuffer(vertexFloatCount * 4, BufferUsage.Dynamic, this.engine);

    geometry.setVertexBufferBindings(new VertexBufferBinding(vertexBuffer, vertexStride));
    geometry.addVertexElements(vertexElements);
    geometry.drawGroup.count = vertexCount;

    this._vertexBuffer = vertexBuffer;
    this._vertexStride = vertexStride;
    this._vertices = vertices;
    this.geometry = geometry;
  }

  /**
   * 更新拖尾顶点位置
   * @private
   */
  _updateStrapVertices(camera, points: Array<Vector3>) {
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

    const vertieces = this._vertices;
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
      vertieces[p0] = up.x;
      vertieces[p0 + 1] = up.y;
      vertieces[p0 + 2] = up.z;

      vertieces[p1] = down.x;
      vertieces[p1 + 1] = down.y;
      vertieces[p1 + 2] = down.z;
    }
  }

  /**
   * 更新拖尾 uv 位置
   * @private
   */
  _updateStrapCoords() {
    if (this._prePointsNum === this._curPointNum) {
      return;
    }

    this._prePointsNum = this._curPointNum;

    const count = this._curPointNum;
    const texDelta = 1.0 / count;
    const vertieces = this._vertices;
    for (let i = 0; i < count; i++) {
      const d = 1.0 - i * texDelta;
      const p0 = (i * 2 * this._vertexStride) / 4;
      const p1 = ((i * 2 + 1) * this._vertexStride) / 4;

      vertieces[p0] = 0;
      vertieces[p0 + 1] = d;

      vertieces[p1] = 1.0;
      vertieces[p1 + 1] = d;
    }
  }

  /**
   * 将向量 a 投影到向 p 上。
   * @param a - 要投影的向量
   * @param p - 目标向量
   * @param out - 向量 a 投影到向量 p 的结果向量
   */
  _projectOnVector(a: Vector3, p: Vector3, out: Vector3): void {
    const n_p = p.clone();
    Vector3.normalize(n_p, n_p);
    const cosine = Vector3.dot(a, n_p);
    out.x = n_p.x * cosine;
    out.y = n_p.y * cosine;
    out.z = n_p.z * cosine;
  }

  /**
   * 将向量 a 投影到和法向量 n 正交的平面上。
   * @param a - 输入向量
   * @param n - 法向量
   * @param out - 投影到平面上的向量
   */
  _projectOnPlane(a: Vector3, n: Vector3, out: Vector3) {
    this._projectOnVector(a, n, _tempVector3);
    Vector3.subtract(a, _tempVector3, out);
  }
}
