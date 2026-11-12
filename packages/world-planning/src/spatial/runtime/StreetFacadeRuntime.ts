import {
  Color,
  MeshRenderer,
  PBRMaterial,
  PointLight,
  PrimitiveMesh,
  RenderFace,
  Script,
  Vector3,
  type Entity,
  type Texture2D,
  type ModelMesh
} from "@galacean/engine";
import { BuildingManager } from "@galacean/engine-building/building/parts/architecture/BuildingManager";
import type { BuildingGroupComponent } from "@galacean/engine-building/building/parts/architecture/BuildingGroupComponent";
import type { HouseShared } from "@galacean/engine-building/building/partTypes/House";
import { profileShape } from "@galacean/engine-building/building/runtime/ProfileGeometry";
import { shapeCurve } from "@galacean/engine-building/building/runtime/RecoveredWallConnectionHoles";
import { profileWallEnvelope } from "@galacean/engine-building/building/runtime/ConstructionWallEnvelope";
import type { WorldTemplateArtDirection } from "../WorldTemplateArtDirection";

// Luminance-weighted centres of the six atlas cells, excluding their borders.
// UVs are tile-local, with rows in material order (bottom row first).
const SIGN_EMITTERS = [
  { u: 0.502, v: 0.497, cyan: false },
  { u: 0.498, v: 0.489, cyan: true },
  { u: 0.494, v: 0.489, cyan: false },
  { u: 0.501, v: 0.529, cyan: true },
  { u: 0.503, v: 0.526, cyan: false },
  { u: 0.487, v: 0.502, cyan: true }
] as const;

/** Attach to actual wall charts and inherit the native building transform. */
export class StreetFacadeRuntime {
  private readonly materials: PBRMaterial[] = [];
  private readonly mounts = new Map<BuildingGroupComponent, { shape: string; root: Entity }>();
  private readonly lights = new Set<PointLight>();
  private readonly root: Entity;
  private elapsed = 1;
  private readonly panel: ModelMesh;
  private readonly box: ModelMesh;

  constructor(
    parent: Entity,
    atlas: Texture2D,
    private readonly q: NonNullable<WorldTemplateArtDirection["streetSigns"]>,
    private readonly ground: (x: number, z: number) => number | undefined,
    private readonly road: readonly { x: number; z: number }[],
    private readonly viewer?: Entity
  ) {
    this.root = parent.createChild("Emissive wall signs");
    const engine = parent.engine;
    this.panel = PrimitiveMesh.createPlane(engine, 1, 1);
    this.box = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
    const frame = new PBRMaterial(engine);
    frame.baseColor = new Color(0.018, 0.025, 0.045, 1);
    frame.metallic = 0.7;
    frame.roughness = 0.4;
    this.materials.push(frame);
    for (let index = 0; index < SIGN_EMITTERS.length; index++) {
      const material = new PBRMaterial(engine);
      material.baseTexture = atlas;
      material.emissiveTexture = atlas;
      const strength = q.signIntensity;
      material.emissiveColor = SIGN_EMITTERS[index].cyan
        ? new Color(strength * 0.32, strength * 0.85, strength, 1)
        : new Color(strength, strength * 0.32, strength * 0.72, 1);
      material.roughness = 0.5;
      material.renderFace = RenderFace.Double;
      material.tilingOffset.set(1 / 3, 1 / 2, (index % 3) / 3, index < 3 ? 0.5 : 0);
      this.materials.push(material);
    }
    this.root.addComponent(FacadeRefresh).updateFacades = (dt) => this.update(dt);
  }

  private update(dt: number): void {
    this.elapsed += dt;
    if (this.elapsed < 0.5) return;
    this.elapsed = 0;
    const scene = this.root.scene;
    if (!scene) return;
    const manager = BuildingManager.existing(scene);
    const houses = new Map<BuildingGroupComponent, HouseShared>();
    for (const group of manager?.listGroups() ?? []) {
      const house = group.definition?.shared?.house as HouseShared | undefined;
      if (!house?.footprint || house.height < 4 || !group.frame) continue;
      houses.set(group, house);
    }
    for (const [group, mount] of this.mounts) {
      const house = houses.get(group);
      if (!house || JSON.stringify(house) !== mount.shape || group.destroyed) {
        mount.root.destroy();
        this.mounts.delete(group);
      }
    }
    for (const [group, parameters] of houses) {
      if (this.mounts.has(group) || this.q.signsPerBuilding <= 0) continue;
      const frame = group.frame!;
      const mountOffset = profileWallEnvelope(parameters.footprint, parameters.wallUnit).finishOuter + 0.1;
      const shape = profileShape(parameters.footprint);
      let points = shapeCurve(shape).points;
      // For a round wall take short tangent brackets at separated wall-chart
      // stations, rather than mistaking its tessellation edges for panel widths.
      if (shape.type === "circle") {
        const radius = shape.radius;
        points = Array.from({ length: 9 }, (_, i) => {
          const angle = (i * Math.PI) / 4;
          return [shape.center[0] + Math.cos(angle) * radius, shape.center[1] + Math.sin(angle) * radius];
        });
      }
      const segments = points
        .slice(1)
        .map((b, i) => {
          const a = points[i],
            length = Math.hypot(b[0] - a[0], b[1] - a[1]);
          let x = (a[0] + b[0]) / 2,
            z = (a[1] + b[1]) / 2;
          const centerX = x - shape.center[0],
            centerZ = z - shape.center[1];
          if (shape.type === "circle") {
            const radius = Math.hypot(centerX, centerZ);
            x = shape.center[0] + (centerX * shape.radius) / radius;
            z = shape.center[1] + (centerZ * shape.radius) / radius;
          }
          let nx = (b[1] - a[1]) / length,
            nz = -(b[0] - a[0]) / length;
          if (nx * centerX + nz * centerZ < 0) {
            nx = -nx;
            nz = -nz;
          }

          const world = new Vector3(),
            outer = new Vector3();
          Vector3.transformCoordinate(new Vector3(x, 0, z), frame.transform.worldMatrix, world);
          Vector3.transformCoordinate(new Vector3(x + nx, 0, z + nz), frame.transform.worldMatrix, outer);
          const normalX = outer.x - world.x,
            normalZ = outer.z - world.z;
          let roadDistance = Infinity,
            facing = 0;
          for (let j = 1; j < this.road.length; j++) {
            const from = this.road[j - 1],
              to = this.road[j],
              dx = to.x - from.x,
              dz = to.z - from.z;
            const t = Math.max(
              0,
              Math.min(1, ((world.x - from.x) * dx + (world.z - from.z) * dz) / (dx * dx + dz * dz || 1))
            );
            const towardX = from.x + t * dx - world.x,
              towardZ = from.z + t * dz - world.z;
            const distance = Math.hypot(towardX, towardZ);
            if (distance >= roadDistance) continue;
            roadDistance = distance;
            facing = (towardX * normalX + towardZ * normalZ) / Math.max(distance, 0.01);
          }
          const viewer = this.viewer?.transform.worldPosition;
          const approach = viewer
            ? ((viewer.x - world.x) * normalX + (viewer.z - world.z) * normalZ) /
              Math.max(1, Math.hypot(viewer.x - world.x, viewer.z - world.z))
            : 0;
          return { x, z, nx, nz, length, world, score: roadDistance - 10 * facing - 3 * approach };
        })
        .sort((a, b) => a.score - b.score || b.length - a.length);
      const root = frame.createChild("Mounted emissive signs");
      this.mounts.set(group, { shape: JSON.stringify(parameters), root });
      for (let rank = 0; rank < Math.min(this.q.signsPerBuilding, segments.length); rank++) {
        const { x, z, nx, nz, length, world } = segments[rank];
        if (length < 0.6) continue;
        const width = Math.min(shape.type === "circle" ? 1.5 : 3.2, length * 0.7),
          height = Math.min(4, parameters.height * 0.35);
        const base = (this.ground(world.x, world.z) ?? world.y) - world.y;
        const sign = root.createChild(`Wall sign ${rank + 1}`);
        sign.transform.setPosition(
          x + nx * mountOffset,
          base + Math.min(4 + height / 2, parameters.height - height / 2 - 0.3),
          z + nz * mountOffset
        );
        sign.transform.setRotation(0, (Math.atan2(nx, nz) * 180) / Math.PI, 0);
        const backing = sign.createChild("Metal frame");
        backing.transform.setScale(width + 0.15, height + 0.15, 0.12);
        const frameRenderer = backing.addComponent(MeshRenderer);
        frameRenderer.mesh = this.box;
        frameRenderer.setMaterial(this.materials[0]);
        const face = sign.createChild("Emission");
        face.transform.setPosition(0, 0, 0.07);
        face.transform.setRotation(90, 0, 0);
        face.transform.setScale(width, 1, height);
        const renderer = face.addComponent(MeshRenderer);
        renderer.mesh = this.panel;
        const hash = Array.from(group.definition!.id).reduce((n, c) => (Math.imul(n, 31) + c.charCodeAt(0)) >>> 0, 0);
        const tile = (hash + rank) % SIGN_EMITTERS.length;
        renderer.setMaterial(this.materials[1 + tile]);
        if (rank === 0 && this.q.spillIntensity > 0) {
          const emitter = SIGN_EMITTERS[tile];
          const spill = sign.createChild("Sign spill light");
          // The plane's +V maps down after its 90° X rotation. Keep the light
          // just outside the emitting face so the sign's own frame stays behind it.
          spill.transform.setPosition(
            (emitter.u - 0.5) * width,
            (0.5 - emitter.v) * height,
            face.transform.position.z + 0.08
          );
          const light = spill.addComponent(PointLight);
          light.enabled = false;
          const strength = this.q.spillIntensity;
          light.color = emitter.cyan
            ? new Color(0.015 * strength, 0.6 * strength, strength, 1)
            : new Color(strength, 0.015 * strength, 0.35 * strength, 1);
          light.distance = 18;
          this.lights.add(light);
        }
      }
    }
    for (const light of this.lights) if (light.destroyed) this.lights.delete(light);
    const focus = this.viewer?.transform.worldPosition ?? this.road[Math.floor(this.road.length / 2)];
    const distance = (light: PointLight) => {
      const p = light.entity.transform.worldPosition;
      return focus ? Math.hypot(p.x - focus.x, p.z - focus.z) : 0;
    };
    [...this.lights]
      .sort((a, b) => distance(a) - distance(b))
      .forEach((light, index) => {
        light.enabled = index < 6;
      });
  }

  dispose(): void {
    for (const { root } of this.mounts.values()) root.destroy();
    this.mounts.clear();
    this.root.destroy();
    this.lights.clear();
    this.materials.forEach((material) => material.destroy());
    this.panel.destroy();
    this.box.destroy();
  }
}
class FacadeRefresh extends Script {
  updateFacades?: (deltaTime: number) => void;
  onUpdate(deltaTime: number): void {
    this.updateFacades?.(deltaTime);
  }
}
