import { WebGLEngine, Script } from "@galacean/engine";
import { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import {
  RUNTIME_PROJECT_SAVE_VERSION,
  RuntimeProjectStorage,
  type RuntimeProjectPackage
} from "@galacean/engine-project/runtime-editor/project/runtime-project";
import { fixtureModules } from "./fixture-modules";
import { FarmingSystem } from "@galacean/engine-farming/farming/native/FarmingSystem";
import { BuildingPartComponent } from "@galacean/engine-building/building/parts/architecture/BuildingPartComponent";

/** Compile in the real Worker, then execute a Script against native Engine instances. */
export async function presetScriptBrowserFixture(id: string) {
  const source = `import { Script } from '@galacean/engine';
import { FarmingSystem,FarmingAPI,BuildingPartComponent } from '@galacean/building-demo-systems';
export default class Probe extends Script {
  async inspect() {
    const farm = this.entity.getComponent(FarmingSystem);
    if (!farm) throw new Error('Native farm not found');
    const result = await new FarmingAPI(farm).execute({operation:'list',input:{}});
    if (!result.ok) throw new Error(result.error.message);
    return {farm, house:this.entity.getComponent(BuildingPartComponent), wall:this.entity.children[0].getComponent(BuildingPartComponent), farms:result.value};
  }
}`;
  const pack: RuntimeProjectPackage = {
    version: RUNTIME_PROJECT_SAVE_VERSION,
    project: {
      scene: "Main.scene",
      files: [
        { virtualPath: "Main.scene", path: "Main.scene", type: "Scene", dependencies: [] },
        { virtualPath: "Probe.ts", path: "Probe.ts", type: "script", dependencies: [] }
      ]
    },
    contents: {
      "Main.scene": JSON.stringify({
        asset: { version: "2.0" },
        scene: { rootEntities: [], background: { mode: 0, color: { r: 0, g: 0, b: 0, a: 1 } } },
        entities: [],
        components: []
      }),
      "Probe.ts": source
    }
  };
  const storage = await RuntimeProjectStorage.open();
  try {
    await storage.save(id, pack);
  } finally {
    storage.close();
  }
  const project = await RuntimeProjectSession.open(id, pack.project, location.href, {
    scriptModules: fixtureModules
  });
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 16;
  document.body.append(canvas);
  const engine = await WebGLEngine.create({ canvas });
  let isolated: RuntimeProjectSession | undefined;
  try {
    const loaded = await project.scriptModules(["Probe.ts"], project.scriptEnvironment.externals);
    const Probe = (
      loaded.get("Probe.ts") as {
        default: typeof Script & (new (...args: any[]) => Script & { inspect(): Promise<any> });
      }
    ).default;
    const root = engine.sceneManager.activeScene!.createRootEntity("Native systems");
    const farm = root.addComponent(FarmingSystem);
    const house = root.addComponent(BuildingPartComponent);
    const wall = root.createChild("Wall").addComponent(BuildingPartComponent);
    const probe = root.addComponent(Probe);
    const result = await probe.inspect();
    const again = await project.scriptModules(["Probe.ts"], project.scriptEnvironment.externals);
    isolated = await RuntimeProjectSession.open(id, pack.project, location.href);
    let isolatedError = "";
    try {
      await isolated.compileScripts({ "Probe.ts": source });
    } catch (error) {
      isolatedError = String(error);
    }
    const checks = {
      farmIdentity: result.farm === farm,
      houseIdentity: result.house === house,
      wallIdentity: result.wall === wall,
      farmRead: Array.isArray(result.farms) && result.farms.length === 0,
      reusedModule: (again.get("Probe.ts") as { default: unknown }).default === Probe,
      unregisteredSessionRejected: isolatedError.includes("Cannot find module '@galacean/building-demo-systems'")
    };
    if (Object.values(checks).some((value) => !value)) throw new Error(JSON.stringify({ checks, isolatedError }));
    return checks;
  } finally {
    isolated?.dispose();
    project.dispose();
    engine.destroy();
    canvas.remove();
  }
}
