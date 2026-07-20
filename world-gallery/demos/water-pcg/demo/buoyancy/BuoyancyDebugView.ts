/** Galacean-rendered Pontoon, sampled-surface and point-force diagnostics. */
import { Engine, Entity, MeshRenderer, PrimitiveMesh, UnlitMaterial } from "@galacean/engine-core";
import { Color, Quaternion, Vector3 } from "@galacean/engine-math";
import type { WaterBuoyancy, WaterBuoyancyPontoonState } from "../../runtime/buoyancy/WaterBuoyancy";

interface PontoonDebugMarker {
  readonly pontoon: Entity;
  readonly pontoonRenderer: MeshRenderer;
  readonly surface: Entity;
  readonly force: Entity;
}

function createMaterial(engine: Engine, color: Color, transparent = false): UnlitMaterial {
  const material = new UnlitMaterial(engine);
  material.baseColor = color;
  material.isTransparent = transparent;
  material.isGCIgnored = true;
  return material;
}

function createRenderer(entity: Entity, mesh: ReturnType<typeof PrimitiveMesh.createSphere>, material: UnlitMaterial) {
  const renderer = entity.addComponent(MeshRenderer);
  renderer.mesh = mesh;
  renderer.setMaterial(material);
  return renderer;
}

export class BuoyancyDebugView {
  private readonly _root: Entity;
  private readonly _markers: PontoonDebugMarker[] = [];
  private readonly _pontoonMesh;
  private readonly _surfaceMesh;
  private readonly _forceMesh;
  private readonly _dryMaterial: UnlitMaterial;
  private readonly _wetMaterial: UnlitMaterial;
  private readonly _surfaceMaterial: UnlitMaterial;
  private readonly _forceMaterial: UnlitMaterial;
  private readonly _forceDirection = new Vector3();
  private readonly _forceMidpoint = new Vector3();
  private readonly _rotationAxis = new Vector3();
  private readonly _forceRotation = new Quaternion();

  constructor(
    engine: Engine,
    parent: Entity,
    private readonly _buoyancy: WaterBuoyancy
  ) {
    this._root = parent.createChild("buoyancy-debug");
    this._pontoonMesh = PrimitiveMesh.createSphere(engine, 1, 14);
    this._surfaceMesh = PrimitiveMesh.createSphere(engine, 0.09, 10);
    this._forceMesh = PrimitiveMesh.createCylinder(engine, 0.045, 0.045, 1, 8);
    this._pontoonMesh.isGCIgnored = true;
    this._surfaceMesh.isGCIgnored = true;
    this._forceMesh.isGCIgnored = true;
    this._dryMaterial = createMaterial(engine, new Color(0.23, 0.78, 0.9, 0.24), true);
    this._wetMaterial = createMaterial(engine, new Color(0.3, 1, 0.58, 0.42), true);
    this._surfaceMaterial = createMaterial(engine, new Color(0.96, 1, 1, 0.95));
    this._forceMaterial = createMaterial(engine, new Color(1, 0.66, 0.2, 0.95));

    for (let index = 0; index < this._buoyancy.pontoonStates.length; index++) {
      const markerRoot = this._root.createChild(`pontoon-${index}`);
      const pontoon = markerRoot.createChild("volume");
      const pontoonRenderer = createRenderer(pontoon, this._pontoonMesh, this._dryMaterial);
      const surface = markerRoot.createChild("sampled-surface");
      createRenderer(surface, this._surfaceMesh, this._surfaceMaterial);
      const force = markerRoot.createChild("point-force");
      createRenderer(force, this._forceMesh, this._forceMaterial);
      markerRoot.isActive = false;
      this._markers.push({ pontoon: markerRoot, pontoonRenderer, surface, force });
    }
  }

  update(): void {
    const states = this._buoyancy.pontoonStates;
    for (let index = 0; index < this._markers.length; index++) {
      const marker = this._markers[index];
      const state = states[index];
      marker.pontoon.isActive = state.enabled;
      if (!state.enabled) continue;

      marker.pontoon.transform.worldPosition.copyFrom(state.worldPosition);
      marker.pontoon.transform.setScale(state.worldRadius, state.worldRadius, state.worldRadius);
      marker.pontoonRenderer.setMaterial(state.submergedRatio > 0 ? this._wetMaterial : this._dryMaterial);

      marker.surface.isActive = state.surfaceHit;
      if (state.surfaceHit) marker.surface.transform.worldPosition.copyFrom(state.surfacePosition);
      this._updateForceMarker(marker.force, state);
    }
  }

  destroy(): void {
    this._root.destroy();
    this._pontoonMesh.destroy(true);
    this._surfaceMesh.destroy(true);
    this._forceMesh.destroy(true);
    this._dryMaterial.destroy(true);
    this._wetMaterial.destroy(true);
    this._surfaceMaterial.destroy(true);
    this._forceMaterial.destroy(true);
  }

  private _updateForceMarker(entity: Entity, state: WaterBuoyancyPontoonState): void {
    const magnitude = state.force.length();
    if (!Number.isFinite(magnitude) || magnitude <= 1e-5) {
      entity.isActive = false;
      return;
    }

    entity.isActive = true;
    Vector3.scale(state.force, 1 / magnitude, this._forceDirection);
    const length = Math.min(2.6, 0.08 + Math.sqrt(magnitude) * 0.085);
    Vector3.scale(this._forceDirection, length * 0.5, this._forceMidpoint);
    Vector3.add(state.worldPosition, this._forceMidpoint, this._forceMidpoint);
    entity.transform.worldPosition.copyFrom(this._forceMidpoint);
    entity.transform.setScale(1, length, 1);
    this._setRotationFromUp(entity, this._forceDirection);
  }

  private _setRotationFromUp(entity: Entity, direction: Vector3): void {
    const dot = Math.max(-1, Math.min(1, direction.y));
    if (dot < -0.999999) {
      this._forceRotation.set(1, 0, 0, 0);
    } else {
      this._rotationAxis.set(direction.z, 0, -direction.x);
      this._forceRotation.set(this._rotationAxis.x, this._rotationAxis.y, this._rotationAxis.z, 1 + dot);
      this._forceRotation.normalize();
    }
    entity.transform.worldRotationQuaternion.copyFrom(this._forceRotation);
  }
}
