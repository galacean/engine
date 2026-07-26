export type WaterDemoGroup = "showcase" | "feature" | "developer" | "docs";

export type WaterRuntimeKind =
  | "river"
  | "pool"
  | "ocean"
  | "heightfield"
  | "buoyancy"
  | "optics-lab"
  | "wiki"
  | "grasslands";

export type WaterDemoPreset =
  | "hero-river"
  | "hero-pool"
  | "hero-ocean"
  | "refraction-correctness"
  | "reflection-correctness"
  | "ripples"
  | "wake-foam"
  | "underwater"
  | "static-single"
  | "river-drift"
  | "gerstner-waves"
  | "ocean-nearshore-waves"
  | "ocean-breakers"
  | "ocean-shore-foam"
  | "ocean-rock-contact"
  | "ocean-micro-surface"
  | "ocean-wetness"
  | "shore-foam"
  | "heightfield"
  | "river-confluence"
  | "full-lab"
  | "p1-diagnostics"
  | "river-debug"
  | "ocean-lod-debug"
  | "hero-grasslands"
  | "default";

export interface WaterDemoCaseDefinition {
  readonly id: string;
  readonly label: string;
  readonly intro: string;
  readonly group: WaterDemoGroup;
  readonly runtime: WaterRuntimeKind;
  readonly preset: WaterDemoPreset;
  readonly legacyIds?: readonly string[];
  /**
   * Transitional source compatibility for the former navigation contract.
   * New routing must use `runtime`; canonical case definitions do not populate `kind`.
   */
  readonly kind?: WaterRuntimeKind;
}

export interface WaterDemoGroupDefinition {
  readonly id: WaterDemoGroup;
  readonly label: string;
  readonly public: boolean;
}

export interface MountWaterPcgNavigationOptions {
  readonly developerMode?: boolean;
  readonly currentHref?: string;
}

export const WATER_PCG_GROUPS: readonly WaterDemoGroupDefinition[] = [
  { id: "showcase", label: "场景展示", public: true },
  { id: "feature", label: "局部功能", public: true },
  { id: "developer", label: "开发验收", public: false },
  { id: "docs", label: "文档", public: false }
];

export const WATER_PCG_CASES = [
  {
    id: "showcase-river",
    label: "河流",
    intro: "山地高差、双支流汇流、局部流场、岸边泡沫与漂浮物。",
    group: "showcase",
    runtime: "river",
    preset: "hero-river",
    legacyIds: ["curved-main-river", "multi-tributary-river"]
  },
  {
    id: "showcase-pool",
    label: "泳池",
    intro: "High 折射与反射、交互波纹、浮力、时序泡沫和水下介质。",
    group: "showcase",
    runtime: "pool",
    preset: "hero-pool",
    legacyIds: ["indoor-reflective-pool", "p1-water-showcase"]
  },
  {
    id: "showcase-ocean",
    label: "海洋",
    intro: "写实海滩黄昏：近岸折射破碎、时序泡沫、礁石浪花、湿沙与金色高光。",
    group: "showcase",
    runtime: "ocean",
    preset: "hero-ocean"
  },
  {
    id: "feature-refraction",
    label: "折射",
    intro: "单独对比水面折射、深度连续性与屏幕边缘回退。",
    group: "feature",
    runtime: "optics-lab",
    preset: "refraction-correctness"
  },
  {
    id: "feature-reflection",
    label: "反射",
    intro: "单独对比 Sky、Probe 与 Planar 反射的选择和回退。",
    group: "feature",
    runtime: "optics-lab",
    preset: "reflection-correctness"
  },
  {
    id: "feature-ripples",
    label: "交互波纹",
    intro: "观察入水冲击、波纹传播、衰减和池壁反射。",
    group: "feature",
    runtime: "pool",
    preset: "ripples"
  },
  {
    id: "feature-wake-foam",
    label: "尾迹与泡沫",
    intro: "观察移动物体产生的方向性尾迹与时序泡沫。",
    group: "feature",
    runtime: "pool",
    preset: "wake-foam"
  },
  {
    id: "feature-underwater",
    label: "水下",
    intro: "观察入水判定、滞回和水面/水下共用的介质参数。",
    group: "feature",
    runtime: "pool",
    preset: "underwater"
  },
  {
    id: "feature-buoyancy",
    label: "浮力",
    intro: "观察重力入水、回弹与最终稳定漂浮。",
    group: "feature",
    runtime: "buoyancy",
    preset: "static-single",
    legacyIds: ["water-buoyancy"]
  },
  {
    id: "feature-current-drift",
    label: "水流漂移",
    intro: "隔离 Current 对漂浮物水平运动方向与速度的影响。",
    group: "feature",
    runtime: "buoyancy",
    preset: "river-drift"
  },
  {
    id: "feature-gerstner-waves",
    label: "Gerstner 波",
    intro: "隔离宏观波形、表面法线与查询结果的一致性。",
    group: "feature",
    runtime: "ocean",
    preset: "gerstner-waves"
  },
  {
    id: "feature-ocean-nearshore-waves",
    label: "Ocean 近岸波浪",
    intro: "隔离水深驱动的折射、转向、变陡与岸前衰减。",
    group: "feature",
    runtime: "ocean",
    preset: "ocean-nearshore-waves"
  },
  {
    id: "feature-ocean-breakers",
    label: "Ocean 破碎浪",
    intro: "隔离近岸破碎带、卷白和有限 Breaker 泡沫源。",
    group: "feature",
    runtime: "ocean",
    preset: "ocean-breakers"
  },
  {
    id: "feature-ocean-shore-foam",
    label: "Ocean 岸线泡沫",
    intro: "隔离动态水线、往复薄膜和可衰减岸线泡沫。",
    group: "feature",
    runtime: "ocean",
    preset: "ocean-shore-foam"
  },
  {
    id: "feature-ocean-rock-contact",
    label: "Ocean 礁石接触",
    intro: "隔离固定预算礁石接触、Impact 事件、泡沫与浪花粒子。",
    group: "feature",
    runtime: "ocean",
    preset: "ocean-rock-contact"
  },
  {
    id: "feature-ocean-micro-surface",
    label: "Ocean 微表面",
    intro: "隔离确定性微法线、粗糙度和黄昏太阳高光带。",
    group: "feature",
    runtime: "ocean",
    preset: "ocean-micro-surface"
  },
  {
    id: "feature-ocean-wetness",
    label: "Ocean 湿沙",
    intro: "隔离动态湿润范围、颜色变深和 PBR 粗糙度变化。",
    group: "feature",
    runtime: "ocean",
    preset: "ocean-wetness"
  },
  {
    id: "feature-shore-foam",
    label: "岸边泡沫",
    intro: "隔离岸线距离、流速与泡沫强度之间的关系。",
    group: "feature",
    runtime: "heightfield",
    preset: "shore-foam"
  },
  {
    id: "feature-heightfield",
    label: "高度场",
    intro: "验证 CPU 高度场与渲染、查询和浮力使用同一表面。",
    group: "feature",
    runtime: "heightfield",
    preset: "heightfield",
    legacyIds: ["heightfield-water"]
  },
  {
    id: "feature-river-confluence",
    label: "河流汇流",
    intro: "隔离多支流拓扑、流向与汇流口连续性。",
    group: "feature",
    runtime: "river",
    preset: "river-confluence"
  },
  {
    id: "showcase-grasslands-stylized-water",
    label: "Grasslands 风格化浅水（孵化）",
    intro: "确定性全湿 Heightfield 与 Grasslands 水材质机制的 M2A 开发直链入口。",
    group: "developer",
    runtime: "grasslands",
    preset: "hero-grasslands"
  },
  {
    id: "water-optics-lab",
    label: "光学验收实验室",
    intro: "Golden、跨水体矩阵、Planar owner 与生命周期验收。",
    group: "developer",
    runtime: "optics-lab",
    preset: "full-lab"
  },
  {
    id: "developer-pool-diagnostics",
    label: "泳池压力与纹理诊断",
    intro: "1/4/8/16 刚体、泡沫 Source/History/Final 与压力指标。",
    group: "developer",
    runtime: "pool",
    preset: "p1-diagnostics"
  },
  {
    id: "developer-river-debug",
    label: "河流编译与拓扑诊断",
    intro: "River Debug Session、网络拓扑、查询与编译诊断。",
    group: "developer",
    runtime: "river",
    preset: "river-debug"
  },
  {
    id: "developer-ocean-lod",
    label: "海洋 LOD 与资源诊断",
    intro: "Ocean Rings、LOD、反射服务与资源生命周期指标。",
    group: "developer",
    runtime: "ocean",
    preset: "ocean-lod-debug"
  },
  {
    id: "water-wiki",
    label: "开发文档",
    intro: "Water PCG 架构、能力边界、调试方式与验收说明。",
    group: "docs",
    runtime: "wiki",
    preset: "default"
  }
] as const satisfies readonly WaterDemoCaseDefinition[];

export type WaterDemoCaseId = (typeof WATER_PCG_CASES)[number]["id"];

export const WATER_PCG_DEFAULT_CASE_IDS = [
  "showcase-river",
  "feature-refraction",
  "feature-reflection"
] as const satisfies readonly WaterDemoCaseId[];

export const WATER_PCG_LEGACY_ALIASES = Object.freeze({
  "curved-main-river": "showcase-river",
  "multi-tributary-river": "showcase-river",
  "indoor-reflective-pool": "showcase-pool",
  "p1-water-showcase": "showcase-pool",
  "heightfield-water": "feature-heightfield",
  "water-buoyancy": "feature-buoyancy"
} as const satisfies Readonly<Record<string, WaterDemoCaseId>>);

export const WATER_PCG_PUBLIC_CASES = WATER_PCG_CASES.filter(
  ({ group }) => group === "showcase" || group === "feature"
);

const WATER_PCG_DEFAULT_CASE_ID_SET = new Set<string>(WATER_PCG_DEFAULT_CASE_IDS);
const DEFAULT_WATER_PCG_CASE = WATER_PCG_CASES[0];
const WATER_PCG_ROOT_MARKER = "/demos/water-pcg/";

function getLegacyTarget(caseId: string): WaterDemoCaseDefinition | undefined {
  const targetId = WATER_PCG_LEGACY_ALIASES[caseId as keyof typeof WATER_PCG_LEGACY_ALIASES];
  return targetId ? findWaterPcgCase(targetId) : undefined;
}

function resolveCandidate(caseId: string, legacyOceanMode: boolean): WaterDemoCaseDefinition | undefined {
  const canonical = findWaterPcgCase(caseId);
  if (canonical) return canonical;
  const legacy = getLegacyTarget(caseId);
  if (legacyOceanMode && legacy?.runtime === "river") return findWaterPcgCase("showcase-ocean");
  return legacy;
}

export function findWaterPcgCase(caseId: string): WaterDemoCaseDefinition | undefined {
  return WATER_PCG_CASES.find((item) => item.id === caseId);
}

export function isWaterPcgDeveloperMode(location: Pick<Location, "search">): boolean {
  const parameters = new URLSearchParams(location.search);
  return parameters.get("mode") === "dev" || parameters.get("dev") === "1";
}

export function resolveWaterPcgCase(location: Pick<Location, "hash" | "search">): WaterDemoCaseDefinition {
  const parameters = new URLSearchParams(location.search);
  const legacyOceanMode = parameters.get("mode") === "ocean";
  const hashId = location.hash.replace(/^#/, "");
  const hashCase = resolveCandidate(hashId, legacyOceanMode);
  if (hashCase) return hashCase;

  const queryId = parameters.get("example") ?? "";
  const queryCase = resolveCandidate(queryId, legacyOceanMode);
  if (queryCase) return queryCase;

  if (legacyOceanMode) return findWaterPcgCase("showcase-ocean") ?? DEFAULT_WATER_PCG_CASE;
  return DEFAULT_WATER_PCG_CASE;
}

export function getVisibleWaterPcgCases(
  activeCaseId: string,
  developerMode = false
): readonly WaterDemoCaseDefinition[] {
  if (developerMode) return WATER_PCG_CASES;
  return WATER_PCG_CASES.filter(({ id }) => WATER_PCG_DEFAULT_CASE_ID_SET.has(id) || id === activeCaseId);
}

export function getWaterPcgCaseHref(currentHref: string, caseId: string): string {
  const selectedCase = findWaterPcgCase(caseId) ?? getLegacyTarget(caseId) ?? DEFAULT_WATER_PCG_CASE;
  const url = new URL(currentHref);
  const developerMode = isWaterPcgDeveloperMode({ search: url.search });
  const rootIndex = url.pathname.indexOf(WATER_PCG_ROOT_MARKER);
  if (rootIndex >= 0) {
    url.pathname = url.pathname.slice(0, rootIndex + WATER_PCG_ROOT_MARKER.length);
  }
  url.searchParams.delete("example");
  url.searchParams.delete("dev");
  if (developerMode) {
    url.searchParams.set("mode", "dev");
  } else {
    url.searchParams.delete("mode");
  }
  if (selectedCase.runtime !== "wiki") url.searchParams.delete("doc");
  url.hash = selectedCase.id;
  return url.href;
}

export function mountWaterPcgNavigation(
  container: HTMLElement,
  activeCaseId: string,
  options: MountWaterPcgNavigationOptions = {}
): void {
  const currentHref = options.currentHref ?? window.location.href;
  const visibleCases = getVisibleWaterPcgCases(activeCaseId, options.developerMode);
  const groupElements: HTMLElement[] = [];

  for (const groupDefinition of WATER_PCG_GROUPS) {
    const groupCases = visibleCases.filter(({ group }) => group === groupDefinition.id);
    if (groupCases.length === 0) continue;

    const group = document.createElement("section");
    group.className = "example-group";
    group.dataset.caseGroup = groupDefinition.id;
    group.setAttribute("aria-label", groupDefinition.label);

    const label = document.createElement("span");
    label.className = "example-group-label";
    label.textContent = groupDefinition.label;

    const links = document.createElement("div");
    links.className = "example-group-links";
    for (const item of groupCases) {
      const link = document.createElement("a");
      link.className = "example-tab";
      link.href = getWaterPcgCaseHref(currentHref, item.id);
      link.textContent = item.label;
      link.dataset.caseId = item.id;
      link.dataset.caseGroup = item.group;
      link.dataset.caseRuntime = item.runtime;
      link.dataset.casePreset = item.preset;
      links.append(link);
    }

    group.append(label, links);
    groupElements.push(group);
  }

  container.replaceChildren(...groupElements);
  syncWaterPcgNavigation(container, activeCaseId);
}

export function syncWaterPcgNavigation(container: HTMLElement, activeCaseId: string): void {
  for (const element of container.querySelectorAll<HTMLElement>("[data-case-id]")) {
    const active = element.dataset.caseId === activeCaseId;
    element.classList.toggle("is-active", active);
    if (active) {
      element.setAttribute("aria-current", "page");
    } else {
      element.removeAttribute("aria-current");
    }
  }
}
