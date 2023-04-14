import { Renderer } from "../Renderer";
import { BufferMesh } from "../mesh/BufferMesh";
import { Buffer, BufferBindFlag, BufferUsage, Mesh, MeshTopology, VertexElement, VertexElementFormat } from "../graphic";
import { Texture } from "../texture";
import { ICustomClone } from "../clone/ComponentCloner";
import { TrailMaterial } from "./TrailMaterial";
import { Vector3, Matrix, Color } from "@galacean/engine-math";

/**
 * Trail Renderer Component.
 */
export class TrailRenderer extends Renderer implements ICustomClone {
  private _mesh: Mesh;
  private _texture: Texture;

  private _currentLength: number = 0;
  private _currentEnd: number = -1;
  private _currentNodeIndex: number = 0;

  private _width: number = 1.0;
  private _maxLength: number = 0.0;

  private _time: number = 1.0;
  private _trailBirthTimes: Float32Array;
  private _trailBirthTimesBuffer: Buffer;

  private _vertexCount: number = 0;
  private _verticesPerNode: number = 2.0;

  private _nodeIDsBuffer: Buffer;
  private _nodeIDs: Float32Array;
  
  private _nodeCentersBuffer: Buffer;
  private _nodeCenters: Float32Array;

  private _vertexNodeIDsBuffer: Buffer;
  private _vertexNodeIDs: Float32Array;

  private _vertexBuffer: Buffer;
  private _positions: Float32Array;

  private _headVertexArray: Array<Vector3>;
  private _tempHeadVertexArray: Array<Vector3>;
  private _tempEntityMatrix: Matrix;
  private _tempCenterVertex: Vector3;


  private _headColor: Color = new Color();
  private _trailColor: Color = new Color();

  private _textureTileS: number = 8.0;
  private _textureTileT: number = 1.0;

  /**
   * Mesh of trail.
   */
  get mesh(): Mesh {
    return this._mesh;
  }

  set mesh(value: Mesh) {
    this._mesh = value;
  }

  /**
   * Texture of trail.
   */
  get texture(): Texture {
    return this._texture;
  }

  set texture(value: Texture) {
    this._texture = value;
    if (value) {
      this.getMaterial().shaderData.enableMacro("trailTexture");
      this.getMaterial().shaderData.setTexture("u_texture", value);
      this.getMaterial().shaderData.setFloat("u_textureTileS", this._textureTileS);
      this.getMaterial().shaderData.setFloat("u_textureTileT", this._textureTileT);
    } else {
      this.getMaterial().shaderData.disableMacro("trailTexture");
    }
  }

  /**
   * Width of trail.
   */
  get width(): number {
    return this._width;
  }

  set width(value: number) {
    this._width = value;
    this._init();
  }

  /**
   * Time of trail node life.
   */
  get time(): number {
    return this._time;
  }

  set time(value: number) {
    this._time = value;
    this._init();
    this.getMaterial().shaderData.setFloat("u_trailLifeTime", value);
  }

  /** 
   * Head color for trail.
   */
  get headColor(): Color {
    return this._headColor;
  }

  set headColor(value: Color) {
    this._headColor.copyFrom(value);
    this.getMaterial().shaderData.setColor("u_headColor", value);
  }

  /**
   * Trail color for trail.
   */
  get trailColor(): Color {
    return this._trailColor;
  }

  set trailColor(value: Color) {
    this._trailColor.copyFrom(value);
    this.getMaterial().shaderData.setColor("u_tailColor", value);
  }

  /**
   * Tile Texture WrapMode S-axis for trail.
   */
  get textureTileS(): number {
    return this._textureTileS;
  }

  set textureTileS(value: number) {
    this._textureTileS = value;
    this.getMaterial().shaderData.setFloat("u_textureTileS", value);
  }

  /**
   * Tile Texture WrapMode T-axis for trail.
   */
  get textureTileT(): number {
    return this._textureTileT;
  }

  set textureTileT(value: number) {
    this._textureTileT = value;
    this.getMaterial().shaderData.setFloat("u_textureTileT", value);
  }

  constructor(props) {
    super(props);

    const mtl = this.getMaterial() || new TrailMaterial(this.engine);
    this.setMaterial(mtl);
  }


  /**
   * @internal
   */
  _cloneTo(target: TrailRenderer): void {
    target.mesh = this._mesh;
  }

  private _init() {
    this._currentLength = 0;
    this._currentEnd = -1;
    this._currentNodeIndex = 0;
    this._maxLength = this._time * 120;


    this._createHeadVertexList();
    this._createTempHeadVertexList();

    this._tempEntityMatrix = new Matrix();
    this._tempCenterVertex = new Vector3();
    this._vertexCount = this._maxLength * this._verticesPerNode;
    this._positions = new Float32Array((this._vertexCount + this._verticesPerNode) * 3);
    this._nodeIDs = new Float32Array(this._vertexCount + 2);
    this._nodeCenters = new Float32Array((this._vertexCount + this._verticesPerNode) * 3);
    this._vertexNodeIDs = new Float32Array(this._vertexCount + 2);
    this._trailBirthTimes = new Float32Array(this._vertexCount + 2);

    this._createMesh();
  }

  private _createMesh(): BufferMesh {
    const mesh = new BufferMesh(this.engine, "trail-Mesh");

    const nodeIDsButter = new Buffer(this.engine, BufferBindFlag.VertexBuffer, this._nodeIDs, BufferUsage.Dynamic);
    mesh.setVertexBufferBinding(nodeIDsButter, 4, 0)

    const vertexNodeIDsBuffer = new Buffer(this.engine, BufferBindFlag.VertexBuffer, this._vertexNodeIDs, BufferUsage.Dynamic);
    mesh.setVertexBufferBinding(vertexNodeIDsBuffer, 4, 1);

    const positionBuffer = new Buffer(this.engine, BufferBindFlag.VertexBuffer, this._positions, BufferUsage.Dynamic);
    mesh.setVertexBufferBinding(positionBuffer, 12, 2);

    const trailBirthTimesBuffer = new Buffer(this.engine, BufferBindFlag.VertexBuffer, this._trailBirthTimes, BufferUsage.Dynamic);
    mesh.setVertexBufferBinding(trailBirthTimesBuffer, 4, 3);

    const nodeCentersBuffer = new Buffer(this.engine, BufferBindFlag.VertexBuffer, this._nodeCenters, BufferUsage.Dynamic);
    mesh.setVertexBufferBinding(nodeCentersBuffer, 12, 4);

    mesh.setVertexElements(
      [
        new VertexElement("a_nodeIndex", 0, VertexElementFormat.Float, 0),
        new VertexElement("a_vertexNodeIndex", 0, VertexElementFormat.Float, 1),
        new VertexElement("a_position", 0, VertexElementFormat.Vector3, 2),
        new VertexElement("a_trailBirthTime", 0, VertexElementFormat.Float, 3),
        new VertexElement("a_nodeCenter", 0, VertexElementFormat.Vector3, 4),
      ])
    mesh.addSubMesh(0, 0, MeshTopology.TriangleStrip);

    this._nodeIDsBuffer = nodeIDsButter;
    this._nodeCentersBuffer = nodeCentersBuffer;
    this._vertexNodeIDsBuffer = vertexNodeIDsBuffer;
    this._vertexBuffer = positionBuffer;
    this._trailBirthTimesBuffer = trailBirthTimesBuffer;
    this._mesh = mesh;

    return mesh;
  }

  private _createHeadVertexList(): void {
    const headWidth = this.width == 0 ? 1 : this.width;
    this._headVertexArray = [];

    let halfWidth = headWidth || 1.0;
    halfWidth = halfWidth / 2.0;

    this._headVertexArray.push(new Vector3(-halfWidth, 0, 0));
    this._headVertexArray.push(new Vector3(halfWidth, 0, 0));

    this._verticesPerNode = 2;
  }

  private _createTempHeadVertexList(): void {
    this._tempHeadVertexArray = [];
    for (let i = 0; i < this._verticesPerNode; i++) {
      this._tempHeadVertexArray.push(new Vector3(0, 0, 0));
    }
  }

  /**
   * @override
   */
  protected _render(context: any): void {
    const { mesh } = this;

    const subMeshes = mesh.subMeshes;
    const renderPipeline = context.camera._renderPipeline;
    const meshRenderDataPool = this._engine._meshRenderDataPool;

    for (let i = 0, n = subMeshes.length; i < n; i++) {
      const material = this.getMaterial();
      if (!material) continue;
      const renderData = meshRenderDataPool.getFromPool();
        renderData.set(this, material, mesh, subMeshes[i]);
        renderPipeline.pushRenderData(context, renderData);
    }
  }

  /**
   * @override
   * @internal
   */
  update(deltaTime: number): void {
    this._updateBuffer();
  }

  private _updateBuffer(): void {
    let nextIndex = this._currentEnd + 1 >= this._maxLength ? 0 : this._currentEnd + 1;

    if (this._currentLength < this._maxLength) {
      this._currentLength++;
    }
    this._currentEnd++;
    if (this._currentEnd >= this._maxLength) {
      this._currentEnd = 0;
    }

    this._tempEntityMatrix.copyFrom(this.entity.transform.worldMatrix);
    this._updateSingleBuffer(nextIndex, this._tempEntityMatrix);
    this._updateNodeIndex(this._currentEnd, this._currentNodeIndex);
    this._currentNodeIndex++;

    this._updateTrailUniform();
  }

  private _updateSingleBuffer(nodeIndex: number, transformMatrix: Matrix) {

    this._tempCenterVertex.set(0, 0, 0);
    this._tempCenterVertex.transformToVec3(transformMatrix);
    this._updateNodeCenter(nodeIndex, this._tempCenterVertex);

    for (let i = 0; i < this._headVertexArray.length; i++) {
      let vertex = this._tempHeadVertexArray[i];
      vertex.copyFrom(this._headVertexArray[i]);
    }
    for (let i = 0; i < this._headVertexArray.length; i++) {
      let vertex = this._tempHeadVertexArray[i];
      vertex.transformToVec3(transformMatrix);
    }
    for (let i = 0; i < this._headVertexArray.length; i++) {
      let positionIndex = ((this._verticesPerNode * nodeIndex) + i) * 3;
      let transformedHeadVertex = this._tempHeadVertexArray[i];

      this._positions[positionIndex] = transformedHeadVertex.x;
      this._positions[positionIndex + 1] = transformedHeadVertex.y;
      this._positions[positionIndex + 2] = transformedHeadVertex.z;
    }
    const finalVertexCount = this._currentLength * this._verticesPerNode * 3;
    let finalMeshStart = -1;
    if (finalVertexCount == this._positions.length - this._verticesPerNode * 3) {
      this._appendLastNodeForSubmesh();

      finalMeshStart = (this._verticesPerNode * (nodeIndex + 1));
      this.mesh.subMeshes[0].start = finalMeshStart;
      this.mesh.subMeshes[0].count = (this._currentLength + 1) * 2 - finalMeshStart;
      this.mesh.subMeshes[1].start = 0;
      this.mesh.subMeshes[1].count = finalMeshStart;
    } else {
      if (this.mesh.subMesh) {
        this.mesh.subMesh.start = 0;
        this.mesh.subMesh.count = this._currentLength * 2;
      }
    }
    this._vertexBuffer.setData(this._positions);
  }

  private _updateNodeIndex(nodeIndex: number, id: number) {
    for (let i = 0; i < this._verticesPerNode; i++) {
      let baseIndex = nodeIndex * this._verticesPerNode + i;
      this._nodeIDs[baseIndex] = id;
      this._vertexNodeIDs[baseIndex] = i;
      this._trailBirthTimes[baseIndex] = performance.now() / 1000;;
    }
    let lastIndex = this._currentLength * this._verticesPerNode;
    for (let i = 0; i < this._verticesPerNode * 2; i++) {
      this._nodeIDs[lastIndex + i] = this._nodeIDs[i];
      this._vertexNodeIDs[lastIndex + i] = this._vertexNodeIDs[i];
      this._trailBirthTimes[lastIndex + i] = this._trailBirthTimes[i];
    }
    this._nodeIDsBuffer.setData(this._nodeIDs);
    this._vertexNodeIDsBuffer.setData(this._vertexNodeIDs);
    this._trailBirthTimesBuffer.setData(this._trailBirthTimes);
  }

  private _updateNodeCenter(nodeIndex: number, nodeCenter: Vector3) {
    for ( var i = 0; i < this._verticesPerNode; i ++ ) {
      let baseIndex = ((this._verticesPerNode * nodeIndex) + i) * 3;
      this._nodeCenters[baseIndex] = nodeCenter.x;
      this._nodeCenters[baseIndex + 1] = nodeCenter.y;
      this._nodeCenters[baseIndex + 2] = nodeCenter.z;
    }
    let lastIndex = this._currentLength * this._verticesPerNode * 3;
    for (let i = 0; i < 2 * this._verticesPerNode * 3; i++) {
      this._nodeCenters[lastIndex + i] = this._nodeCenters[i];
    }
    this._nodeCentersBuffer.setData(this._nodeCenters);
  }

  private _updateTrailUniform() {
    this.getMaterial().shaderData.setFloat("u_currentTime", performance.now() / 1000);
  }

  private _appendLastNodeForSubmesh() {
    if (this.mesh.subMeshes.length != 2) {
      this.mesh.clearSubMesh();
      this.mesh.addSubMesh(0, 0, MeshTopology.TriangleStrip);
      this.mesh.addSubMesh(0, 0, MeshTopology.TriangleStrip);
    }
    // Split TriangleStrip into two subMeshes;
    // Copy the head node of the second submesh to the end of the first submesh;
    // Avoid gap in the trail.
    let lastIndex = this._currentLength * this._verticesPerNode * 3;
    for (let i = 0; i < 2 * this._verticesPerNode * 3; i++) {
      this._positions[lastIndex + i] = this._positions[i];
    }
  }
}
