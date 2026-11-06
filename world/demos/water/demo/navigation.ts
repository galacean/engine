export type WaterRuntimeKind = "river" | "grasslands";

export type WaterDemoPreset = "hero-river" | "hero-grasslands";

export interface WaterSceneDefinition {
  readonly id: string;
  readonly label: string;
  readonly galleryPath: string;
  readonly intro: string;
  readonly runtime: WaterRuntimeKind;
  readonly preset: WaterDemoPreset;
}

export const WATER_SCENES = [
  {
    id: "showcase-grasslands-stylized-water",
    label: "湖泊",
    galleryPath: "water/lake",
    intro:
      "红点标出实际岸线。展开 Lake 可编辑湖盆与水位；景观显示“待更新”时，点击“重新生成景观”。修改 seed 可更换分布。也可开启 0.25／1／2 米水深标定。",
    runtime: "grasslands",
    preset: "hero-grasslands"
  },
  {
    id: "showcase-river",
    label: "河流",
    galleryPath: "water/river",
    intro: "光学标定、弯道、浅滩深池与桥岸遮挡；分别观察光学、水流和反射。",
    runtime: "river",
    preset: "hero-river"
  }
] as const satisfies readonly WaterSceneDefinition[];

export type WaterSceneId = (typeof WATER_SCENES)[number]["id"];

const DEFAULT_WATER_SCENE =
  WATER_SCENES.find(({ id }) => id === "showcase-grasslands-stylized-water") ?? WATER_SCENES[0];
const WATER_ROOT_MARKER = "/demos/water/";

function normalizeWaterRoot(url: URL): void {
  const rootIndex = url.pathname.indexOf(WATER_ROOT_MARKER);
  if (rootIndex >= 0) {
    url.pathname = url.pathname.slice(0, rootIndex + WATER_ROOT_MARKER.length);
  }
}

export function findWaterCase(sceneId: string): WaterSceneDefinition | undefined {
  return WATER_SCENES.find((item) => item.id === sceneId);
}

export function isWaterDeveloperMode(location: Pick<Location, "search">): boolean {
  const parameters = new URLSearchParams(location.search);
  return parameters.get("mode") === "dev" || parameters.get("dev") === "1";
}

export function resolveWaterCase(location: Pick<Location, "hash" | "search">): WaterSceneDefinition {
  const parameters = new URLSearchParams(location.search);
  const hashId = location.hash.replace(/^#/, "");
  const hashScene = findWaterCase(hashId);
  if (hashScene) return hashScene;

  const queryId = parameters.get("example") ?? "";
  const queryScene = findWaterCase(queryId);
  if (queryScene) return queryScene;

  return DEFAULT_WATER_SCENE;
}

export function getWaterCaseHref(currentHref: string, sceneId: string): string {
  const selectedScene = findWaterCase(sceneId) ?? DEFAULT_WATER_SCENE;
  const url = new URL(currentHref);
  const developerMode = isWaterDeveloperMode({ search: url.search });
  normalizeWaterRoot(url);
  url.searchParams.delete("example");
  url.searchParams.delete("dev");
  url.searchParams.delete("scenario");
  if (developerMode) {
    url.searchParams.set("mode", "dev");
  } else {
    url.searchParams.delete("mode");
  }
  url.hash = selectedScene.id;
  return url.href;
}
