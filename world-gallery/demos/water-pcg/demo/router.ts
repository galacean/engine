import {
  getWaterPcgCaseHref,
  isWaterPcgDeveloperMode,
  mountWaterPcgNavigation,
  resolveWaterPcgCase,
  syncWaterPcgNavigation,
  type WaterRuntimeKind
} from "./navigation";
import { mountFeatureCaseComparison } from "./showcase/FeatureCaseComparison";
import { isShowcaseAutomation } from "./showcase/ShowcaseCameraPolicy";

const exampleBar = document.getElementById("example-bar");
const view = document.getElementById("water-pcg-view");
const caseIntro = document.getElementById("case-intro");
const caseIntroTitle = document.getElementById("case-intro-title");
const caseIntroText = document.getElementById("case-intro-text");

if (
  !(exampleBar instanceof HTMLElement) ||
  !(view instanceof HTMLElement) ||
  !(caseIntro instanceof HTMLElement) ||
  !(caseIntroTitle instanceof HTMLElement) ||
  !(caseIntroText instanceof HTMLElement)
) {
  throw new Error("Water PCG shell is incomplete.");
}

const runtimeTemplateIds = {
  river: "water-pcg-river-template",
  pool: "water-pcg-interactive-pool-template",
  ocean: "water-pcg-ocean-template",
  heightfield: "water-pcg-heightfield-template",
  buoyancy: "water-pcg-buoyancy-template",
  "optics-lab": "water-pcg-optics-lab-template",
  wiki: "water-pcg-wiki-template"
} as const satisfies Readonly<Record<WaterRuntimeKind, string>>;

const runtimeLoaders = {
  river: () => import("./main"),
  pool: () => import("./pool/main"),
  ocean: () => import("./ocean/main"),
  heightfield: () => import("./heightfield/main"),
  buoyancy: () => import("./buoyancy/main"),
  "optics-lab": () => import("./examples/water-optics-lab/main"),
  wiki: () => import("./wiki/main")
} as const satisfies Readonly<Record<WaterRuntimeKind, () => Promise<unknown>>>;

const activeCase = resolveWaterPcgCase(window.location);
let activeCaseId = activeCase.id;
const developerMode = isWaterPcgDeveloperMode(window.location);
const interactiveShowcase =
  activeCase.group === "showcase" && !isShowcaseAutomation(new URLSearchParams(window.location.search));
const developerFeaturesEnabled =
  developerMode || interactiveShowcase || activeCase.group === "developer" || activeCase.group === "docs";
const showcaseCameraHint = "WASD 移动，按住鼠标拖动视角。";

document.documentElement.dataset.waterPcgCase = activeCase.id;
document.documentElement.dataset.waterPcgGroup = activeCase.group;
document.documentElement.dataset.waterPcgRuntime = activeCase.runtime;
document.documentElement.dataset.waterPcgPreset = activeCase.preset;
document.documentElement.dataset.waterPcgDev = String(developerMode);
document.documentElement.dataset.waterPcgDeveloperTools = String(developerFeaturesEnabled);
document.documentElement.dataset.waterPcgDebugPanels = "visible";
// Temporary CSS compatibility for the former single-axis navigation contract.
document.documentElement.dataset.waterPcgKind = activeCase.runtime;
document.title = `Water PCG · ${activeCase.label}`;

caseIntro.dataset.caseGroup = activeCase.group;
caseIntroTitle.textContent = activeCase.label;
caseIntroText.textContent = interactiveShowcase ? `${activeCase.intro}${showcaseCameraHint}` : activeCase.intro;

mountWaterPcgNavigation(exampleBar, activeCase.id, { developerMode });

const canonicalHref = getWaterPcgCaseHref(window.location.href, activeCase.id);
if (window.location.href !== canonicalHref) {
  window.history.replaceState(null, "", canonicalHref);
}

function notifyGallery(caseId: string): void {
  if (window.parent === window) return;
  window.parent.postMessage(
    { type: "world-gallery:navigate", path: "water-pcg", hash: caseId },
    window.location.origin
  );
}

notifyGallery(activeCase.id);

const templateId = runtimeTemplateIds[activeCase.runtime];
const template = document.getElementById(templateId);
if (!(template instanceof HTMLTemplateElement)) {
  throw new Error(`Water PCG ${activeCase.runtime} template is missing.`);
}
view.appendChild(template.content.cloneNode(true));

window.addEventListener("hashchange", () => {
  const nextCase = resolveWaterPcgCase(window.location);
  const nextCanonicalHref = getWaterPcgCaseHref(window.location.href, nextCase.id);
  if (window.location.href !== nextCanonicalHref) {
    window.history.replaceState(null, "", nextCanonicalHref);
  }
  syncWaterPcgNavigation(exampleBar, nextCase.id);
  notifyGallery(nextCase.id);

  // Every case owns a complete preset lifecycle. Reload even when the next case
  // shares a Runtime so no simulation, reflection, foam, or post-process state
  // can leak across presets.
  if (nextCase.id !== activeCaseId) {
    activeCaseId = nextCase.id;
    window.location.reload();
  }
});

void runtimeLoaders[activeCase.runtime]().then(() => {
  const unmountFeatureComparison = mountFeatureCaseComparison();
  window.addEventListener("beforeunload", unmountFeatureComparison, { once: true });
});
