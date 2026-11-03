import {
  BoundingBox,
  Color,
  Entity,
  MeshRenderer,
  ModelMesh,
  RenderFace,
  Texture2D,
  TextureFilterMode,
  TextureWrapMode,
  UnlitMaterial,
  Vector2,
  Vector3,
  type Camera
} from "@galacean/engine";
import {
  clipSurfaceTriangles,
  type SurfaceRectangle,
  type SurfaceTriangle
} from "@galacean/engine-terrain/geometry/SurfaceTriangles";
import { destroyOwnedMesh } from "@galacean/engine-terrain/geometry/destroyOwnedMesh";
import { restoreResource } from "@galacean/engine-modify/rendering/RestorableResources";
import { drawFarmSelectionTexture, selectionNeedsOutline, type FarmSelectionAction } from "./FarmingSelectionTexture";

import { FarmingTargetHint } from "./FarmingTargetHint";

interface SelectionSurface {
  readonly groundId: string;
  readonly revision: number;
  readonly action: FarmSelectionAction;
  triangles(bounds: SurfaceRectangle): readonly SurfaceTriangle[];
}

/** Preserve the host terrain's diagonals and the exact logical cell boundary. */
export function selectionTriangles(x: number, z: number, size: number, source: SelectionSurface["triangles"]) {
  const half = size / 2;
  const bounds = { minimumX: x - half, maximumX: x + half, minimumZ: z - half, maximumZ: z + half };
  return clipSurfaceTriangles(source(bounds), bounds);
}

/** A screen-facing target cue and an optional thin, terrain-conforming confirmation outline. */
export class FarmingPlotSelection {
  readonly root: Entity;
  private readonly renderer: MeshRenderer;
  private readonly material: UnlitMaterial;
  private readonly texture: Texture2D;
  private readonly canvas = document.createElement("canvas");
  private mesh?: ModelMesh;
  private geometryKey = "";
  private pending?: { x: number; y: number; z: number; key: string; surface: SelectionSurface };
  private action: FarmSelectionAction = null;
  private targetKey = "";
  private steadySeconds = 0;
  private readonly lastView = new Float64Array(6).fill(NaN);
  private progress: number | null = null;
  private readonly hint?: FarmingTargetHint;
  private opacity = 0;
  private disposed = false;

  constructor(
    parent: Entity,
    private readonly cellSize: number,
    private readonly camera?: Camera,
    occluded?: (point: Vector3) => boolean
  ) {
    this.root = parent.createChild("selected-plot-surface");
    this.root.isActive = false;
    this.renderer = this.root.addComponent(MeshRenderer);
    this.renderer.castShadows = this.renderer.receiveShadows = false;
    this.material = new UnlitMaterial(parent.engine);
    this.material.name = "Farming confirmation outline";
    this.material.isTransparent = true;
    this.material.renderFace = RenderFace.Double;
    this.material.baseColor = new Color(1, 1, 1, 0);
    this.renderer.setMaterial(this.material);
    this.canvas.width = this.canvas.height = 256;
    this.texture = new Texture2D(parent.engine, 256, 256, undefined, false);
    this.texture.filterMode = TextureFilterMode.Bilinear;
    this.texture.wrapModeU = this.texture.wrapModeV = TextureWrapMode.Clamp;
    drawFarmSelectionTexture(this.canvas);
    this.texture.setImageSource(this.canvas);
    this.material.baseTexture = this.texture;
    this.hint = camera && FarmingTargetHint.create(camera, occluded);
    restoreResource(this.texture, () => this.texture.setImageSource(this.canvas));
  }

  show(x: number, z: number, heightAt: (x: number, z: number) => number | null, surface: SelectionSurface): void {
    if (this.disposed) return;
    if (!surface.action) {
      this.hide();
      return;
    }
    const y = heightAt(x, z);
    if (y === null || !Number.isFinite(y)) {
      this.hide();
      return;
    }
    const key = `${surface.groundId}:${surface.revision}:${x}:${y}:${z}`;
    const changed = key !== this.targetKey || surface.action !== this.action;
    if (!this.pending) this.pending = { x, y, z, key, surface };
    else {
      this.pending.x = x;
      this.pending.y = y;
      this.pending.z = z;
      this.pending.key = key;
      this.pending.surface = surface;
    }
    this.action = surface.action;
    this.targetKey = key;
    this.root.transform.setWorldPosition(x, y, z);
    this.hint?.show(x, y, z, surface.action);
    if (changed || !this.root.isActive) {
      this.opacity = this.material.baseColor.a = 0;
      this.steadySeconds = 0;
    }
    this.root.isActive = true;
    this.refreshOutline();
  }

  get outlineVisible(): boolean {
    return this.root.isActive && this.renderer.enabled;
  }

  setProgress(progress: number | null): void {
    if (this.disposed) return;
    this.progress = progress !== null && Number.isFinite(progress) && progress >= 0 && progress < 1 ? progress : null;
    this.hint?.setProgress(this.progress);
    if (this.root.isActive) this.refreshOutline();
  }

  update(seconds: number): void {
    if (this.disposed || !this.root.isActive) return;
    const dt = Math.max(0, seconds);
    if (this.camera) {
      const { worldPosition: p, worldForward: f } = this.camera.entity.transform;
      const values = [p.x, p.y, p.z, f.x, f.y, f.z];
      const moving = values.some(
        (v, i) => !Number.isFinite(this.lastView[i]) || Math.abs(v - this.lastView[i]) > 0.001
      );
      this.lastView.set(values);
      this.steadySeconds = moving ? 0 : this.steadySeconds + dt;
    } else this.steadySeconds += dt;
    const wasVisible = this.renderer.enabled;
    this.refreshOutline();
    // Hidden time is not fade time. The first visible frame starts transparent.
    this.opacity = this.renderer.enabled && wasVisible ? Math.min(1, this.opacity + dt / 0.12) : 0;
    this.material.baseColor.a = this.opacity;
    this.hint?.update();
  }

  private refreshOutline(): void {
    const visible = selectionNeedsOutline(this.action) && (this.progress !== null || this.steadySeconds >= 0.18);
    if (!visible) {
      this.renderer.enabled = false;
      this.opacity = this.material.baseColor.a = 0;
      return;
    }
    if (this.pending && this.pending.key !== this.geometryKey && !this.buildPendingMesh()) {
      this.hide();
      return;
    }
    this.renderer.enabled = true;
  }

  private buildPendingMesh(): boolean {
    const { x, y, z, key, surface } = this.pending!;
    const triangles = selectionTriangles(x, z, this.cellSize, (bounds) => surface.triangles(bounds));
    if (!triangles.length) return false;
    const positions: Vector3[] = [],
      uvs: Vector2[] = [];
    for (const triangle of triangles)
      for (const p of triangle) {
        positions.push(new Vector3(p[0] - x, p[1] - y + 0.004, p[2] - z));
        uvs.push(new Vector2((p[0] - x) / this.cellSize + 0.5, 0.5 - (p[2] - z) / this.cellSize));
      }
    const mesh = new ModelMesh(this.root.engine, "Selected terrain cell");
    BoundingBox.fromPoints(positions, mesh.bounds);
    const upload = () => {
      mesh.setPositions(positions);
      mesh.setUVs(uvs);
      mesh.uploadData(false);
    };
    upload();
    mesh.addSubMesh(0, positions.length);
    restoreResource(mesh, upload);
    this.renderer.mesh = mesh;
    destroyOwnedMesh(this.mesh);
    this.mesh = mesh;
    this.geometryKey = key;
    return true;
  }

  hide(): void {
    this.root.isActive = false;
    this.renderer.enabled = false;
    this.pending = undefined;
    this.opacity = this.material.baseColor.a = 0;
    this.steadySeconds = 0;
    this.progress = null;
    this.hint?.hide();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pending = undefined;
    this.hint?.dispose();
    this.root.destroy();
    this.material.destroy();
    this.texture.destroy(true);
    destroyOwnedMesh(this.mesh);
  }
}
