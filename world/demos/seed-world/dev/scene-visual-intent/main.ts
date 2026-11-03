import { mountSeedWorldDemo } from "../../SeedWorldDemo.ts";
import { loadPlanningWorldSource } from "../../src/planning/spatial/runtime/PlanningWorldSource.ts";
import { SEED_WORLD_MODEL } from "../../assistant/SeedWorldModel.ts";
import { SceneVisualIntentController } from "./SceneVisualIntentController.ts";
import { createSceneGenerationSession } from "./SceneVisualIntentGeneration.ts";
import { mountSceneVisualIntentPage } from "./SceneVisualIntentPage.ts";
import "../../styles.css";
import "./styles.css";

const host = document.getElementById("app")!;
document.body.dataset.mode = "world";
document.body.dataset.pageMode = "generation";
let source: Awaited<ReturnType<typeof loadPlanningWorldSource>> | undefined;
let disposed = false;
const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
const controller = new SceneVisualIntentController(async () => {
  // Saved worlds never become the baseline of this first-generation test.
  source = await loadPlanningWorldSource(location.search, undefined, { load: async () => undefined, save: async () => {} });
  if (disposed) { source.dispose(); throw new Error("页面已关闭。"); }
  return createSceneGenerationSession(source.session, async handoff => {
    document.body.dataset.pageMode = "runtime";
    await mountSeedWorldDemo(handoff, { showAssistant: false, persistPlayerState: false });
    controller.markSceneReady();
  }, () => window.innerWidth / window.innerHeight);
}, {
  model: SEED_WORLD_MODEL,
  debugMode: true,
  ...(local ? { localAsapOrigin: "http://127.0.0.1:8082", modelTimeoutMs: 60_000 } : {})
}, event => {
  if (event.type === "tool_started" && ["world.parameters.apply", "scene.generate"].includes(event.tool))
    console.info("[scene-visual-intent] request", event.tool, JSON.stringify(event.input));
  if (event.type === "tool_finished") console.info("[scene-visual-intent] tool", event.tool,
    ["scene.generate", "world.parameters.apply"].includes(event.tool) ? JSON.stringify(event.result) : "finished");
  if (event.type === "generation_model_finished") console.info("[scene-visual-intent] model", JSON.stringify({
    traceId: event.traceId, model: event.model, durationMilliseconds: event.durationMilliseconds
  }));
});
const page = mountSceneVisualIntentPage(host, controller);
window.addEventListener("pagehide", () => { disposed = true; controller.dispose(); page.dispose(); source?.dispose(); }, { once: true });
