import {
  findWaterCase,
  getWaterCaseHref,
  isWaterDeveloperMode,
  resolveWaterCase,
  type WaterRuntimeKind
} from "./navigation.ts";
import { isShowcaseAutomation } from "./showcase/ShowcaseCameraPolicy.ts";

const view = document.getElementById("water-pcg-view");
const caseIntro = document.getElementById("case-intro");
const caseIntroTitle = document.getElementById("case-intro-title");
const caseIntroText = document.getElementById("case-intro-text");

if (
  !(view instanceof HTMLElement) ||
  !(caseIntro instanceof HTMLElement) ||
  !(caseIntroTitle instanceof HTMLElement) ||
  !(caseIntroText instanceof HTMLElement)
) {
  throw new Error("Water shell is incomplete.");
}

const runtimeTemplateIds = {
  river: "water-pcg-river-template",
  grasslands: "water-pcg-grasslands-template"
} as const satisfies Readonly<Record<WaterRuntimeKind, string>>;

const runtimeLoaders = {
  river: () => import("./main.ts"),
  grasslands: () => import("./grasslands/main.ts")
} as const satisfies Readonly<Record<WaterRuntimeKind, () => Promise<unknown>>>;

function notifyGallery(sceneId: string): void {
  if (window.parent === window) return;
  window.parent.postMessage(
    { type: "world-gallery:navigate", path: findWaterCase(sceneId)!.galleryPath, hash: "" },
    window.location.origin
  );
}

const developerMode = isWaterDeveloperMode(window.location);
const activeScene = resolveWaterCase(window.location);

let activeSceneId = activeScene.id;
const interactiveShowcase = !isShowcaseAutomation(new URLSearchParams(window.location.search));
const developerFeaturesEnabled = developerMode || interactiveShowcase;
const showcaseCameraHint = "点击画面后，WASD 移动，Q/E 下降／上升，拖动查看方向。";

document.documentElement.dataset.waterPcgCase = activeScene.id;
document.documentElement.dataset.waterPcgGroup = "scene";
document.documentElement.dataset.waterPcgRuntime = activeScene.runtime;
document.documentElement.dataset.waterPcgPreset = activeScene.preset;
document.documentElement.dataset.waterPcgDev = String(developerMode);
document.documentElement.dataset.waterPcgDeveloperTools = String(developerFeaturesEnabled);
document.documentElement.dataset.waterPcgDebugPanels = "visible";
document.documentElement.dataset.waterPcgKind = activeScene.runtime;
document.title = `Water · ${activeScene.label}`;

caseIntro.dataset.caseGroup = "scene";
caseIntroTitle.textContent = activeScene.label;
caseIntroText.textContent = interactiveShowcase ? `${activeScene.intro}${showcaseCameraHint}` : activeScene.intro;

const canonicalHref = getWaterCaseHref(window.location.href, activeScene.id);
if (window.location.href !== canonicalHref) {
  window.history.replaceState(null, "", canonicalHref);
}

notifyGallery(activeScene.id);

const templateId = runtimeTemplateIds[activeScene.runtime];
const template = document.getElementById(templateId);
if (!(template instanceof HTMLTemplateElement)) {
  throw new Error(`Water ${activeScene.runtime} template is missing.`);
}
view.appendChild(template.content.cloneNode(true));

window.addEventListener("hashchange", () => {
  const nextScene = resolveWaterCase(window.location);
  const nextCanonicalHref = getWaterCaseHref(window.location.href, nextScene.id);
  if (window.location.href !== nextCanonicalHref) {
    window.history.replaceState(null, "", nextCanonicalHref);
  }
  notifyGallery(nextScene.id);

  if (nextScene.id !== activeSceneId) {
    activeSceneId = nextScene.id;
    window.location.reload();
  }
});

void runtimeLoaders[activeScene.runtime]();
