import type { RuntimeEditor } from "@galacean/engine-runtime-editor/runtime-editor/runtime-editor";
import { RuntimeSceneEdit } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-scene-edit";
import type { RuntimeProjectPackage } from "@galacean/engine-project/runtime-editor/project/runtime-project";
import { validateFarmingGrowthMultiplier } from "@galacean/engine-farming/farming/config/FarmingSimulationConfig";
import {
  farmingCatalogFromData,
  farmingDefinitionsFromData,
  parseFarmingResourceFile,
  type FarmingCatalogData,
  type FarmingRulesData
} from "@galacean/engine-farming/farming/native/FarmingResources";
import { planningFarmingAssetReference } from "./PlanningFarmingAssets.ts";
import { RuntimeInstanceSource } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-instance-source";
import { runtimeComponentIdentities } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-component-identity";

export interface PlanningFarmingGrowthResult {
  readonly committed: true;
  readonly activationError?: string;
}

/** The existing panel and Agent edit the same Source property and public history. */
export async function setPlanningFarmingGrowth(
  editor: Pick<RuntimeEditor, "beginEdit">,
  scenePath: string,
  value: number
): Promise<PlanningFarmingGrowthResult> {
  validateFarmingGrowthMultiplier(value);
  const signal = new AbortController().signal;
  const edit = editor.beginEdit(crypto.randomUUID(), signal);
  let committed = false;
  try {
    await edit.run(({ draft, edited }) => {
      const scene = new RuntimeSceneEdit(draft, scenePath);
      const systems = scene.queryComponents({ type: "FarmingSystem" });
      if (systems.length !== 1) throw new Error("Growth authoring requires one FarmingSystem");
      scene.updateComponent(systems[0].id, { cropGrowthMultiplier: value });
      edited();
    });
    await edit.prepare(signal);
    await edit.commit();
    committed = true;
    await edit.activate(signal);
    return { committed: true };
  } catch (error) {
    if (committed) return { committed: true, activationError: String(error) };
    throw error;
  } finally {
    await edit.complete?.();
  }
}

interface ResourceInput {
  readonly path: string;
  readonly content: string;
}
interface ValidatedPair {
  readonly catalog: ResourceInput & { data: FarmingCatalogData; definition: ReturnType<typeof farmingCatalogFromData> };
  readonly rules: ResourceInput & { data: FarmingRulesData };
}

function authoringResource(
  pack: RuntimeProjectPackage,
  system: GalaceanSourceComponentSchema,
  kind: "catalog" | "rules"
): ResourceInput {
  const path = planningFarmingAssetReference(system, kind);
  if (pack.project.files.find((file) => file.virtualPath === path)?.type !== "JSON")
    throw new Error(`FarmingSystem ${kind} requires a JSON asset: ${path}`);
  const content = pack.contents[path];
  if (typeof content !== "string") throw new Error(`Read farming ${kind} JSON before validation: ${path}`);
  return { path, content };
}
function parseAuthoringResource<T extends "catalog" | "rules">(input: ResourceInput, kind: T) {
  const file = parseFarmingResourceFile(input.content);
  if (file.kind !== kind) throw new Error(`FarmingSystem ${kind} references a ${file.kind} asset: ${input.path}`);
  return file as Extract<typeof file, { kind: T }>;
}
function sameInput(current: ResourceInput, previous?: ResourceInput): boolean {
  return previous?.path === current.path && previous.content === current.content;
}

/** Project-scoped cache: progress checkpoints reuse unchanged author resources.
 * Failed candidates never replace the last fully validated set. */
export function createPlanningFarmingAuthoringValidator(): (pack: RuntimeProjectPackage) => void {
  let pair: ValidatedPair | undefined;
  return (pack) => {
    pair = validateFarmingAuthoring(pack, pair);
  };
}

export function validatePlanningFarmingAuthoring(pack: RuntimeProjectPackage): void {
  validateFarmingAuthoring(pack);
}

function validateFarmingAuthoring(pack: RuntimeProjectPackage, previous?: ValidatedPair): ValidatedPair | undefined {
  const content = pack.contents[pack.project.scene];
  if (typeof content !== "string") throw new Error("Read Scene source before validating farming authoring");
  const source: GalaceanSourceSceneFile = JSON.parse(content);
  const records = new Map(source.components.map((component) => [component.id, component]));
  const systems = [
    ...runtimeComponentIdentities(source, pack.project.scene, { type: "FarmingSystem" }).map(
      (identity) => records.get(identity.id)!
    ),
    ...[...new RuntimeInstanceSource(source, pack).components.values()]
      .map((member) => member.record)
      .filter((component) => component.type === "FarmingSystem")
  ];
  if (systems.length > 1) throw new Error("Scene requires one FarmingSystem");
  const [system] = systems;
  if (!system) return;
  const multiplier = system.props?.cropGrowthMultiplier;
  if (multiplier !== undefined) validateFarmingGrowthMultiplier(multiplier);
  const catalogInput = authoringResource(pack, system, "catalog");
  const rulesInput = authoringResource(pack, system, "rules");
  let catalog = sameInput(catalogInput, previous?.catalog) ? previous!.catalog : undefined;
  const rules = sameInput(rulesInput, previous?.rules)
    ? previous!.rules
    : { ...rulesInput, data: parseAuthoringResource(rulesInput, "rules").data };
  if (catalog && catalog === previous?.catalog && rules === previous.rules) return previous;
  const data = catalog?.data ?? parseAuthoringResource(catalogInput, "catalog").data;
  if (data.version !== rules.data.version)
    throw new Error(
      `FarmingSystem catalog and rules data versions must match (${data.version} and ${rules.data.version})`
    );
  catalog ??= { ...catalogInput, data, definition: farmingCatalogFromData(data) };
  farmingDefinitionsFromData(data, rules.data, catalog.definition);
  return { catalog, rules };
}
