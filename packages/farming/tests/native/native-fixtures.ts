import { vi } from "vitest";
vi.mock("@galacean/engine-core", async importOriginal => ({
  ...await importOriginal<typeof import("@galacean/engine-core")>(),
  Script: class {
    enabled = true;
    destroyed = false;
    entity: any;
    get engine() {
      return this.entity.engine;
    }
  },
  ReferResource: class {
    destroyed = false;
    refs = 0;
    constructor(readonly engine: unknown) {}
    _addReferCount(n: number) {
      this.refs += n;
    }
    destroy() {}
  },
  Loader: class {
    static registerClass() {}
  },
  resourceLoader: () => () => {},
  ignoreClone: () => {},
  AssetPromise: Promise
}));
import type { Engine, Entity, Scene } from "@galacean/engine-core";
import { FarmingSystem } from "../../src/farming/native/FarmingSystem";
import {
  FarmingAreaComponent,
  type FarmingAreaConfiguration,
  type FarmingAreaDependencies
} from "../../src/farming/native/FarmingAreaComponent";
import { createFarmingResources } from "../../src/farming/native/FarmingResources";
import { FarmingAPI } from "../../src/farming/native/FarmingAPI";
import { TEST_FARMING_DEFINITIONS, TEST_GROUND_PROVIDER } from "../fixtures/fixtures";
import { ManualFarmClock } from "../../src/farming/application/FarmClock";
export function nativeFixture(
  farmId = "native-farm",
  overrides: Partial<FarmingAreaDependencies> = {},
  configuration: Partial<FarmingAreaConfiguration> = {},
  definitions = TEST_FARMING_DEFINITIONS
) {
  const engine = {} as Engine;
  const scene = { rootEntities: [] as Entity[] } as unknown as Scene;
  function root(name: string) {
    const components: unknown[] = [];
    const entity = {
      name,
      engine,
      scene,
      children: [],
      isActiveInHierarchy: true,
      getComponent: (type: any) => components.find((c) => c instanceof type) ?? null,
      addComponent: (Type: any) => {
        const component = new Type();
        component.entity = entity;
        components.push(component);
        component.onAwake?.();
        return component;
      }
    } as unknown as Entity;
    (scene.rootEntities as Entity[]).push(entity);
    return entity;
  }
  const clock = new ManualFarmClock(1000);
  const system = root("system").addComponent(FarmingSystem);
  system.configureRuntime(() => ({
    storagePresentation: false,
    groundProvider: TEST_GROUND_PROVIDER,
    clock,
    ...overrides
  }));
  const resources = createFarmingResources(engine, definitions);
  const area = root(farmId).addComponent(FarmingAreaComponent);
  const config: FarmingAreaConfiguration = {
    farmId,
    layoutId: "native-layout",
    layoutVersion: 1,
    plots: [{ id: "native/a", label: "A" }],
    ...resources,
    ...configuration
  };
  const ready = area.configure(config);
  return { engine, scene, root, clock, system, area, resources, config, ready, api: new FarmingAPI(system) };
}
