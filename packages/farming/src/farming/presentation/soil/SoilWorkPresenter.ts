import type { SurfaceTriangle } from "@galacean/engine-terrain/geometry/SurfaceTriangles";
import { restoreResource } from "@galacean/engine-modify/rendering/RestorableResources";
import {
  BoundingBox,
  Color,
  Entity,
  Matrix,
  MeshTopology,
  ModelMesh,
  Texture2D,
  TextureFormat,
  TextureFilterMode,
  TextureWrapMode,
  Vector2,
  Vector3
} from "@galacean/engine";
import type { SoilPreparation } from "../../domain/SoilCultivation";
import { FarmingPropAnimationPlayer } from "../props/FarmingPropAnimationPlayer";
import { SoilVisualProvider, SOIL_MESH_SEGMENTS, type SoilVisualTarget } from "./SoilVisualProvider";
import { SoilWorkField, type SoilWorkKind, type SoilWorkSample } from "./SoilWorkField";
import { SoilBatchPlot } from "./SoilRenderBatches";
import { disposeSoilMesh } from "./disposeSoilMesh";

/** Static cultivated surface; terrain edits and neighbour changes are the only mesh updates. */
export class SoilWorkPresenter {
  readonly field = new SoilWorkField();
  private readonly mesh?: ModelMesh;
  private readonly originalMesh?: ModelMesh;
  private positions: Vector3[] = [];
  private normals: Vector3[] = [];
  private colors: Color[] = [];
  private samples: SoilWorkSample[] = [];
  private uploads = 0;
  private coverageTexture?: Texture2D;
  private coveragePixels = new Uint8Array(65 * 65 * 2);
  private geometryReady = false;
  private restoreMesh?: () => void;

  constructor(
    private readonly renderer: SoilVisualTarget,
    private readonly provider: SoilVisualProvider,
    private moisture = 0.25,
    private readonly surface?: {
      readonly triangles?: () => readonly SurfaceTriangle[];
      readonly footprint?: { readonly size: number; readonly square: boolean };
      readonly coverage?: (x: number, z: number) => number;
      readonly previewCoverage?: (x: number, z: number) => number;
      readonly projectHeight: (x: number, z: number) => number;
    }
  ) {
    if (renderer instanceof SoilBatchPlot) {
      this.refreshSurface();
      this.setPreparation("raw");
      return;
    }
    this.originalMesh = renderer.mesh as ModelMesh;
    this.mesh = surface?.triangles
      ? new ModelMesh(renderer.engine, "Host-clipped farming soil")
      : provider.createEditableMesh(surface?.footprint);
    renderer.mesh = this.mesh;
    this.positions = this.mesh!.getPositions() ?? [];
    this.normals = this.mesh!.getNormals() ?? [];
    this.colors = this.mesh!.getColors() ?? [];
    this.refreshSurface();
    if (surface?.triangles) restoreResource(this.mesh, () => this.restoreMesh?.());
    this.setPreparation("raw");
  }

  prepare(player: FarmingPropAnimationPlayer, kind: SoilWorkKind, contactFrame?: Entity): void {
    this.sampleContacts(player, kind, contactFrame);
    this.field.begin(kind);
  }

  sampleContacts(
    player: FarmingPropAnimationPlayer,
    kind: SoilWorkKind,
    contactFrame?: Entity
  ): readonly SoilWorkSample[] {
    this.samples = [];
    const marker = player.entity?.findByName(kind === "hoe" ? "HoeContact" : "RakeContact");
    if (!marker) throw new Error(`${kind} 缺少触地节点`);
    const inverse = new Matrix();
    Matrix.invert(this.renderer.entity.transform.worldMatrix, inverse);
    const contactInverse = new Matrix();
    if (contactFrame) Matrix.invert(contactFrame.transform.worldMatrix, contactInverse);
    const contactPoint = new Vector3();
    const local = new Vector3(),
      right = new Vector3();
    for (let frame = 0; frame <= Math.round(player.duration * 60); frame++) {
      const time = frame / 60;
      player.seek(time);
      // Both clips were authored against ground y=0; ignore the raised/recovery phases.
      Vector3.transformCoordinate(
        marker.transform.worldPosition,
        contactFrame ? contactInverse : new Matrix(),
        contactPoint
      );
      Vector3.transformCoordinate(marker.transform.worldPosition, inverse, local);
      // The farm projects this surface onto live terrain; the standalone preview uses its authored plane.
      const surfaceY = this.surface?.projectHeight(local.x, local.z);
      if (surfaceY === undefined ? contactPoint.y > 0.008 : local.y > surfaceY + 0.008) continue;
      Vector3.transformNormal(new Vector3(1, 0, 0), marker.transform.worldMatrix, right);
      Vector3.transformNormal(right, inverse, right);
      const length = Math.hypot(right.x, right.z);
      if (length < 0.001) continue;
      this.samples.push({
        time,
        x: local.x,
        z: local.z,
        rightX: right.x / length,
        rightZ: right.z / length,
        width: kind === "hoe" ? 0.285 : 0.49
      });
    }
    if (!this.samples.length) throw new Error(`${kind} 动画没有有效触地轨迹`);
    player.seek(0);
    return this.samples;
  }

  get contactSamples(): readonly SoilWorkSample[] {
    return this.samples;
  }

  setPreparation(preparation: SoilPreparation): void {
    this.field.setPreparation(preparation);
    this.applyReveal(preparation === "leveled" ? 1 : 0);
  }
  /** Presentation-only preview on the same clock as the tool; domain state commits separately. */
  seek(time: number): number {
    const state = this.field.summary();
    if (state.preparation !== "raw" || state.target !== "leveled" || !this.samples.length)
      return state.preparation === "leveled" ? 1 : 0;
    const first = this.samples[0].time;
    const last = this.samples[this.samples.length - 1].time;
    const progress = Math.max(0, Math.min(1, (time - first) / Math.max(1 / 60, last - first)));
    const reveal = progress * progress * (3 - 2 * progress);
    this.applyReveal(reveal);
    return reveal;
  }
  setBoundaryProgress(progress: number): void {
    this.provider.setBoundaryProgress(this.renderer, progress);
  }
  private applyReveal(progress: number): void {
    this.provider.setCultivationProgress(this.renderer, progress);
    this.renderer.enabled = progress > 0;
  }
  get firstContactTime(): number {
    return this.samples[0]?.time ?? 0;
  }
  cancel(): void {
    this.field.cancel();
    this.applyReveal(this.field.summary().preparation === "leveled" ? 1 : 0);
  }
  finish(): void {
    this.field.finish();
    this.applyReveal(this.field.summary().preparation === "leveled" ? 1 : 0);
  }
  setMoisture(moisture: number): void {
    if (!Number.isFinite(moisture)) return;
    this.moisture = Math.max(0, Math.min(1, moisture));
    this.provider.setMoisture(this.renderer, this.moisture);
  }
  summary() {
    return {
      ...this.field.summary(),
      moisture: this.moisture,
      appearance: this.provider.getAppearance(this.renderer),
      samples: this.samples.length,
      uploads: this.uploads
    };
  }
  dispose(): void {
    if (this.renderer instanceof SoilBatchPlot) {
      this.provider.release(this.renderer);
      this.renderer.dispose();
      return;
    }
    if (!this.mesh || this.mesh!.destroyed) return;
    this.provider.setCoverageTexture(this.renderer, null);
    this.coverageTexture?.destroy(true);
    if (!this.renderer.destroyed) this.renderer.mesh = this.originalMesh!;
    disposeSoilMesh(this.mesh);
    this.provider.release(this.renderer);
  }
  heightAt(x: number, z: number): number {
    return this.surface?.projectHeight(x, z) ?? 0;
  }

  private refreshCoverage(): void {
    const size = this.surface!.footprint!.size;
    let changed = this.renderer instanceof SoilBatchPlot ? !this.renderer.coverage : !this.coverageTexture;
    for (let z = 0; z < 65; z++)
      for (let x = 0; x < 65; x++) {
        const i = (z * 65 + x) * 2,
          px = (x / 64 - 0.5) * size,
          pz = (z / 64 - 0.5) * size,
          value = Math.round(255 * (this.surface!.coverage?.(px, pz) ?? 1)),
          preview = Math.round(255 * (this.surface!.previewCoverage?.(px, pz) ?? value / 255));
        changed ||= this.coveragePixels[i] !== value || this.coveragePixels[i + 1] !== preview;
        this.coveragePixels[i] = value;
        this.coveragePixels[i + 1] = preview;
      }
    if (!changed) return;
    if (this.renderer instanceof SoilBatchPlot) {
      this.renderer.setCoverage(this.coveragePixels);
      this.uploads++;
      return;
    }
    if (!this.coverageTexture) {
      this.coverageTexture = new Texture2D(this.renderer.engine, 65, 65, TextureFormat.R8G8, false, false);
      this.coverageTexture.filterMode = TextureFilterMode.Bilinear;
      this.coverageTexture.wrapModeU = this.coverageTexture.wrapModeV = TextureWrapMode.Clamp;
      restoreResource(this.coverageTexture, () => this.coverageTexture!.setPixelBuffer(this.coveragePixels));
      this.provider.setCoverageTexture(this.renderer, this.coverageTexture);
    }
    this.coverageTexture.setPixelBuffer(this.coveragePixels);
    this.uploads++;
  }

  refreshSurface(groundChanged = false): void {
    if (this.surface?.triangles) {
      if (!this.geometryReady || groundChanged) {
        const triangles = this.surface.triangles();
        if (!triangles.length) throw new Error("Host did not provide soil surface geometry");
        if (this.renderer instanceof SoilBatchPlot) {
          this.renderer.setSurface(triangles, this.surface.footprint!.size);
          this.geometryReady = true;
        } else {
          this.positions = [];
          this.normals = [];
          this.colors = [];
          const uvs: Vector2[] = [],
            indices: number[] = [];
          const size = this.surface.footprint!.size;
          for (const [a, b, c] of triangles) {
            const ab = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]),
              ac = new Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
            const normal = new Vector3();
            Vector3.cross(ab, ac, normal);
            normal.normalize();
            for (const p of [a, b, c]) {
              indices.push(this.positions.length);
              this.positions.push(new Vector3(...p));
              this.normals.push(normal.clone());
              this.colors.push(new Color(1, 1, 1, 1));
              uvs.push(new Vector2(p[0] / size + 0.5, p[2] / size + 0.5));
            }
          }
          this.mesh!.setPositions(this.positions);
          this.mesh!.setNormals(this.normals);
          this.mesh!.setColors(this.colors);
          this.mesh!.setUVs(uvs);
          const indexData = this.positions.length > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
          this.mesh!.setIndices(indexData);
          this.mesh!.clearSubMesh();
          this.mesh!.addSubMesh(0, indices.length, MeshTopology.Triangles);
          this.mesh!.calculateTangents();
          BoundingBox.fromPoints(this.positions, this.mesh!.bounds);
          this.mesh!.uploadData(false);
          const tangents = this.mesh!.getTangents()!;
          this.restoreMesh = () => {
            this.mesh!.setPositions(this.positions);
            this.mesh!.setNormals(this.normals);
            this.mesh!.setColors(this.colors);
            this.mesh!.setUVs(uvs);
            this.mesh!.setTangents(tangents);
            this.mesh!.setIndices(indexData);
            this.mesh!.uploadData(false);
          };
          this.uploads++;
          this.geometryReady = true;
        }
      }
      this.refreshCoverage();
      return;
    }
    const stride = SOIL_MESH_SEGMENTS + 1;
    for (let i = 0; i < this.positions.length; i++) {
      const p = this.positions[i];
      p.y = this.heightAt(p.x, p.z);
      this.colors[i].set(1, 1, 1, this.surface?.coverage?.(p.x, p.z) ?? 1);
    }
    for (let i = 0; i < this.positions.length; i++) {
      const row = Math.floor(i / stride),
        col = i % stride;
      const l = col ? i - 1 : i,
        r = col < stride - 1 ? i + 1 : i;
      const b = row ? i - stride : i,
        f = row < stride - 1 ? i + stride : i;
      const dx =
        (this.positions[r].y - this.positions[l].y) / Math.max(0.001, this.positions[r].x - this.positions[l].x);
      const dz =
        (this.positions[f].y - this.positions[b].y) / Math.max(0.001, this.positions[f].z - this.positions[b].z);
      this.normals[i].set(-dx, 1, -dz).normalize();
    }
    this.mesh!.setPositions(this.positions);
    this.mesh!.setNormals(this.normals);
    this.mesh!.setColors(this.colors);
    this.mesh!.calculateTangents();
    BoundingBox.fromPoints(this.positions, this.mesh!.bounds);
    this.mesh!.uploadData(false);
    this.uploads++;
  }
}
