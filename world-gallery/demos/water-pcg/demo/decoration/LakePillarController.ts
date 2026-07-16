/**
 * Demo-only lake stone pillars.
 *
 * Pillar placement consumes the compiled Terrain corridor so each column starts
 * on the generated lake bed and extends through the water surface. This remains
 * a presentation fixture and does not add decoration data to River assets.
 */
import {
  BlinnPhongMaterial,
  DirectLight,
  Engine,
  Entity,
  MeshRenderer,
  ModelMesh,
  PrimitiveMesh
} from "@galacean/engine-core";
import { Color } from "@galacean/engine-math";
import { RIVER_TERRAIN_CORRIDOR_COMPONENT } from "../../compiler/river/constants";
import type { RiverCompiledData, RiverTerrainReachCorridorData } from "../../compiler/river/types";
import { LAKE_PILLAR_LAYOUT, LAKE_PILLAR_STYLE, WaterDecorationStyle } from "./constants";
import { createWaterTerrainHeightSampler } from "./WaterTerrainBuilder";

type Vector3Tuple = readonly [number, number, number];
type RiverTerrainCorridorComponent =
  (typeof RIVER_TERRAIN_CORRIDOR_COMPONENT)[keyof typeof RIVER_TERRAIN_CORRIDOR_COMPONENT];

export interface LakePillarPlacement {
  readonly position: Vector3Tuple;
  readonly rotation: Vector3Tuple;
  readonly scale: Vector3Tuple;
  readonly bedY: number;
  readonly waterSurfaceY: number;
  readonly topY: number;
}

function readCorridorSample(
  corridor: RiverTerrainReachCorridorData,
  sampleIndex: number,
  component: RiverTerrainCorridorComponent
): number {
  return corridor.samples.at(sampleIndex * corridor.stride + component) ?? 0;
}

export function createLakePillarPlacements(data: RiverCompiledData): LakePillarPlacement[] {
  const corridor = data.terrainInteraction.reachCorridors[0];
  if (!corridor || corridor.sampleCount === 0) return [];

  const sampleTerrainHeight = createWaterTerrainHeightSampler(data, WaterDecorationStyle.Lake);
  return LAKE_PILLAR_LAYOUT.map((layout) => {
    const sampleIndex = Math.round((corridor.sampleCount - 1) * layout.sampleFraction);
    const previousIndex = Math.max(0, sampleIndex - 1);
    const nextIndex = Math.min(corridor.sampleCount - 1, sampleIndex + 1);
    const x = readCorridorSample(corridor, sampleIndex, RIVER_TERRAIN_CORRIDOR_COMPONENT.x);
    const z = readCorridorSample(corridor, sampleIndex, RIVER_TERRAIN_CORRIDOR_COMPONENT.z);
    const previousX = readCorridorSample(corridor, previousIndex, RIVER_TERRAIN_CORRIDOR_COMPONENT.x);
    const previousZ = readCorridorSample(corridor, previousIndex, RIVER_TERRAIN_CORRIDOR_COMPONENT.z);
    const nextX = readCorridorSample(corridor, nextIndex, RIVER_TERRAIN_CORRIDOR_COMPONENT.x);
    const nextZ = readCorridorSample(corridor, nextIndex, RIVER_TERRAIN_CORRIDOR_COMPONENT.z);
    const directionX = nextX - previousX;
    const directionZ = nextZ - previousZ;
    const directionLength = Math.max(Math.hypot(directionX, directionZ), LAKE_PILLAR_STYLE.minDirectionLength);
    const normalX = -directionZ / directionLength;
    const normalZ = directionX / directionLength;
    const halfWidth = readCorridorSample(corridor, sampleIndex, RIVER_TERRAIN_CORRIDOR_COMPONENT.channelHalfWidth);
    const lateralOffset = halfWidth * layout.lateralFraction;
    const waterSurfaceY = readCorridorSample(corridor, sampleIndex, RIVER_TERRAIN_CORRIDOR_COMPONENT.waterSurfaceY);
    const positionX = x + normalX * lateralOffset;
    const positionZ = z + normalZ * lateralOffset;
    const bedY = sampleTerrainHeight(positionX, positionZ);
    const topY = waterSurfaceY + layout.heightAboveWater;
    const height = topY - bedY;

    return {
      position: [positionX, bedY + height * 0.5, positionZ],
      rotation: [0, layout.rotationY, 0],
      scale: [layout.radius, height, layout.radius],
      bedY,
      waterSurfaceY,
      topY
    };
  });
}

/** Renders deterministic faceted columns that visibly connect lake bed and shore line. */
export class LakePillarController {
  readonly root: Entity;

  private readonly _pillarsRoot: Entity;
  private readonly _mesh: ModelMesh;
  private readonly _material: BlinnPhongMaterial;

  get pillarCount(): number {
    return this._pillarsRoot.children.length;
  }

  constructor(engine: Engine, parent: Entity) {
    this.root = parent.createChild("lake-pillar-decoration");
    this._pillarsRoot = this.root.createChild("pillars");
    this._mesh = PrimitiveMesh.createCylinder(
      engine,
      LAKE_PILLAR_STYLE.radiusTop,
      LAKE_PILLAR_STYLE.radiusBottom,
      LAKE_PILLAR_STYLE.meshHeight,
      LAKE_PILLAR_STYLE.radialSegments,
      LAKE_PILLAR_STYLE.heightSegments
    );
    this._material = new BlinnPhongMaterial(engine);
    this._material.baseColor = new Color(...LAKE_PILLAR_STYLE.baseColor);
    this._material.specularColor = new Color(...LAKE_PILLAR_STYLE.specularColor);
    this._material.emissiveColor = new Color(...LAKE_PILLAR_STYLE.emissiveColor);
    this._material.shininess = LAKE_PILLAR_STYLE.shininess;

    const lightEntity = this.root.createChild("lake-pillar-light");
    lightEntity.transform.setRotation(...LAKE_PILLAR_STYLE.lightRotation);
    lightEntity.addComponent(DirectLight).color = new Color(...LAKE_PILLAR_STYLE.lightColor);
  }

  rebuild(data: RiverCompiledData): void {
    while (this._pillarsRoot.children.length > 0) {
      this._pillarsRoot.children[this._pillarsRoot.children.length - 1].destroy();
    }

    const placements = createLakePillarPlacements(data);
    for (let index = 0; index < placements.length; index++) {
      const placement = placements[index];
      const pillar = this._pillarsRoot.createChild(`lake-pillar-${index}`);
      pillar.transform.setPosition(...placement.position);
      pillar.transform.setRotation(...placement.rotation);
      pillar.transform.setScale(...placement.scale);
      const renderer = pillar.addComponent(MeshRenderer);
      renderer.mesh = this._mesh;
      renderer.setMaterial(this._material);
    }
  }

  destroy(): void {
    this.root.destroy();
    this._mesh.destroy(true);
    this._material.destroy(true);
  }
}
