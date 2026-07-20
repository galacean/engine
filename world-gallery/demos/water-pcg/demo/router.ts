import {
  getWaterPcgCaseHref,
  mountWaterPcgNavigation,
  resolveWaterPcgCase,
  syncWaterPcgNavigation,
  type WaterPcgCaseKind
} from "./navigation";

const exampleBar = document.getElementById("example-bar");
const view = document.getElementById("water-pcg-view");

if (!(exampleBar instanceof HTMLElement) || !(view instanceof HTMLElement)) {
  throw new Error("Water PCG shell is incomplete.");
}

const activeCase = resolveWaterPcgCase(window.location);
let activeKind: WaterPcgCaseKind = activeCase.kind;
document.documentElement.dataset.waterPcgCase = activeCase.id;
document.documentElement.dataset.waterPcgKind = activeCase.kind;
document.title = `Water PCG · ${activeCase.label}`;
mountWaterPcgNavigation(exampleBar, activeCase.id);

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

const template = document.getElementById(`water-pcg-${activeCase.kind}-template`);
if (!(template instanceof HTMLTemplateElement)) {
  throw new Error(`Water PCG ${activeCase.kind} template is missing.`);
}
view.appendChild(template.content.cloneNode(true));

window.addEventListener("hashchange", () => {
  const nextCase = resolveWaterPcgCase(window.location);
  syncWaterPcgNavigation(exampleBar, nextCase.id);
  notifyGallery(nextCase.id);
  if (nextCase.kind !== activeKind) {
    activeKind = nextCase.kind;
    window.location.reload();
  }
});

switch (activeCase.kind) {
  case "heightfield":
    void import("./heightfield/main");
    break;
  case "buoyancy":
    void import("./buoyancy/main");
    break;
  default:
    void import("./main");
}
