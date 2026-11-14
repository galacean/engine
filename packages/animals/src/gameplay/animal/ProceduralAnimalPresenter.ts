import { Color, Entity, MeshRenderer, PBRMaterial, PrimitiveMesh, type Engine, type ModelMesh } from "@galacean/engine";
import type { AnimalMotion } from "./Animal";
import type { AnimalPresenter } from "./AnimalPresenter";

type Triple = readonly [number, number, number];
type Shape = "sphere" | "box" | "cone";

/** Shared placeholder meshes and materials. Dispose after all presenters using this owner. */
export class ProceduralAnimalAssets {
  private readonly _meshes: Record<Shape, ModelMesh>;
  private readonly _materials = new Map<string, PBRMaterial>();

  /** Create a small reusable primitive set for this scene. */
  constructor(private readonly engine: Engine) {
    this._meshes = {
      sphere: PrimitiveMesh.createSphere(engine, 0.5, 14),
      box: PrimitiveMesh.createCuboid(engine, 1, 1, 1),
      cone: PrimitiveMesh.createCylinder(engine, 0, 0.5, 1, 10)
    };
  }

  /** Create a named part with shared geometry and a colour-keyed shared material. */
  part(parent: Entity, name: string, shape: Shape, position: Triple, scale: Triple, color: string): Entity {
    const entity = parent.createChild(name);
    entity.transform.setPosition(...position);
    entity.transform.setScale(...scale);
    const renderer = entity.addComponent(MeshRenderer);
    renderer.mesh = this._meshes[shape];
    renderer.setMaterial(this.material(color));
    renderer.castShadows = true;
    renderer.receiveShadows = true;
    return entity;
  }

  /** Borrow a material for a hexadecimal RGB colour. */
  material(hex: string): PBRMaterial {
    let material = this._materials.get(hex);
    if (!material) {
      const rgb = Number.parseInt(hex.replace("#", ""), 16);
      material = new PBRMaterial(this.engine);
      material.baseColor = new Color(((rgb >> 16) & 255) / 255, ((rgb >> 8) & 255) / 255, (rgb & 255) / 255, 1);
      material.roughness = 0.88;
      material.metallic = 0;
      this._materials.set(hex, material);
    }
    return material;
  }

  /** Release this owner's meshes and materials after its consumers have been destroyed. */
  dispose(): void {
    for (const mesh of Object.values(this._meshes)) mesh.destroy();
    for (const material of this._materials.values()) material.destroy();
    this._materials.clear();
  }
}

/** Articulated placeholder; the body layout belongs to presentation, never to animal behavior. */
export class ProceduralAnimalPresenter implements AnimalPresenter {
  private readonly _root: Entity;
  private readonly _body: Entity;
  private readonly _head: Entity;
  private readonly _legs: Entity[] = [];
  private readonly _wings: Entity[] = [];
  private _clock = 0;
  private _started = false;
  private _flightBlend = 0;
  private readonly _bodyHeight: number;

  /** Create either a four-legged or winged placeholder; colour has no effect on its behavior. */
  constructor(
    parent: Entity,
    assets: ProceduralAnimalAssets,
    readonly shape: "quadruped" | "winged",
    color: string
  ) {
    this._root = parent.createChild(`Procedural ${shape}`);
    this._body = this._root.createChild("Articulated body");
    this._bodyHeight = shape === "quadruped" ? 1.26 : 0.46;
    this._head = this._body.createChild("Head pivot");
    if (shape === "quadruped") this._buildHorse(assets, color);
    else this._buildBird(assets, color);
  }

  /** Animate local parts using actual speed and travelled-distance phase. */
  update(m: AnimalMotion, seconds: number): void {
    if (!this._started) {
      this._clock = m.phase;
      this._started = true;
    }
    this._clock += seconds;
    this._root.transform.setPosition(m.x, m.y, m.z);
    this._root.transform.setRotation((m.pitch * 180) / Math.PI, (m.yaw * 180) / Math.PI, (m.bank * 180) / Math.PI);
    const moving = Math.min(1, m.speed / (this.shape === "quadruped" ? 1.2 : 0.6));
    const running = this.shape === "quadruped" && m.speed > 2;
    const bob = Math.cos(m.phase * 2) * moving * (running ? 0.075 : 0.025);
    this._body.transform.setPosition(0, this._bodyHeight + bob + Math.sin(this._clock * 2) * 0.008, 0);
    this._head.transform.setRotation(
      Math.sin(this._clock * 1.4) * (moving ? 2 : 5),
      Math.sin(this._clock * 0.65) * (moving ? 2 : 10),
      0
    );
    this._flightBlend += ((m.grounded ? 0 : 1) - this._flightBlend) * Math.min(1, seconds * 6);
    for (let i = 0; i < this._legs.length; i++) {
      const phase =
        this.shape === "quadruped"
          ? m.phase + (running ? (i < 2 ? 0 : 2.2) + (i % 2) * 0.45 : i === 0 || i === 3 ? 0 : Math.PI)
          : m.phase + i * Math.PI;
      const stride = Math.sin(phase) * moving * (running ? 37 : 24);
      this._legs[i].transform.setRotation(stride * (1 - this._flightBlend) - this._flightBlend * 68, 0, 0);
    }
    for (let i = 0; i < this._wings.length; i++) {
      const side = i === 0 ? -1 : 1;
      const flap = Math.sin(this._clock * (m.action === "takeOff" ? 20 : 14)) * 32;
      const spread = -72 * (1 - this._flightBlend) + flap * this._flightBlend;
      this._wings[i].transform.setRotation(0, -side * 8, side * spread);
    }
  }

  /** Destroy this articulated instance; shared meshes and materials remain borrowed. */
  dispose(): void {
    this._root.destroy();
  }

  private _buildHorse(a: ProceduralAnimalAssets, color: string): void {
    const part = (parent: Entity, name: string, shape: Shape, p: Triple, s: Triple, c = color) =>
      a.part(parent, name, shape, p, s, c);
    part(this._body, "Torso", "sphere", [0, 0, 0], [0.88, 0.94, 1.95]);
    part(this._body, "Chest", "sphere", [0, 0.06, 0.62], [0.85, 1.03, 0.85]);
    this._head.transform.setPosition(0, 0.28, 0.66);
    const neck = part(this._head, "Neck", "sphere", [0, 0.3, 0.08], [0.52, 1.08, 0.65]);
    neck.transform.setRotation(-23, 0, 0);
    part(this._head, "Head", "sphere", [0, 0.83, 0.35], [0.47, 0.53, 0.78]);
    part(this._head, "Muzzle", "sphere", [0, 0.68, 0.69], [0.4, 0.32, 0.48], "#564031");
    part(this._head, "Forehead stripe", "sphere", [0, 0.88, 0.69], [0.13, 0.29, 0.065], "#f5e5c7");
    for (const side of [-1, 1]) {
      part(this._head, "Ear", "sphere", [side * 0.17, 1.14, 0.24], [0.14, 0.38, 0.2]);
      part(this._head, "Eye", "sphere", [side * 0.225, 0.9, 0.49], [0.075, 0.085, 0.09], "#192522");
    }
    for (let i = 0; i < 7; i++)
      part(this._head, "Mane", "sphere", [0, 0.03 + i * 0.14, -0.13 + i * 0.045], [0.2, 0.25, 0.23], "#3e3027");
    for (let i = 0; i < 4; i++) {
      const pivot = this._body.createChild(`Leg ${i + 1}`);
      pivot.transform.setPosition(i % 2 === 0 ? -0.3 : 0.3, -0.24, i < 2 ? 0.61 : -0.64);
      part(pivot, "Upper leg", "sphere", [0, -0.23, 0], [0.23, 0.64, 0.25]);
      part(pivot, "Lower leg", "sphere", [0, -0.64, 0.025], [0.14, 0.51, 0.16], "#735139");
      part(pivot, "Hoof", "box", [0, -0.92, 0.07], [0.21, 0.18, 0.29], "#34302a");
      this._legs.push(pivot);
    }
    const tail = part(this._body, "Tail", "sphere", [0, -0.28, -1.02], [0.22, 0.88, 0.24], "#3e3027");
    tail.transform.setRotation(27, 0, 0);
  }

  private _buildBird(a: ProceduralAnimalAssets, color: string): void {
    a.part(this._body, "Body", "sphere", [0, 0, 0], [0.49, 0.54, 0.74], color);
    a.part(this._body, "Breast", "sphere", [0, -0.05, 0.18], [0.39, 0.42, 0.43], "#f3e7cb");
    this._head.transform.setPosition(0, 0.23, 0.22);
    a.part(this._head, "Head", "sphere", [0, 0, 0.08], [0.39, 0.4, 0.4], color);
    const beak = a.part(this._head, "Beak", "cone", [0, -0.035, 0.34], [0.19, 0.3, 0.18], "#e5ae50");
    beak.transform.setRotation(90, 0, 0);
    for (const side of [-1, 1]) {
      a.part(this._head, "Eye surround", "sphere", [side * 0.175, 0.035, 0.18], [0.09, 0.11, 0.12], "#fff5dd");
      a.part(this._head, "Eye", "sphere", [side * 0.211, 0.04, 0.2], [0.045, 0.065, 0.07], "#192522");
      const wing = this._body.createChild("Wing pivot");
      wing.transform.setPosition(side * 0.16, 0.1, -0.05);
      a.part(wing, "Wing", "sphere", [side * 0.35, 0, -0.04], [0.9, 0.12, 0.48], color);
      for (let feather = 0; feather < 3; feather++) {
        a.part(
          wing,
          "Flight feather",
          "sphere",
          [side * (0.6 + feather * 0.09), 0, -0.1 - feather * 0.1],
          [0.42, 0.065, 0.2],
          color
        );
      }
      this._wings.push(wing);
      const leg = this._body.createChild("Leg pivot");
      leg.transform.setPosition(side * 0.12, -0.18, 0.04);
      a.part(leg, "Leg", "box", [0, -0.11, 0], [0.045, 0.24, 0.045], "#c98b42");
      a.part(leg, "Foot", "box", [0, -0.24, 0.06], [0.12, 0.045, 0.2], "#c98b42");
      this._legs.push(leg);
    }
    const tail = a.part(this._body, "Tail", "sphere", [0, 0.08, -0.42], [0.32, 0.12, 0.52], color);
    tail.transform.setRotation(16, 0, 0);
  }
}
