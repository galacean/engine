import { AssetType, Engine, Entity, MeshRenderer, PBRMaterial, RenderFace, type Texture2D } from "@galacean/engine";
import { parsePlantGrowthMetadata, type PlantGrowthDefinition } from "../core/PlantGrowthDefinition";
import { DEFAULT_PLANT_SHAPE, type PlantShape } from "../core/PlantGrowthRecipe";
import { parsePlantGrowthRecipe } from "../core/validation";
import { PlantGeometryEvaluator } from "../core/PlantGeometryEvaluator";
import { PlantOrganMaterials } from "./PlantOrganMaterials";
import { ProceduralPlant } from "./ProceduralPlant";
import { preparePlantShaderPrograms } from "./preparePlantShaderPrograms";

export type PlantCreationPhase =
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
  }
): Promise<PlantGrowthInstance> {
  const { recipe: _recipe, atlasUrl: _atlas, ...source } = definition;
  const metadata = parsePlantGrowthMetadata(source);
  const recipe = parsePlantGrowthRecipe(definition.recipe);
  if (recipe.id !== metadata.id) throw new Error("植物与配方 ID 不一致");
  if (!definition.atlasUrl) throw new Error("植物缺少图集地址");
  if ((recipe.volumes.some((v) => v.tint) || recipe.meshes?.some((m) => m.tint)) && !metadata.material.tintColors)
    throw new Error("着色部件缺少颜色曲线");
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
  let material: PBRMaterial | undefined;
  let materials: PlantOrganMaterials | undefined;
  let plant: ProceduralPlant | undefined;
  try {
    await step(() => {
      material = new PBRMaterial(engine);
      material.name = metadata.name;
      material.baseTexture = texture;
      material.metallic = metadata.material.metallic;
      material.roughness = metadata.material.roughness;
      material.alphaCutoff = metadata.material.alphaCutoff;
      material.renderFace = metadata.material.doubleSided ? RenderFace.Double : RenderFace.Front;
      materials = metadata.material.tintColors
        ? new PlantOrganMaterials(engine, metadata.material.tintColors)
        : undefined;
    }, "material");
    let evaluator: PlantGeometryEvaluator | undefined = await step(() => {
      const evaluator = new PlantGeometryEvaluator(recipe);
      evaluator.update(initialAge, initialShape);
      return evaluator;
    }, "geometry");
    await step(() => {
      plant = new ProceduralPlant(recipe, engine, parent, material!, evaluator!, undefined, initialShape);
      // Partial instances must not reach a render pass before initial growth/tint.
      plant.root.isActive = false;
    }, "gpu");
    // Scheduled closures share the factory context; do not retain an old private evaluator after a later binding swap.
    evaluator = undefined;
    const current = plant!;
    let appearance = await step(
      () => materials?.bind(current.root.getComponentsIncludeChildren(MeshRenderer, []), () => current.disposed),
      "tint"
    );
    current.ownAppearance(() => {
      appearance = undefined;
      materials?.dispose();
      material?.destroy(true);
      materials = undefined;
      material = undefined;
    });
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
        materials?.dispose();
        material?.destroy(true);
      }
    };
    await step(() => instance.setGrowth(initialAge, initialShape), "growth");
    await preparePlantShaderPrograms(engine, current.root, step);
    await step(() => {
      // The owner must apply its final presentation state synchronously before activation.
      publish(current);
    }, "publish");
    return instance;
  } catch (error) {
    plant?.dispose();
    materials?.dispose();
    material?.destroy(true);
    throw error;
  }
}
