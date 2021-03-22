import { Color, Vector2, Vector3 } from "@oasis-engine/math";
import { Camera } from "../Camera";
import { Engine } from "../Engine";
import { Buffer } from "../graphic/Buffer";
import { BufferBindFlag } from "../graphic/enums/BufferBindFlag";
import { BufferUsage } from "../graphic/enums/BufferUsage";
import { IndexFormat } from "../graphic/enums/IndexFormat";
import { VertexElementFormat } from "../graphic/enums/VertexElementFormat";
import { VertexElement } from "../graphic/VertexElement";
import { Material } from "../material";
import { BufferMesh } from "../mesh/BufferMesh";
import { Renderer } from "../Renderer";
import { Shader } from "../shader";
import { ShaderData } from "../shader/ShaderData";

class Batch {
  vertices: Vector3[];
  uv: Vector2[];
  triangles: number[];
  color: Color;

  constructor(vertices: Vector3[], uv: Vector2[], triangles: number[], color: Color) {
    this.vertices = vertices;
    this.uv = uv;
    this.triangles = triangles;
    this.color = color;
  }
}

export class SpriteBatcher {
  /** The maximum number of vertex. */
  private static MAX_VERTEX_COUNT: number = 4096;

  private _cameras: Camera[] = [];
  private _batchedQueue: Batch[] = [];
  private _materials: Material[] = [];
  private _shaderDatas: ShaderData[] = [];
  private _meshs: BufferMesh[] = [];
  private _meshCount: number = 2;
  /** Vertices buff in GPU. */
  private _vertexBuffers: Buffer[] = [];
  /** Indices buff in GPU. */
  private _indiceBuffers: Buffer[] = [];
  /** Vertices buff in CPU. */
  private _vertices: Float32Array;
  /** Indices buff in CPU. */
  private _indices: Uint16Array;
  /** Current vertex count. */
  private _vertexCount: number = 0;
  private _spriteSize: number = 0;
  private _flushId: number = 0;
  private _canUploadSameBuffer: boolean = false;

  constructor(engine: Engine) {
    const { MAX_VERTEX_COUNT } = SpriteBatcher;
    this._vertices = new Float32Array(MAX_VERTEX_COUNT * 9);
    this._indices = new Uint16Array(MAX_VERTEX_COUNT);

    this._initMeshs(engine);

    const ua = window.navigator.userAgent.toLocaleLowerCase();
    this._canUploadSameBuffer = !/iphone|ipad|ipod/.test(ua);
  }

  _initMeshs(engine: Engine) {
    const { _meshs, _meshCount } = this;
    for (let i = 0; i < _meshCount; i++) {
      _meshs[i] = this._createMesh(engine, i);
    }
  }

  _createMesh(engine: Engine, index: number): BufferMesh {
    const { MAX_VERTEX_COUNT } = SpriteBatcher;
    const mesh = new BufferMesh(engine, `SpriteBatchBufferMesh${index}`);

    const vertexElements = [
      new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0),
      new VertexElement("TEXCOORD_0", 12, VertexElementFormat.Vector2, 0),
      new VertexElement("COLOR_0", 20, VertexElementFormat.Vector4, 0)
    ];
    const vertexStride = 36;

    // vertices
    this._vertexBuffers[index] = new Buffer(
      engine,
      BufferBindFlag.VertexBuffer,
      MAX_VERTEX_COUNT * 4 * vertexStride,
      BufferUsage.Dynamic
    );
    // indices
    this._indiceBuffers[index] = new Buffer(engine, BufferBindFlag.IndexBuffer, MAX_VERTEX_COUNT, BufferUsage.Dynamic);
    mesh.setVertexBufferBinding(this._vertexBuffers[index], vertexStride);
    mesh.setIndexBufferBinding(this._indiceBuffers[index], IndexFormat.UInt16);
    mesh.setVertexElements(vertexElements);

    return mesh;
  }

  /**
   * Flush all sprites.
   */
  flush(engine: Engine) {
    const { _batchedQueue } = this;

    if (_batchedQueue.length === 0) {
      return;
    }

    this.updateData(engine);
    this.drawBatches(engine);

    if (!this._canUploadSameBuffer) {
      this._flushId++;
    }

    this._cameras.length = 0;
    this._batchedQueue.length = 0;
    this._vertexCount = 0;
    this._spriteSize = 0;
  }

  updateData(engine: Engine) {
    const { _meshs, _flushId } = this;

    if (!this._canUploadSameBuffer && this._meshCount <= _flushId) {
      this._meshCount++;
      _meshs[_flushId] = this._createMesh(engine, _flushId);
    }

    const { _batchedQueue, _vertices, _indices, _cameras, _materials, _shaderDatas } = this;
    const mesh = _meshs[_flushId];

    let vertexIndex = 0;
    let indiceIndex = 0;
    let vertexStartIndex = 0;
    let vertexCount = 0;
    let curIndiceStartIndex = 0;
    let curMeshIndex = 0;
    let preCamera: Camera = null;
    let preMaterial: Material = null;
    let preShaderData: ShaderData = null;
    for (let i = 0, len = _batchedQueue.length; i < len; i++) {
      const { vertices, uv, triangles, color } = _batchedQueue[i];

      // Batch vertex
      const verticesNum = vertices.length;
      for (let j = 0; j < verticesNum; j++) {
        const curVertex = vertices[j];
        const curUV = uv[j];

        _vertices[vertexIndex++] = curVertex.x;
        _vertices[vertexIndex++] = curVertex.y;
        _vertices[vertexIndex++] = curVertex.z;
        _vertices[vertexIndex++] = curUV.x;
        _vertices[vertexIndex++] = curUV.y;
        _vertices[vertexIndex++] = color.r;
        _vertices[vertexIndex++] = color.g;
        _vertices[vertexIndex++] = color.b;
        _vertices[vertexIndex++] = color.a;
      }

      // Batch indice
      const triangleNum = triangles.length;
      for (let j = 0; j < triangleNum; j++) {
        _indices[indiceIndex++] = triangles[j] + curIndiceStartIndex;
      }

      curIndiceStartIndex += verticesNum;

      const curCamera = _cameras[i];
      const curMaterial = _materials[i];
      const curShaderData = _shaderDatas[i];

      if (preCamera === null) {
        vertexCount += triangleNum;
      } else {
        if (this.canBatch(preCamera, curCamera, preMaterial, curMaterial, preShaderData, curShaderData)) {
          vertexCount += triangleNum;
        } else {
          mesh.addSubMesh(vertexStartIndex, vertexCount);
          vertexStartIndex += vertexCount;
          _cameras[curMeshIndex] = preCamera;
          _materials[curMeshIndex] = preMaterial;
          _shaderDatas[curMeshIndex++] = preShaderData;
        }
      }

      preCamera = curCamera;
      preMaterial = curMaterial;
      preShaderData = curShaderData;
    }

    mesh.addSubMesh(vertexStartIndex, vertexCount);
    _cameras[curMeshIndex] = preCamera;
    _materials[curMeshIndex] = preMaterial;
    _shaderDatas[curMeshIndex] = preShaderData;

    this._vertexBuffers[_flushId].setData(_vertices, 0, 0, vertexIndex);
    this._indiceBuffers[_flushId].setData(_indices, 0, 0, indiceIndex);
  }

  drawBatches(engine: Engine) {
    const mesh = this._meshs[this._flushId];
    const subMeshs = mesh.subMeshes;

    const { _cameras, _materials, _shaderDatas } = this;

    for (let i = 0, len = subMeshs.length; i < len; i++) {
      const subMesh = subMeshs[i];
      if (!subMesh) {
        return;
      }

      //@ts-ignore
      const compileMacros = Shader._compileMacros;
      compileMacros.clear();

      //@ts-ignore
      const material = _materials[i];
      const program = material.shader._getShaderProgram(engine, compileMacros);
      if (!program.isValid) {
        return;
      }

      // Uniform.
      program.groupingOtherUniformBlock();
      const camera = _cameras[i];
      program.uploadAll(program.sceneUniformBlock, camera.scene.shaderData);
      program.uploadAll(program.cameraUniformBlock, camera.shaderData);
      program.uploadAll(program.rendererUniformBlock, _shaderDatas[i]);
      program.uploadAll(program.materialUniformBlock, material.shaderData);

      //@ts-ignore
      material.renderState._apply(engine);

      // Draw the batched sprite.
      engine._hardwareRenderer.drawPrimitive(mesh, subMesh, program);
    }
  }

  /**
   * Check whether a sprite can be drawn in combination with the previous sprite when drawing.
   * @param preCamera - The camera of the pre sprite
   * @param curCamera - The camera of the cur sprite
   * @param preMaterial - The material of the pre sprite
   * @param curMaterial - The material of the cur sprite
   * @param preShaderData - The shader data of the pre sprite
   * @param curShaderData - The shader data of the cur sprite
   */
  canBatch(
    preCamera: Camera,
    curCamera: Camera,
    preMaterial: Material,
    curMaterial: Material,
    preShaderData: ShaderData,
    curShaderData: ShaderData
  ): boolean {
    // Currently only compare texture
    const preTexture = preShaderData.getTexture("u_texture");
    const curTexture = curShaderData.getTexture("u_texture");
    if (preTexture !== curTexture) {
      return false;
    }

    return preMaterial === curMaterial && preCamera === curCamera;
  }

  /**
   * Add a sprite drawing information to the render queue.
   * @param renderer - The sprite renderer to draw
   * @param material - The material used to render the sprite
   * @param vertices - The array containing sprite mesh vertex positions
   * @param uv - The base texture coordinates of the sprite mesh
   * @param triangles - The array containing sprite mesh triangles
   * @param color - Rendering color for the Sprite graphic
   * @param texture - The reference to the used texture
   * @param camera - Camera which is rendering
   */
  drawSprite(
    renderer: Renderer,
    vertices: Vector3[],
    uv: Vector2[],
    triangles: number[],
    color: Color,
    material: Material,
    camera: Camera
  ) {
    const len = vertices.length;
    if (this._vertexCount + len > SpriteBatcher.MAX_VERTEX_COUNT) {
      this.flush(camera.engine);
    }

    this._vertexCount += len;
    this._cameras[this._spriteSize] = camera;
    this._materials[this._spriteSize] = material;
    this._shaderDatas[this._spriteSize] = renderer.shaderData;
    this._batchedQueue[this._spriteSize++] = new Batch(vertices, uv, triangles, color);
  }

  clear() {
    this._flushId = 0;
    this._vertexCount = 0;
    this._spriteSize = 0;
    this._materials.length = 0;
    this._shaderDatas.length = 0;
    this._batchedQueue.length = 0;

    const { _meshs, _meshCount } = this;
    for (let i = 0; i < _meshCount; i++) {
      _meshs[i].clearSubMesh();
    }
  }

  /**
   * Release gl resource.
   */
  finalize() {}
}
