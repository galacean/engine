// Acceptance page: online houses next to core houses, as resident detail or as the distance
// view (`view=far`). Validation only; it goes away with the online path.
import {
  AssetType,
  Camera,
  Color,
  DirectLight,
  Vector3,
  WebGLEngine,
  WebGLMode,
  type PrefabResource,
  type Scene
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import {
  RuntimeProjectStorage,
  RUNTIME_PROJECT_SAVE_VERSION,
  type RuntimeProjectPackage
} from "@galacean/engine-project/runtime-editor/project/runtime-project";
import {
  registerBuildingAssetComponents,
  buildingAssets
} from "@galacean/engine-building/building/resources/BuildingAssetKit";
import {
  builtinBuildingAssetFiles,
  BUILTIN_BUILDING_ASSETS
} from "@galacean/engine-building/building/resources/BuiltinBuildingAssets";
import { European } from "@galacean/engine-building/building/parts/architecture/European";
import { designBuilding } from "@galacean/engine-building/building/parts/architecture/BuildingDesign";
import { implementBuilding } from "@galacean/engine-building/building/parts/architecture/BuildingImplementation";
import { renderBuilding } from "@galacean/engine-building/building/parts/architecture/BuildingRender";
import { createBuildingRegistry, designBuildingCore } from "@galacean/engine-building/building/core/index";
import { registerHouseTypes } from "@galacean/engine-building/building/partTypes/House";
import { buildCoreHouses, type CoreHouseParameters } from "@galacean/engine-building/building/application/CoreEuropean";
import {
  compileCoreBuilding,
  coreBuildingEnvironment,
  prepareCoreBuilding
} from "@galacean/engine-building/building/render/CoreBuilding";
import { constructionDecorationType } from "@galacean/engine-building/building/runtime/ConstructionDecorationCatalog";
import { constructionDecorationRecipe } from "@galacean/engine-building/building/runtime/ConstructionDecorationRecipe";
import {
  planFacadeDecorations,
  normalizeDecorationPlan
} from "@galacean/engine-building/building/runtime/DecorationPlan";
import { normalizeProfileRoof } from "@galacean/engine-building/building/runtime/ProfileParameters";
import { isFlatRoofHeight } from "@galacean/engine-building/building/runtime/RoofMode";
import {
  buildingPreviewInput,
  prepareBuildingPublication
} from "@galacean/engine-building/building/parts/architecture/BuildingPublication";
import { buildingPalette } from "@galacean/engine-building/building/parts/architecture/BuildingPalette";
import { profilePreview } from "@galacean/engine-building/building/runtime/ProfilePreview";
import { createBuildingDistanceView } from "@galacean/engine-building/building/runtime/BuildingDistanceView";
import type { Entity } from "@galacean/engine";

registerBuildingAssetComponents();
type Ground = (x: number, z: number) => number;
const flat: Ground = () => 0;
const hills: Ground = (x, z) => 0.35 * Math.sin(0.6 * x + 0.3) + 0.2 * Math.cos(0.45 * z);
const slope: Ground = (x, z) => 0.12 * x + 0.04 * z;
interface Case {
  id: string;
  title: string;
  house: CoreHouseParameters;
  /** Further houses in the same draft, such as a neighbour the house touches. */
  others?: CoreHouseParameters[];
  /** Online parameters the core expresses differently. */
  online?: Record<string, unknown>;
  ground: Ground;
}
/** The facade the initial village plans for a house: windows, a door and a wall lamp. */
function withFacade(house: CoreHouseParameters): CoreHouseParameters {
  const roof = normalizeProfileRoof(house.roof ?? {});
  const planned = normalizeDecorationPlan(
    planFacadeDecorations({ ...house, roof, wallStructure: "masonry" } as never),
    isFlatRoofHeight(roof.height)
  );
  return { ...house, attachments: planned as never };
}
/** Gothic windows and doors and arrow slits at their original sizes. */
function withStone(house: CoreHouseParameters, frameMaterial?: "wall"): CoreHouseParameters {
  const at = (id: string, kind: string, type: string, rank: number, u: number, bottom: number) => {
    const size = constructionDecorationType(library.compilation.decorations, type)!.dimensions.find(
      (d) => d.rank === rank
    )!;
    return {
      id,
      kind,
      type,
      rank,
      u,
      bottom,
      width: size.width,
      height: size.height,
      ...(frameMaterial && kind === "window" && { frameMaterial })
    };
  };
  return {
    ...house,
    attachments: [
      at("g1", "window", "window-gothic", 1, 0.06, 1.2),
      at("g2", "window", "window-gothic", 2, 0.19, 1.1),
      at("g3", "window", "window-gothic", 3, 0.31, 0.6),
      at("d1", "door", "door-gothic", 1, 0.44, 0),
      at("d3", "door", "door-gothic", 3, 0.56, 0),
      at("a1", "window", "window-arrow-slit", 1, 0.68, 1.6),
      at("a2", "window", "window-arrow-slit", 2, 0.78, 1),
      at("a3", "window", "window-arrow-slit", 3, 0.9, 0.8)
    ] as never
  };
}
/** Gothic dormers at their original sizes, at footprint uv positions. */
function withDormers(house: CoreHouseParameters, at: [number, number, 1 | 2 | 3][]): CoreHouseParameters {
  return {
    ...house,
    roofAttachments: at.map(([u, v, rank], i) => {
      const [width, height] = constructionDecorationRecipe(
        library.compilation.decorations,
        "dormer-gothic",
        rank
      )!.installationSize;
      return { id: "dormer" + i, type: "dormer-gothic" as const, rank, uv: [u, v], bottom: 0, width, height };
    })
  };
}
/** Eave windows at their original sizes, with 40% of their height above the wall top. */
function withEave(house: CoreHouseParameters, at: [string, number, number][]): CoreHouseParameters {
  return {
    ...house,
    attachments: at.map(([type, rank, u], i) => {
      const size = constructionDecorationType(library.compilation.decorations, type)!.dimensions.find(
        (d) => d.rank === rank
      )!;
      return {
        id: "eave" + i,
        kind: "window",
        type,
        rank,
        u,
        bottom: (house.height ?? 4) - size.height * 0.6,
        width: size.width,
        height: size.height
      };
    }) as never
  };
}
/** Cases read the asset library, so they are built once it is loaded. */
const cases = (): Case[] => [
  { id: "house", title: "默认房屋", house: { id: "a" }, ground: flat },
  { id: "tall", title: "高房屋 9 米", house: { id: "a", height: 9 }, ground: flat },
  {
    id: "floors",
    title: "腰线 · 三层",
    house: {
      id: "a",
      height: 9,
      rectangle: { center: [0, 0], size: [9, 6], rotation: 0 },
      floors: { enabled: true, interval: 3 }
    },
    ground: flat
  },
  {
    id: "plaster",
    title: "抹灰 · 腰线",
    house: {
      id: "a",
      height: 7,
      plaster: { enabled: true, wear: 0.35, color: 3 },
      floors: { enabled: true, interval: 3.5 }
    },
    ground: flat
  },
  {
    id: "plaster-round",
    title: "抹灰 · 圆形平屋顶",
    house: {
      id: "a",
      height: 6,
      circle: { center: [0, 0], radius: 3, phase: 0 },
      roof: { height: 0 },
      plaster: { enabled: true, wear: 0.5, color: 5 }
    },
    ground: flat
  },
  {
    id: "village",
    title: "村庄房屋 · 门窗",
    house: withFacade({
      id: "a",
      seed: 12345,
      height: 5,
      wallColor: 1,
      woodColor: 2,
      rectangle: { center: [0, 0], size: [9, 6], rotation: 0 },
      roof: { profile: 0.5, height: 0.35, ridge_length: 0.6, eave: 0.3, color: 1 },
      plaster: { enabled: true, wear: 0.35, color: 3 },
      floors: { enabled: true, interval: 3.5 }
    }),
    ground: flat
  },
  {
    id: "stone-openings",
    title: "尖拱窗 · 尖拱门 · 箭缝窗",
    house: withStone({
      id: "a",
      seed: 7,
      height: 5,
      rectangle: { center: [0, 0], size: [10, 10], rotation: 0 }
    }),
    ground: flat
  },
  {
    id: "stone-round",
    title: "圆墙 · 尖拱窗和箭缝窗",
    house: withStone({ id: "a", seed: 7, height: 5, circle: { center: [0, 0], radius: 6 } }),
    ground: flat
  },
  {
    id: "pair",
    title: "相交的两栋房屋",
    house: { id: "a", seed: 3, height: 4, rectangle: { center: [-1.5, 0], size: [7, 5], rotation: 0 } },
    others: [
      {
        id: "b",
        seed: 9,
        height: 5.5,
        rectangle: { center: [3, 0], size: [4, 9], rotation: 0.3 },
        roof: { ridge_length: 1 }
      }
    ],
    ground: flat
  },
  {
    id: "pair-flat",
    title: "相交的平顶与圆塔",
    house: {
      id: "a",
      seed: 3,
      height: 4,
      rectangle: { center: [-1.5, 0], size: [7, 5], rotation: 0 },
      roof: { height: 0 }
    },
    others: [{ id: "b", seed: 9, height: 6, circle: { center: [2.5, 1], radius: 2.5, phase: 0 }, roof: { height: 0 } }],
    ground: flat
  },
  {
    id: "pair-level",
    title: "等高的两个平顶",
    house: {
      id: "a",
      seed: 3,
      height: 4,
      rectangle: { center: [-1.5, 0], size: [7, 5], rotation: 0 },
      roof: { height: 0 }
    },
    others: [
      {
        id: "b",
        seed: 9,
        height: 4.5,
        rectangle: { center: [2.5, 1.5], size: [5, 6], rotation: 0.5 },
        roof: { height: 0 }
      }
    ],
    ground: flat
  },
  {
    id: "pair-mixed",
    title: "平顶与坡顶相交",
    house: {
      id: "a",
      seed: 3,
      height: 4,
      rectangle: { center: [-1.5, 0], size: [7, 5], rotation: 0 },
      roof: { height: 0 }
    },
    others: [{ id: "b", seed: 9, height: 4, rectangle: { center: [2.5, 1.5], size: [5, 6], rotation: 0.5 } }],
    ground: flat
  },
  {
    id: "round-facade",
    title: "圆屋 · 门窗",
    house: withFacade({
      id: "a",
      seed: 5,
      height: 4,
      circle: { center: [0, 0], radius: 3.5, phase: 0.4 },
      plaster: { enabled: true, wear: 0.35, color: 4 }
    }),
    ground: flat
  },
  {
    id: "dormers",
    title: "老虎窗 · 四坡",
    house: withDormers(
      { id: "a", height: 4, rectangle: { center: [0, 0], size: [10, 8], rotation: 0 }, roof: { height: 0.6 } },
      [
        [0.25, 0.2, 1],
        [0.55, 0.2, 2],
        [0.5, 0.82, 3],
        [0.85, 0.5, 2]
      ]
    ),
    ground: flat
  },
  {
    id: "dormers-gable",
    title: "老虎窗 · 山墙",
    house: withDormers(
      {
        id: "a",
        height: 4,
        rectangle: { center: [0, 0], size: [9, 7], rotation: 0.4 },
        roof: { height: 0.55, ridge_length: 1 }
      },
      [
        [0.3, 0.25, 2],
        [0.7, 0.25, 1]
      ]
    ),
    ground: flat
  },
  {
    id: "dormer-round",
    title: "老虎窗 · 圆屋（内置预设）",
    house: withDormers(
      {
        id: "a",
        seed: 1,
        height: 3.125,
        circle: { center: [0, 0], radius: 2.4, phase: 0 },
        roof: { tip: [0, 0], profile: 0, height: 0.35, ridge_length: 0.6, eave: 0.3, ridge_direction: 0, flat_rim: 0 }
      },
      [[0.012081486496702987, 0.6565982408069662, 2]]
    ),
    ground: flat
  },
  {
    id: "cottage-dormers",
    title: "Cottage 老虎窗 · 四坡",
    house: {
      id: "a",
      height: 4,
      rectangle: { center: [0, 0], size: [10, 8], rotation: 0 },
      roof: { height: 0.6 },
      roofAttachments: (
        [
          ["c1", 1, [0.25, 0.2]],
          ["c2", 2, [0.6, 0.2]]
        ] as const
      ).map(([id, rank, uv]) => {
        const [width, height] = constructionDecorationRecipe(
          library.compilation.decorations,
          "dormer-cottage",
          rank
        )!.installationSize;
        return {
          id,
          type: "dormer-cottage" as const,
          rank,
          uv: [...uv] as [number, number],
          bottom: 0,
          width,
          height
        };
      })
    },
    ground: flat
  },
  {
    id: "deck-prefabs",
    title: "平屋顶 · 活板门与屋顶灯",
    house: {
      id: "a",
      height: 4,
      rectangle: { center: [0, 0], size: [9, 7], rotation: 0.4 },
      roof: { height: 0 },
      roofAttachments: (
        [
          ["h1", "hatch-cottage", [0.3, 0.4]],
          ["h2", "hatch-gothic", [0.7, 0.7]],
          ["l1", "roof-lantern", [0.75, 0.25]]
        ] as const
      ).map(([id, type, uv]) => {
        const [width, height] = constructionDecorationRecipe(
          library.compilation.decorations,
          type,
          1
        )!.installationSize;
        return { id, type, rank: 1 as const, uv: [...uv] as [number, number], bottom: 0, width, height };
      })
    },
    ground: flat
  },
  {
    id: "foundation-solid",
    title: "台基 · 实心",
    house: {
      id: "a",
      rectangle: { center: [0, 0], size: [9, 6], rotation: 0.3 },
      foundation: { height: 0.8, mode: "solid" }
    },
    ground: hills
  },
  {
    id: "foundation-pillars",
    title: "台基 · 柱子",
    house: {
      id: "a",
      rectangle: { center: [0, 0], size: [9, 6], rotation: 0.3 },
      foundation: { height: 1.2, mode: "pillars" }
    },
    ground: slope
  },
  {
    id: "foundation-round",
    title: "台基 · 圆屋柱子",
    house: {
      id: "a",
      height: 6,
      circle: { center: [0, 0], radius: 3, phase: 0 },
      foundation: { height: 1.5 }
    },
    ground: hills
  },
  {
    id: "timber",
    title: "木墙",
    house: { id: "a", walls: "timber", rectangle: { center: [0, 0], size: [8, 6], rotation: 0.3 } },
    online: { wallStructure: "timber", wall: { unit: "wooden_plank", algorithm: { type: "horizontal_rows" } } },
    ground: hills
  },
  {
    id: "timber-round",
    title: "木墙 · 圆屋",
    house: { id: "a", walls: "timber", height: 5, circle: { center: [0, 0], radius: 3, phase: 0 } },
    online: { wallStructure: "timber", wall: { unit: "wooden_plank", algorithm: { type: "horizontal_rows" } } },
    ground: flat
  },
  {
    id: "timber-windows",
    title: "木墙 · 门窗",
    house: withFacade({
      id: "a",
      seed: 12345,
      height: 5,
      walls: "timber",
      woodColor: 2,
      rectangle: { center: [0, 0], size: [9, 6], rotation: 0 },
      roof: { profile: 0.5, height: 0.35, ridge_length: 0.6, eave: 0.3, color: 1 }
    }),
    online: { wallStructure: "timber", wall: { unit: "wooden_plank", algorithm: { type: "horizontal_rows" } } },
    ground: flat
  },
  {
    id: "timber-gable",
    title: "木墙 · 山墙",
    house: { id: "a", walls: "timber", rectangle: { center: [0, 0], size: [8, 6], rotation: 0.3 }, roof: { ridge_length: 1 } },
    online: { wallStructure: "timber", wall: { unit: "wooden_plank", algorithm: { type: "horizontal_rows" } } },
    ground: flat
  },
  {
    id: "timber-flat",
    title: "木墙 · 平屋顶 · 腰线",
    house: {
      id: "a",
      walls: "timber",
      height: 6,
      rectangle: { center: [0, 0], size: [8, 6], rotation: 0.3 },
      roof: { height: 0 },
      floors: { enabled: true, interval: 3 }
    },
    online: { wallStructure: "timber", wall: { unit: "wooden_plank", algorithm: { type: "horizontal_rows" } } },
    ground: flat
  },
  {
    id: "wall-frames",
    title: "石框窗",
    house: withStone(
      {
        id: "a",
        height: 7,
        wallColor: 1,
        rectangle: { center: [0, 0], size: [9, 7], rotation: 0.2 }
      },
      "wall"
    ),
    ground: flat
  },
  {
    id: "timber-stone",
    title: "木墙 · 尖拱窗 · 箭缝窗",
    house: withStone({
      id: "a",
      walls: "timber",
      height: 6,
      rectangle: { center: [0, 0], size: [9, 7], rotation: 0.2 }
    }),
    online: { wallStructure: "timber", wall: { unit: "wooden_plank", algorithm: { type: "horizontal_rows" } } },
    ground: flat
  },
  {
    id: "eave-cottage",
    title: "半老虎窗 · Cottage",
    house: withEave({ id: "a", seed: 12345, height: 4, rectangle: { center: [0, 0], size: [10, 10], rotation: 0 } }, [
      ["dormer-cottage-half", 1, 0.06],
      ["dormer-cottage-half", 2, 0.125],
      ["dormer-cottage-half", 3, 0.2],
      ["dormer-cottage-half", 2, 0.375]
    ]),
    ground: flat
  },
  {
    id: "eave-gothic",
    title: "半老虎窗 · 尖拱 · 箭缝",
    house: withEave({ id: "a", height: 4, rectangle: { center: [0, 0], size: [10, 10], rotation: 0 } }, [
      ["dormer-gothic-half", 1, 0.05],
      ["dormer-gothic-half", 2, 0.125],
      ["dormer-gothic-half", 3, 0.3],
      ["dormer-gothic-half", 1, 0.38],
      ["dormer-arrow-slit-half", 2, 0.34],
      ["dormer-arrow-slit-half", 3, 0.44]
    ]),
    ground: flat
  },
  {
    id: "eave-round",
    title: "半老虎窗 · 圆屋",
    house: withEave({ id: "a", height: 4, circle: { center: [0, 0], radius: 5, phase: 0 } }, [
      ["dormer-gothic-half", 2, 0.3],
      ["dormer-cottage-half", 1, 0.4],
      ["dormer-arrow-slit-half", 3, 0.48]
    ]),
    ground: flat
  },
  { id: "steep", title: "陡屋顶", house: { id: "a", roof: { height: 0.8, eave: 0.4 } }, ground: flat },
  { id: "gable", title: "山墙屋顶", house: { id: "a", roof: { ridge_length: 1 } }, ground: flat },
  {
    id: "rotated",
    title: "旋转房屋 10 × 7",
    house: { id: "a", rectangle: { center: [0, 0], size: [10, 7], rotation: 0.6 } },
    ground: flat
  },
  { id: "flat", title: "平屋顶", house: { id: "a", roof: { height: 0 } }, ground: flat },
  {
    id: "round-flat",
    title: "圆形平屋顶",
    house: { id: "a", height: 6, circle: { center: [0, 0], radius: 3, phase: 0 }, roof: { height: 0 } },
    ground: flat
  },
  {
    id: "tower",
    title: "圆塔",
    house: { id: "a", height: 10, circle: { center: [0, 0], radius: 2.5, phase: 0 } },
    ground: flat
  },
  {
    id: "hills",
    title: "起伏地形",
    house: { id: "a", rectangle: { center: [0, 0], size: [9, 6], rotation: 0.3 } },
    ground: hills
  }
];

const $ = (s: string) => document.querySelector<HTMLElement>(s)!;
const params = new URL(location.href).searchParams;
const PROJECT = "building-core-preview-v1";
const project: RuntimeProjectPackage = {
  version: RUNTIME_PROJECT_SAVE_VERSION,
  project: {
    scene: "Preview.scene",
    files: [
      { virtualPath: "Preview.scene", path: "Preview.scene", type: "Scene", dependencies: [] },
      ...builtinBuildingAssetFiles
    ]
  },
  contents: {
    "Preview.scene": JSON.stringify({
      asset: { version: "2.0" },
      scene: { rootEntities: [], background: { mode: 0, color: { r: 0.11, g: 0.14, b: 0.16, a: 1 } } },
      entities: [],
      components: []
    })
  }
};
const storage = await RuntimeProjectStorage.open();
try {
  await storage.save(PROJECT, project);
} finally {
  storage.close();
}
const session = await RuntimeProjectSession.open(PROJECT, project.project, location.href);
await session.initializeDependencies();
const canvas = document.querySelector("canvas")!;
const engine = await WebGLEngine.create({
  canvas,
  shaderCompiler: new ShaderCompiler(),
  graphicDeviceOptions: { webGLMode: WebGLMode.WebGL2 }
});
engine.canvas.setResolution(canvas.clientWidth * devicePixelRatio, canvas.clientHeight * devicePixelRatio);
engine.resourceManager.registerVirtualResources(await session.resources());
const scene = await engine.resourceManager.load<Scene>({ url: "Preview.scene", type: AssetType.Scene });
engine.sceneManager.activeScene = scene;
scene.ambientLight.diffuseSolidColor = new Color(0.5, 0.5, 0.5, 1);
scene.createRootEntity("Sun").addComponent(DirectLight).entity.transform.setRotation(-40, -25, 0);
const camera = scene.createRootEntity("Camera").addComponent(Camera);
camera.isOrthographic = true;
const assets = await engine.resourceManager.load<PrefabResource>({
  url: BUILTIN_BUILDING_ASSETS,
  type: AssetType.Prefab
});
const library = buildingAssets(assets);
const CASES = cases();
engine.run();

// The two copies stand side by side along x; each samples the ground as if it stood at the origin.
const SPACING = 13;
const moved = (c: Case, dx: number): CoreHouseParameters[] => [c.house, ...(c.others ?? [])].map((h) => shift(h, dx));
const shift = (h: CoreHouseParameters, dx: number): CoreHouseParameters => {
  if (h.circle) return { ...h, circle: { ...h.circle, center: [h.circle.center[0] + dx, h.circle.center[1]] } };
  const r = h.rectangle ?? { center: [0, 0] as [number, number], size: [8, 6] as [number, number], rotation: 0 };
  return { ...h, rectangle: { ...r, center: [r.center[0] + dx, r.center[1]] } };
};
const groundFor =
  (c: Case, dx: number): Ground =>
  (x, z) =>
    c.ground(x - dx, z);
// `view=far` shows the distance view instead of the resident detail.
const far = params.get("view") === "far";
interface Drawn {
  root: Entity;
  destroy(): void;
  ms: number;
  units: number;
}
async function online(c: Case, dx: number, parent: Entity, signal: AbortSignal): Promise<Drawn> {
  const houses = moved(c, dx).map(({ walls: _w, footprint: _f, roofAttachments, foundation, ...p }) => ({
    ...p,
    ...c.online,
    ...(foundation && {
      foundation: { height: foundation.height, ...(foundation.mode && { mode: foundation.mode }) },
      foundationStyle: {
        ...(foundation.unit && { unit: foundation.unit }),
        ...(foundation.rule && { algorithm: { type: foundation.rule } }),
        ...(foundation.footprint && { footprint: foundation.footprint })
      }
    }),
    attachments: [
      ...(p.attachments ?? []),
      ...(roofAttachments ?? []).map((a) => ({
        ...a,
        kind: a.type === "roof-lantern" ? "lantern" : a.type.startsWith("hatch") ? "hatch" : "window",
        host: "roof"
      }))
    ]
  }));
  const ground = groundFor(c, dx);
  const start = performance.now();
  const design = designBuilding(European.buildHouses(houses as never), ground, library.compilation);
  if (far) {
    const preview = profilePreview(buildingPreviewInput(design, await prepareBuildingPublication(design)), ground, {
      assets: library.compilation,
      includeAppearance: true,
      includeStructure: true
    });
    const ms = performance.now() - start;
    const palette = buildingPalette(design);
    const view = await createBuildingDistanceView(engine, parent, palette, preview, assets, camera, signal);
    await view.ready;
    return { root: view.root, destroy: () => view.root.destroy(), ms, units: 0 };
  }
  const input = (await implementBuilding(design)).renderInput;
  const ms = performance.now() - start;
  const r = await renderBuilding(input, { parent, camera, assets, signal });
  return { root: r.runtime.root, destroy: r.destroy, ms, units: input.groups.reduce((n, g) => n + g.cells.length, 0) };
}
async function core(c: Case, dx: number, parent: Entity, signal: AbortSignal): Promise<Drawn> {
  const registry = registerHouseTypes(createBuildingRegistry());
  const houses = moved(c, dx),
    ground = groundFor(c, dx);
  const start = performance.now();
  const result = designBuildingCore(buildCoreHouses(houses), registry, {
    environment: coreBuildingEnvironment(ground, library.compilation)
  });
  const options = { environment: { ground }, assets: library.compilation };
  if (far) {
    // `native=1` draws prefabs as the product does: their own meshes, not merged.
    const prepared = prepareCoreBuilding(result, registry, {
      ...options,
      retainDecorationParts: params.get("native") === "1"
    });
    const ms = performance.now() - start;
    const view = await createBuildingDistanceView(
      engine,
      parent,
      prepared.appearance,
      prepared.preview,
      assets,
      camera,
      signal
    );
    await view.ready;
    return { root: view.root, destroy: () => view.root.destroy(), ms, units: 0 };
  }
  const { renderInput } = await compileCoreBuilding(result, registry, options);
  const ms = performance.now() - start;
  const r = await renderBuilding(renderInput, { parent, camera, assets, signal });
  return {
    root: r.runtime.root,
    destroy: r.destroy,
    ms,
    units: renderInput.groups.reduce((n, g) => n + g.cells.length, 0)
  };
}

let current = CASES[0],
  mode: "side" | "flip" = "side",
  showing: "online" | "core" = "online",
  token = 0;
let drawn: { online: Drawn; core: Drawn } | undefined;
async function show() {
  const my = ++token,
    c = current;
  const dx = mode === "side" ? SPACING / 2 : 0;
  const parent = scene.createRootEntity("preview-" + my);
  const signal = new AbortController().signal;
  const pair = { online: await online(c, -dx, parent, signal), core: await core(c, dx, parent, signal) };
  if (my !== token) {
    pair.online.destroy();
    pair.core.destroy();
    parent.destroy();
    return;
  }
  drawn?.online.destroy();
  drawn?.core.destroy();
  for (const e of scene.rootEntities) if (e.name.startsWith("preview-") && e !== parent) e.destroy();
  drawn = pair;
  showing = "online";
  apply();
  const height = c.house.height ?? 4;
  // `zoom` in the URL magnifies the view for close comparison; `yaw` turns the camera (degrees).
  const zoom = Number(params.get("zoom") ?? 1),
    yaw = (Number(params.get("yaw") ?? 0) * Math.PI) / 180;
  const [ox, oz] = [16 * Math.cos(yaw) - 30 * Math.sin(yaw), 16 * Math.sin(yaw) + 30 * Math.cos(yaw)];
  // `target=x,y,z` in the URL aims the camera at a point instead of the house's middle.
  const [tx, ty, tz] = (params.get("target") ?? `0,${height * 0.55},0`).split(",").map(Number);
  camera.entity.transform.setPosition(tx + ox, ty + 12 + height * 0.45, tz + oz);
  camera.entity.transform.lookAt(new Vector3(tx, ty, tz));
  camera.orthographicSize = (mode === "side" ? 9 + height * 0.25 : 6 + height * 0.3) / zoom;
  $("#checks").innerHTML = "";
  for (const [label, detail] of [
    ["视图", far ? "远景（distance view）" : "近景（常驻单元）"],
    ...(far ? [] : [["单元数量", `线上 ${pair.online.units} · 新架构 ${pair.core.units}`]]),
    ["生成耗时", `线上 ${pair.online.ms.toFixed(1)} ms · 新架构 ${pair.core.ms.toFixed(1)} ms`],
    ["左右位置", mode === "side" ? "左：线上 · 右：新架构" : "同位交替，按空格切换"]
  ]) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="ok">•</span><span></span><span class="d"></span>`;
    li.children[1].textContent = label;
    li.children[2].textContent = detail;
    $("#checks").append(li);
  }
  document.body.dataset.ready = c.id;
}
function apply() {
  if (!drawn) return;
  drawn.online.root.isActive = mode === "side" || showing === "online";
  drawn.core.root.isActive = mode === "side" || showing === "core";
  $("#ab").hidden = mode !== "flip";
  $("#ab").textContent = showing === "online" ? "当前显示：线上" : "当前显示：新架构";
}
function select(c: Case) {
  current = c;
  for (const b of document.querySelectorAll<HTMLButtonElement>("#cases button"))
    b.setAttribute("aria-pressed", String(b.dataset.id === c.id));
  $("#checks").innerHTML = `<li><span class="wait">…</span><span>生成中</span></li>`;
  void show().catch(report);
}
for (const c of CASES) {
  const b = document.createElement("button");
  b.textContent = c.title;
  b.dataset.id = c.id;
  b.onclick = () => select(c);
  $("#cases").append(b);
}
for (const b of document.querySelectorAll<HTMLButtonElement>("#modes button"))
  b.onclick = () => {
    mode = b.dataset.mode as typeof mode;
    for (const x of document.querySelectorAll("#modes button")) x.setAttribute("aria-pressed", String(x === b));
    select(current);
  };
addEventListener("keydown", (e) => {
  if (e.code !== "Space" || mode !== "flip") return;
  e.preventDefault();
  showing = showing === "online" ? "core" : "online";
  apply();
});
function report(error: unknown) {
  console.error(error);
  $("#checks").innerHTML = `<li><span class="bad">✕</span><span></span></li>`;
  $("#checks").querySelector("li span:last-child")!.textContent = String((error as Error)?.message ?? error);
}
if (params.get("mode") === "flip") {
  mode = "flip";
  for (const x of document.querySelectorAll<HTMLButtonElement>("#modes button"))
    x.setAttribute("aria-pressed", String(x.dataset.mode === "flip"));
}
select(CASES.find((c) => c.id === params.get("case")) ?? CASES[0]);
