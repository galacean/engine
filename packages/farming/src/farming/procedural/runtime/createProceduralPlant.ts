import { AssetType, Engine, Entity, MeshRenderer, type Texture2D } from "@galacean/engine";
import { parsePlantGrowthMetadata, type PlantGrowthDefinition } from "../core/PlantGrowthDefinition";
import { DEFAULT_PLANT_SHAPE, type PlantShape } from "../core/PlantGrowthRecipe";
import { parsePlantGrowthRecipe } from "../core/validation";
import { PlantGeometryEvaluator } from "../core/PlantGeometryEvaluator";
import { bindSharedPlantOrganTint, type PlantOrganAppearance } from "./PlantOrganMaterials";
import { ProceduralPlant } from "./ProceduralPlant";
import { preparePlantShaderPrograms } from "./preparePlantShaderPrograms";
import {
  acquirePlantGrowthMesh,
  acquirePlantSpeciesMaterial,
  acquirePlantStaticGeometry,
  plantDefinitionKey,
  type PlantGrowthMeshLease,
  type PlantSpeciesMaterialLease,
  type PlantStaticGeometryLease
} from "./PlantResourcePool";

export type PlantCreationPhase =
  | "recipe"
  | "texture"
  | "material"
  | "geometry"
  | "gpu"
  | "tint"
  | "growth"
  | "shader"
  | "shader-submit"
  | "shader-poll"
  | "publish";
export type PlantCreationScheduler = <T>(work: () => T, phase: PlantCreationPhase, signal?: AbortSignal) => Promise<T>;

/** Direct factory callers also yield while the driver compiles; presenters supply their frame queue. */
export const defaultPlantCreationScheduler: PlantCreationScheduler = async (work, phase) => {
  if (phase.startsWith("shader")) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  return work();
};

export interface PlantGrowthInstance {
  readonly definition: PlantGrowthDefinition;
  readonly plant: ProceduralPlant;
  /** Geometry and material state advance together. */
  setGrowth(age: number, shape?: PlantShape): void;
  dispose(): void;
}

/** Species-neutral assembly. Owns meshes/materials; texture cache lifetime belongs to the engine. */
export async function createProceduralPlant(
  definition: PlantGrowthDefinition,
  engine: Engine,
  parent: Entity,
  initialAge = definition.preview.initialAge,
  schedule: PlantCreationScheduler = defaultPlantCreationScheduler,
  initialShape: PlantShape = DEFAULT_PLANT_SHAPE,
  publish: (plant: ProceduralPlant) => void = (plant) => {
    plant.root.isActive = true;
  },
  options: { readonly poolGrowth?: boolean } = {}
): Promise<PlantGrowthInstance> {
  const { recipe: _recipe, atlasUrl: _atlas, ...source } = definition;
  const metadata = parsePlantGrowthMetadata(source);
  const recipe = parsePlantGrowthRecipe(definition.recipe);
  if (recipe.id !== metadata.id) throw new Error("植物与配方 ID 不一致");
  if (!definition.atlasUrl) throw new Error("植物缺少图集地址");
  if ((recipe.volumes.some((v) => v.tint) || recipe.meshes?.some((m) => m.tint)) && !metadata.material.tintColors)
    throw new Error("着色部件缺少颜色曲线");
  const parsedDefinition: PlantGrowthDefinition =
    Object.isFrozen(definition) && Object.isFrozen(definition.recipe) && Object.isFrozen(definition.material)
      ? definition
      : { ...metadata, recipe, atlasUrl: definition.atlasUrl };
  const definitionKey = plantDefinitionKey(parsedDefinition);
  // Each await returns control to the host queue. Promise-only yielding would
  // keep every synchronous step in the same event-loop turn.
  const step: PlantCreationScheduler = (work, phase) =>
    schedule(() => {
      if (engine.destroyed || parent.destroyed) throw new Error("植物加载完成前宿主已释放");
      return work();
    }, phase);
  // Request admission belongs to Farming. A host supplies visibility, never a separate texture policy.
  // Once admitted, the ResourceManager owns/deduplicates the asynchronous request and cached texture.
  const texture = await step(
    () =>
      engine.resourceManager.load<Texture2D>({
        type:
          /\.ktx2(?:[?#]|$)/i.test(definition.atlasUrl) || /^data:image\/ktx2[;,]/i.test(definition.atlasUrl)
            ? AssetType.KTX2
            : AssetType.Texture,
        url: definition.atlasUrl
      }),
    "texture"
  );
  let materialLease: PlantSpeciesMaterialLease | undefined;
  let staticLease: PlantStaticGeometryLease | undefined;
  let growthLease: PlantGrowthMeshLease | undefined;
  let plant: ProceduralPlant | undefined;
  let evaluator: PlantGeometryEvaluator | undefined;
  try {
    await step(() => {
      materialLease = acquirePlantSpeciesMaterial(engine, definitionKey, metadata, texture);
    }, "material");
    if (options.poolGrowth) {
      await step(() => {
        growthLease = acquirePlantGrowthMesh(engine, definitionKey, recipe, initialShape, initialAge);
      }, "geometry");
      await step(() => {
        plant = new ProceduralPlant(
          recipe,
          engine,
          parent,
          materialLease!.material,
          undefined,
          undefined,
          initialShape,
          { definitionKey, growthLease, poolGrowth: true }
        );
        growthLease = undefined;
        // Partial instances must not reach a render pass before initial growth/tint.
        plant.root.isActive = false;
      }, "gpu");
    } else {
      evaluator = await step(() => {
        const created = new PlantGeometryEvaluator(recipe);
        created.update(initialAge, initialShape);
        return created;
      }, "geometry");
      await step(() => {
        staticLease = acquirePlantStaticGeometry(engine, definitionKey, recipe, evaluator!);
        plant = new ProceduralPlant(
          recipe,
          engine,
          parent,
          materialLease!.material,
          evaluator!,
          undefined,
          initialShape,
          { definitionKey, staticLease, poolGrowth: false }
        );
        staticLease = undefined;
        // Partial instances must not reach a render pass before initial growth/tint.
        plant.root.isActive = false;
      }, "gpu");
      // Scheduled closures share the factory context; do not retain an old private evaluator after a later binding swap.
      evaluator = undefined;
    }
    const current = plant!;
    const ownedMaterialRelease = materialLease!;
    materialLease = undefined;
    let appearance: PlantOrganAppearance | undefined;
    current.ownAppearance(() => {
      appearance = undefined;
      ownedMaterialRelease.release();
    });
    if (metadata.material.tintColors) {
      appearance = await step(
        () =>
          bindSharedPlantOrganTint(
            current.root.getComponentsIncludeChildren(MeshRenderer, []),
            metadata.material.tintColors!,
            () => current.disposed
          ),
        "tint"
      );
    }
    let released = false;
    let tintProgress = NaN;
    const instance: PlantGrowthInstance = {
      definition: { ...metadata, recipe, atlasUrl: definition.atlasUrl },
      plant: current,
      setGrowth(age, shape = current.shape) {
        current.setGrowth(age, shape);
        if (!current.shared && tintProgress !== current.geometry.maturity) {
          appearance?.setProgress(current.geometry.maturity);
          tintProgress = current.geometry.maturity;
        }
      },
      dispose() {
        if (released) return;
        released = true;
        current.dispose();
      }
    };
    await step(() => instance.setGrowth(initialAge, initialShape), "growth");
    await preparePlantShaderPrograms(engine, current.root, step, true);
    await step(() => {
      // The owner must apply its final presentation state synchronously before activation.
      publish(current);
    }, "publish");
    return instance;
  } catch (error) {
    plant?.dispose();
    growthLease?.release();
    staticLease?.release();
    materialLease?.release();
    throw error;
  }
}
