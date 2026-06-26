import { BoundingBox, Matrix, Vector2 } from "@galacean/engine-math";
import { Entity } from "../Entity";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { Renderer, RendererUpdateFlags } from "../Renderer";
import { Buffer } from "../graphic/Buffer";
import { BufferMesh } from "../mesh/BufferMesh";
import { VertexElement } from "../graphic/VertexElement";
import { BufferBindFlag } from "../graphic/enums/BufferBindFlag";
import { BufferUsage } from "../graphic/enums/BufferUsage";
import { IndexFormat } from "../graphic/enums/IndexFormat";
import { VertexElementFormat } from "../graphic/enums/VertexElementFormat";
import { ShaderProperty } from "../shader/ShaderProperty";
import { GaussianSplat } from "./GaussianSplat";
import { GaussianSplatMaterial } from "./GaussianSplatMaterial";
import { GaussianSplatSorter } from "./GaussianSplatSorter";
import { GaussianSplatSortWorker } from "./GaussianSplatSortWorker";

// Camera-facing quad covering the gaussian out to the ~2-sigma fragment cutoff.
const _quadCorners = new Float32Array([-2, -2, 2, -2, 2, 2, -2, 2]);
const _quadIndices = new Uint16Array([0, 1, 2, 0, 2, 3]);

const _centerTextureProp = ShaderProperty.getByName("material_CenterTexture");
const _covATextureProp = ShaderProperty.getByName("material_CovATexture");
const _covBTextureProp = ShaderProperty.getByName("material_CovBTexture");
const _colorTextureProp = ShaderProperty.getByName("material_ColorTexture");
const _dataTextureSizeProp = ShaderProperty.getByName("material_DataTextureSize");
const _invViewportProp = ShaderProperty.getByName("material_InvViewport");

/**
 * Renders a {@link GaussianSplat} as instanced, depth-sorted, alpha-blended quads. When the view changes the
 * splats are re-sorted back-to-front for the active camera — on a Web Worker when available, otherwise on the
 * main thread — and the resulting index order is uploaded to a dynamic per-instance buffer.
 */
export class GaussianSplatRenderer extends Renderer {
  private _splat: GaussianSplat = null;
  private _mesh: BufferMesh = null;
  private _instanceBuffer: Buffer = null;
  private _instanceData: Float32Array = null;
  private _sorter = new GaussianSplatSorter();
  private _sortWorker: GaussianSplatSortWorker = null;

  private _sortMatrix = new Matrix();
  private _lastSortMatrix = new Matrix();
  private _needsSort = false;
  private _invViewport = new Vector2();
  private _dataTextureSize = new Vector2();

  /** Wall-clock duration (ms) of the most recent CPU depth sort, for profiling. */
  lastSortTime = 0;

  /**
   * The gaussian splatting scene to render.
   */
  get splat(): GaussianSplat {
    return this._splat;
  }

  set splat(value: GaussianSplat) {
    const lastSplat = this._splat;
    if (lastSplat === value) {
      return;
    }
    lastSplat && this._addResourceReferCount(lastSplat, -1);
    this._splat = value;
    if (value) {
      this._addResourceReferCount(value, 1);
      this._buildMesh(value);
      this._bindSplat(value);
      this._sortWorker?.setPositions(value.positions);
      this._needsSort = true;
      this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume;
    }
  }

  constructor(entity: Entity) {
    super(entity);
    this.setMaterial(new GaussianSplatMaterial(this.engine));
    try {
      this._sortWorker = new GaussianSplatSortWorker((indices) => {
        // Drop a result that belongs to a previous scene (different splat count after a switch).
        if (this._splat && indices.length === this._splat.splatCount) {
          this._instanceData = indices;
          this._instanceBuffer?.setData(indices);
        }
      });
    } catch {
      this._sortWorker = null; // Workers unavailable: fall back to the main-thread sort.
    }
  }

  private _buildMesh(splat: GaussianSplat): void {
    const engine = this.engine;
    const count = splat.splatCount;

    this._mesh?.destroy();
    const mesh = (this._mesh = new BufferMesh(engine, "GaussianSplat"));

    const cornerBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, _quadCorners, BufferUsage.Static);
    const instanceData = (this._instanceData = new Float32Array(count));
    for (let i = 0; i < count; i++) instanceData[i] = i; // identity order until the first sort lands
    const instanceBuffer = (this._instanceBuffer = new Buffer(
      engine,
      BufferBindFlag.VertexBuffer,
      instanceData,
      BufferUsage.Dynamic
    ));
    const indexBuffer = new Buffer(engine, BufferBindFlag.IndexBuffer, _quadIndices, BufferUsage.Static);

    mesh.setVertexBufferBinding(cornerBuffer, 8, 0);
    mesh.setVertexBufferBinding(instanceBuffer, 4, 1);
    mesh.setIndexBufferBinding(indexBuffer, IndexFormat.UInt16);
    mesh.setVertexElements([
      new VertexElement("CORNER", 0, VertexElementFormat.Vector2, 0, 0),
      new VertexElement("SPLAT_INDEX", 0, VertexElementFormat.Float, 1, 1)
    ]);
    mesh.addSubMesh(0, _quadIndices.length);
    mesh.instanceCount = count;
  }

  private _bindSplat(splat: GaussianSplat): void {
    const shaderData = this.getMaterial().shaderData;
    shaderData.setTexture(_centerTextureProp, splat.centerTexture);
    shaderData.setTexture(_covATextureProp, splat.covATexture);
    shaderData.setTexture(_covBTextureProp, splat.covBTexture);
    shaderData.setTexture(_colorTextureProp, splat.colorTexture);
    this._dataTextureSize.set(splat.textureWidth, splat.textureHeight);
    shaderData.setVector2(_dataTextureSizeProp, this._dataTextureSize);
  }

  protected override _updateBounds(worldBounds: BoundingBox): void {
    if (this._splat) {
      BoundingBox.transform(this._splat.bounds, this._transformEntity.transform.worldMatrix, worldBounds);
    } else {
      const { worldPosition } = this._transformEntity.transform;
      worldBounds.min.copyFrom(worldPosition);
      worldBounds.max.copyFrom(worldPosition);
    }
  }

  protected override _render(context: RenderContext): void {
    const splat = this._splat;
    const mesh = this._mesh;
    if (!splat || !mesh) {
      return;
    }

    const camera = context.camera;
    const count = splat.splatCount;

    // Re-sort only when the view relative to the splats actually changed; a static view reuses the last order.
    Matrix.multiply(camera.viewMatrix, this._transformEntity.transform.worldMatrix, this._sortMatrix);
    const cur = this._sortMatrix.elements;
    const last = this._lastSortMatrix.elements;
    let delta = 0;
    for (let i = 0; i < 16; i++) delta += Math.abs(cur[i] - last[i]);
    if (this._needsSort || delta > 1e-4) {
      if (this._sortWorker) {
        // Off-thread sort: dispatch only when the worker is idle and the index buffer is on our side.
        if (!this._sortWorker.busy && this._instanceData) {
          this._sortWorker.requestSort(-cur[2], -cur[6], -cur[10], -cur[14], count, this._instanceData);
          this._instanceData = null; // transferred to the worker until it posts back
          this._lastSortMatrix.copyFrom(this._sortMatrix);
          this._needsSort = false;
        }
        this.lastSortTime = 0;
      } else {
        const t0 = performance.now();
        this._sorter.sort(splat.positions, count, cur, this._instanceData);
        this._instanceBuffer.setData(this._instanceData);
        this.lastSortTime = performance.now() - t0;
        this._lastSortMatrix.copyFrom(this._sortMatrix);
        this._needsSort = false;
      }
    } else {
      this.lastSortTime = 0;
    }

    // Inverse viewport drives the covariance-to-screen projection; the shader derives focal from the
    // projection matrix itself so its Y sign stays consistent with the framebuffer's flipped projection.
    const viewport = camera.pixelViewport;
    const material = this.getMaterial();
    const shaderData = material.shaderData;
    this._invViewport.set(1 / viewport.width, 1 / viewport.height);
    shaderData.setVector2(_invViewportProp, this._invViewport);

    const engine = this._engine;
    const renderElement = engine._renderElementPool.get();
    renderElement.set(this, material, mesh._primitive, mesh.subMeshes[0]);
    renderElement.priority = this.priority;
    renderElement.distanceForSort = this._distanceForSort;
    context.camera._renderPipeline.pushRenderElement(context, renderElement);
  }

  protected override _onDestroy(): void {
    const splat = this._splat;
    splat && this._addResourceReferCount(splat, -1);
    this._splat = null;
    this._mesh?.destroy();
    this._mesh = null;
    this._sortWorker?.destroy();
    this._sortWorker = null;
    super._onDestroy();
  }
}
