export type WaterPcgCaseKind = "river" | "heightfield" | "buoyancy" | "interactive-pool" | "wiki";

export interface WaterPcgCaseNavigationItem {
  readonly id: string;
  readonly label: string;
  readonly kind: WaterPcgCaseKind;
}

export const WATER_PCG_CASES: readonly WaterPcgCaseNavigationItem[] = [
  { id: "curved-main-river", label: "高差河流", kind: "river" },
  { id: "multi-tributary-river", label: "双支流汇流", kind: "river" },
  { id: "indoor-reflective-pool", label: "交互式泳池", kind: "interactive-pool" },
  { id: "heightfield-water", label: "高度场水面", kind: "heightfield" },
  { id: "water-buoyancy", label: "水浮力与水流", kind: "buoyancy" },
  { id: "water-wiki", label: "开发文档", kind: "wiki" }
];

const DEFAULT_WATER_PCG_CASE = WATER_PCG_CASES[0];
const WATER_PCG_ROOT_MARKER = "/demos/water-pcg/";

export function findWaterPcgCase(caseId: string): WaterPcgCaseNavigationItem | undefined {
  return WATER_PCG_CASES.find((item) => item.id === caseId);
}

export function resolveWaterPcgCase(location: Pick<Location, "hash" | "search">): WaterPcgCaseNavigationItem {
  const hashCase = findWaterPcgCase(location.hash.replace(/^#/, ""));
  if (hashCase) return hashCase;

  const legacyCase = findWaterPcgCase(new URLSearchParams(location.search).get("example") ?? "");
  return legacyCase ?? DEFAULT_WATER_PCG_CASE;
}

export function getWaterPcgCaseHref(currentHref: string, caseId: string): string {
  const selectedCase = findWaterPcgCase(caseId) ?? DEFAULT_WATER_PCG_CASE;
  const url = new URL(currentHref);
  const rootIndex = url.pathname.indexOf(WATER_PCG_ROOT_MARKER);
  if (rootIndex >= 0) {
    url.pathname = url.pathname.slice(0, rootIndex + WATER_PCG_ROOT_MARKER.length);
  }
  url.searchParams.delete("example");
  if (selectedCase.kind !== "wiki") url.searchParams.delete("doc");
  url.hash = selectedCase.id;
  return url.href;
}

export function mountWaterPcgNavigation(container: HTMLElement, activeCaseId: string): void {
  container.replaceChildren(
    ...WATER_PCG_CASES.map((item) => {
      const link = document.createElement("a");
      link.className = "example-tab";
      link.href = getWaterPcgCaseHref(window.location.href, item.id);
      link.textContent = item.label;
      link.dataset.caseId = item.id;
      link.dataset.caseKind = item.kind;
      link.setAttribute("role", "tab");
      return link;
    })
  );
  syncWaterPcgNavigation(container, activeCaseId);
}

export function syncWaterPcgNavigation(container: HTMLElement, activeCaseId: string): void {
  for (const element of container.querySelectorAll<HTMLElement>("[data-case-id]")) {
    const active = element.dataset.caseId === activeCaseId;
    element.classList.toggle("is-active", active);
    element.setAttribute("aria-selected", active ? "true" : "false");
    if (active) {
      element.setAttribute("aria-current", "page");
    } else {
      element.removeAttribute("aria-current");
    }
  }
}
