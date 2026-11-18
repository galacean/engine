import { PlanningProjectStorage, PLANNING_PROJECT_PATH } from "../../demos/seed-world/src/planning/spatial/runtime/PlanningProjectStorage";
import { RUNTIME_PROJECT_SAVE_VERSION, validateRuntimeProject, type RuntimeProjectPackage } from "@galacean/engine-project/runtime-editor/project/runtime-project.ts";

/** In-memory project publisher; exercises the production planning storage and package validation. */
export function planningProjectFixture() {
  const project = {
    projectPackage: { version: RUNTIME_PROJECT_SAVE_VERSION,
      project: { scene: "Scene.json", files: [{  virtualPath: "Scene.json", path: "scene.json", type: "Scene" }] },
      contents: { "Scene.json": "{}" } } as RuntimeProjectPackage,
    async publish(candidate: RuntimeProjectPackage) { validateRuntimeProject(candidate); this.projectPackage = structuredClone(candidate); return []; }
  };
  return { project, store: new PlanningProjectStorage(project),
    setRaw(raw: string) { project.projectPackage.contents[PLANNING_PROJECT_PATH] = raw; },
    getRaw() { return project.projectPackage.contents[PLANNING_PROJECT_PATH] as string; }
  };
}
