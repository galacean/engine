/**
 * Demo-only indoor pool fixtures.
 *
 * The pool still uses the River compiler/runtime for its water surface. This
 * controller adds the reference scene cues that make the same transparent water
 * read as an indoor tiled pool without extending the formal River asset schema.
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
import { POOL_SCENE_STYLE } from "./constants";

type Vector3Tuple = readonly [number, number, number];

export interface PoolSceneLayout {
  readonly position: Vector3Tuple;
  readonly rotationY: number;
  readonly length: number;
  readonly width: number;
  readonly depth: number;
}

function readCorridorSample(corridor: RiverTerrainReachCorridorData, sampleIndex: number, component: number): number {
  return corridor.samples.at(sampleIndex * corridor.stride + component) ?? 0;
}

export function createPoolSceneLayout(data: RiverCompiledData): PoolSceneLayout | undefined {
  const corridor = data.terrainInteraction.reachCorridors[0];
  if (!corridor || corridor.sampleCount < 2) return undefined;

  const lastIndex = corridor.sampleCount - 1;
  const middleIndex = Math.floor(lastIndex * 0.5);
  const firstX = readCorridorSample(corridor, 0, RIVER_TERRAIN_CORRIDOR_COMPONENT.x);
  const firstZ = readCorridorSample(corridor, 0, RIVER_TERRAIN_CORRIDOR_COMPONENT.z);
  const lastX = readCorridorSample(corridor, lastIndex, RIVER_TERRAIN_CORRIDOR_COMPONENT.x);
  const lastZ = readCorridorSample(corridor, lastIndex, RIVER_TERRAIN_CORRIDOR_COMPONENT.z);
  const directionX = lastX - firstX;
  const directionZ = lastZ - firstZ;
  const length = Math.max(Math.hypot(directionX, directionZ), POOL_SCENE_STYLE.minimumDirectionLength);
  const waterSurfaceY = readCorridorSample(corridor, middleIndex, RIVER_TERRAIN_CORRIDOR_COMPONENT.waterSurfaceY);
  const bedY = readCorridorSample(corridor, middleIndex, RIVER_TERRAIN_CORRIDOR_COMPONENT.riverBedY);
  const halfWidth = readCorridorSample(corridor, middleIndex, RIVER_TERRAIN_CORRIDOR_COMPONENT.channelHalfWidth);

  return {
    position: [(firstX + lastX) * 0.5, waterSurfaceY, (firstZ + lastZ) * 0.5],
    rotationY: (-Math.atan2(directionZ, directionX) * 180) / Math.PI,
    length,
    width: halfWidth * 2,
    depth: Math.max(POOL_SCENE_STYLE.wallThickness, waterSurfaceY - bedY)
  };
}

export class PoolSceneController {
  readonly root: Entity;

  private readonly _engine: Engine;
  private readonly _fixturesRoot: Entity;
  private readonly _deckMaterial: BlinnPhongMaterial;
  private readonly _copingMaterial: BlinnPhongMaterial;
  private readonly _wallMaterial: BlinnPhongMaterial;
  private readonly _ladderMaterial: BlinnPhongMaterial;
  private readonly _ladderMesh: ModelMesh;
  private _runtimeMeshes: ModelMesh[] = [];

  get fixtureCount(): number {
    return this._fixturesRoot.children.length;
  }

  constructor(engine: Engine, parent: Entity) {
    this._engine = engine;
    this.root = parent.createChild("pool-scene-decoration");
    this._fixturesRoot = this.root.createChild("pool-fixtures");
    this._deckMaterial = this._createSurfaceMaterial(
      "PoolDeckDemoMaterial",
      POOL_SCENE_STYLE.deckColor,
      POOL_SCENE_STYLE.deckShininess
    );
    this._copingMaterial = this._createSurfaceMaterial(
      "PoolCopingDemoMaterial",
      POOL_SCENE_STYLE.copingColor,
      POOL_SCENE_STYLE.deckShininess
    );
    this._wallMaterial = this._createSurfaceMaterial(
      "PoolWallDemoMaterial",
      POOL_SCENE_STYLE.wallColor,
      POOL_SCENE_STYLE.wallShininess
    );
    this._ladderMaterial = this._createSurfaceMaterial(
      "PoolLadderDemoMaterial",
      POOL_SCENE_STYLE.ladderColor,
      POOL_SCENE_STYLE.ladderShininess,
      POOL_SCENE_STYLE.ladderSpecularColor
    );

    this._ladderMesh = PrimitiveMesh.createCylinder(
      engine,
      POOL_SCENE_STYLE.ladderRadius,
      POOL_SCENE_STYLE.ladderRadius,
      1
    );

    const lightEntity = this.root.createChild("pool-key-light");
    lightEntity.transform.setRotation(...POOL_SCENE_STYLE.lightRotation);
    lightEntity.addComponent(DirectLight).color = new Color(...POOL_SCENE_STYLE.lightColor);
  }

  rebuild(data: RiverCompiledData): void {
    this._clearFixtures();
    const layout = createPoolSceneLayout(data);
    if (!layout) return;

    this._fixturesRoot.transform.setPosition(...layout.position);
    this._fixturesRoot.transform.setRotation(0, layout.rotationY, 0);
    const style = POOL_SCENE_STYLE;
    const halfLength = layout.length * 0.5;
    const halfWidth = layout.width * 0.5;
    const copingSideOffset = halfWidth + style.copingWidth * 0.5;
    const copingEndOffset = halfLength + style.copingWidth * 0.5;
    const deckSideOffset = halfWidth + style.copingWidth + style.deckWidth * 0.5;
    const deckEndOffset = halfLength + style.copingWidth + style.deckWidth * 0.5;
    const copingY = style.copingHeight * 0.5;
    const deckY = style.copingHeight * 0.3 - style.deckHeight * 0.5;
    const wallY = -layout.depth * 0.5;

    this._createCuboid(
      "pool-coping-near",
      layout.length + style.copingWidth * 2,
      style.copingHeight,
      style.copingWidth,
      [0, copingY, -copingSideOffset],
      this._copingMaterial
    );
    this._createCuboid(
      "pool-coping-far",
      layout.length + style.copingWidth * 2,
      style.copingHeight,
      style.copingWidth,
      [0, copingY, copingSideOffset],
      this._copingMaterial
    );
    this._createCuboid(
      "pool-coping-left",
      style.copingWidth,
      style.copingHeight,
      layout.width,
      [-copingEndOffset, copingY, 0],
      this._copingMaterial
    );
    this._createCuboid(
      "pool-coping-right",
      style.copingWidth,
      style.copingHeight,
      layout.width,
      [copingEndOffset, copingY, 0],
      this._copingMaterial
    );

    this._createCuboid(
      "pool-deck-near",
      layout.length + (style.copingWidth + style.deckWidth) * 2,
      style.deckHeight,
      style.deckWidth,
      [0, deckY, -deckSideOffset],
      this._deckMaterial
    );
    this._createCuboid(
      "pool-deck-far",
      layout.length + (style.copingWidth + style.deckWidth) * 2,
      style.deckHeight,
      style.deckWidth,
      [0, deckY, deckSideOffset],
      this._deckMaterial
    );
    this._createCuboid(
      "pool-deck-left",
      style.deckWidth,
      style.deckHeight,
      layout.width + style.copingWidth * 2,
      [-deckEndOffset, deckY, 0],
      this._deckMaterial
    );
    this._createCuboid(
      "pool-deck-right",
      style.deckWidth,
      style.deckHeight,
      layout.width + style.copingWidth * 2,
      [deckEndOffset, deckY, 0],
      this._deckMaterial
    );

    this._createCuboid(
      "pool-wall-near",
      layout.length,
      layout.depth,
      style.wallThickness,
      [0, wallY, -(halfWidth + style.wallThickness * 0.5)],
      this._wallMaterial
    );
    this._createCuboid(
      "pool-wall-far",
      layout.length,
      layout.depth,
      style.wallThickness,
      [0, wallY, halfWidth + style.wallThickness * 0.5],
      this._wallMaterial
    );
    this._createCuboid(
      "pool-wall-left",
      style.wallThickness,
      layout.depth,
      layout.width,
      [-(halfLength + style.wallThickness * 0.5), wallY, 0],
      this._wallMaterial
    );
    this._createCuboid(
      "pool-wall-right",
      style.wallThickness,
      layout.depth,
      layout.width,
      [halfLength + style.wallThickness * 0.5, wallY, 0],
      this._wallMaterial
    );

    this._createLadder(layout);
  }

  destroy(): void {
    this._clearFixtures();
    this.root.destroy();
    this._ladderMesh.destroy(true);
    this._deckMaterial.destroy(true);
    this._copingMaterial.destroy(true);
    this._wallMaterial.destroy(true);
    this._ladderMaterial.destroy(true);
  }

  private _createSurfaceMaterial(
    name: string,
    baseColor: readonly [number, number, number, number],
    shininess: number,
    specularColor: readonly [number, number, number, number] = POOL_SCENE_STYLE.specularColor
  ): BlinnPhongMaterial {
    const material = new BlinnPhongMaterial(this._engine);
    material.name = name;
    material.baseColor = new Color(...baseColor);
    material.specularColor = new Color(...specularColor);
    material.emissiveColor = new Color(
      baseColor[0] * POOL_SCENE_STYLE.emissiveScale,
      baseColor[1] * POOL_SCENE_STYLE.emissiveScale,
      baseColor[2] * POOL_SCENE_STYLE.emissiveScale,
      baseColor[3]
    );
    material.shininess = shininess;
    return material;
  }

  private _createCuboid(
    name: string,
    width: number,
    height: number,
    depth: number,
    position: Vector3Tuple,
    material: BlinnPhongMaterial
  ): void {
    const entity = this._fixturesRoot.createChild(name);
    entity.transform.setPosition(...position);
    const mesh = PrimitiveMesh.createCuboid(this._engine, width, height, depth);
    mesh.name = `${name}-mesh`;
    this._runtimeMeshes.push(mesh);
    const renderer = entity.addComponent(MeshRenderer);
    renderer.mesh = mesh;
    renderer.setMaterial(material);
  }

  private _createLadder(layout: PoolSceneLayout): void {
    const style = POOL_SCENE_STYLE;
    const centerX = -layout.length * 0.28;
    const railY = style.ladderAboveWater - style.ladderRailHeight * 0.5;
    const ladderZ = -layout.width * 0.5 + style.ladderInset;
    const leftX = centerX - style.ladderRailSpacing * 0.5;
    const rightX = centerX + style.ladderRailSpacing * 0.5;
    for (const [name, x] of [
      ["pool-ladder-left-rail", leftX],
      ["pool-ladder-right-rail", rightX]
    ] as const) {
      const rail = this._fixturesRoot.createChild(name);
      rail.transform.setPosition(x, railY, ladderZ);
      rail.transform.setScale(1, style.ladderRailHeight, 1);
      const renderer = rail.addComponent(MeshRenderer);
      renderer.mesh = this._ladderMesh;
      renderer.setMaterial(this._ladderMaterial);
    }
    for (let index = 0; index < style.ladderRungCount; index++) {
      const rung = this._fixturesRoot.createChild(`pool-ladder-rung-${index}`);
      rung.transform.setPosition(centerX, -0.35 - index * style.ladderRungSpacing, ladderZ);
      rung.transform.setRotation(0, 0, 90);
      rung.transform.setScale(1, style.ladderRailSpacing, 1);
      const renderer = rung.addComponent(MeshRenderer);
      renderer.mesh = this._ladderMesh;
      renderer.setMaterial(this._ladderMaterial);
    }
  }

  private _clearFixtures(): void {
    while (this._fixturesRoot.children.length > 0) {
      this._fixturesRoot.children[this._fixturesRoot.children.length - 1].destroy();
    }
    for (const mesh of this._runtimeMeshes) mesh.destroy(true);
    this._runtimeMeshes = [];
  }
}
