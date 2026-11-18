// Preview page: the core's houses, case by case, as resident detail or as the distance view
// (`view=far`). `case`, `zoom`, `yaw` and `target` in the URL pick what to show and from where.
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
import { renderBuilding } from "@galacean/engine-building/building/parts/architecture/BuildingRender";
import { createBuildingRegistry, designBuildingCore } from "@galacean/engine-building/building/core/index";
import { registerHouseTypes } from "@galacean/engine-building/building/partTypes/House";
import { buildCoreHouses, type CoreHouseParameters } from "@galacean/engine-building/building/application/CoreEuropean";
import {
  compileCoreBuilding,
  coreBuildingEnvironment,
  prepareCoreBuilding
} from "@galacean/engine-building/building/render/CoreBuilding";
import {
  planFacadeDecorations,
  normalizeDecorationPlan
} from "@galacean/engine-building/building/runtime/DecorationPlan";
import { normalizeProfileRoof } from "@galacean/engine-building/building/runtime/ProfileParameters";
import { isFlatRoofHeight } from "@galacean/engine-building/building/runtime/RoofMode";
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
/** A prefab's own size, from the facts the asset layer has about it. */
function ownSize(type: string, rank: number) {
  const { min, max } = library.compilation.prefabs![`${type}/${rank}`].bounds;
  return { width: max[0] - min[0], height: max[1] - min[1] };
}
/** Gothic windows and doors and arrow slits at their own sizes. */
function withStone(house: CoreHouseParameters, frameMaterial?: "wall"): CoreHouseParameters {
  const at = (id: string, kind: string, type: string, rank: number, u: number, bottom: number) => {
    const size = ownSize(type, rank);
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
/** Gothic dormers at their own sizes, at footprint uv positions. */
function withDormers(house: CoreHouseParameters, at: [number, number, 1 | 2 | 3][]): CoreHouseParameters {
  return {
    ...house,
    roofAttachments: at.map(([u, v, rank], i) => {
      return { id: "dormer" + i, type: "dormer-gothic" as const, rank, uv: [u, v], bottom: 0 };
    })
  };
}
/** Eave windows at their own sizes, with 40% of their height above the wall top. */
function withEave(house: CoreHouseParameters, at: [string, number, number][]): CoreHouseParameters {
  return {
    ...house,
    attachments: at.map(([type, rank, u], i) => {
      const size = ownSize(type, rank);
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
    id: "plaster-flat",
    title: "抹灰 · 方形平屋顶",
    house: {
      id: "a",
      height: 4,
      rectangle: { center: [0, 0], size: [8, 6], rotation: 0 },
      roof: { height: 0 },
      plaster: { enabled: true, wear: 0.35, color: 3 }
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
        return {
          id,
          type: "dormer-cottage" as const,
          rank,
          uv: [...uv] as [number, number],
          bottom: 0
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
        return { id, type, rank: 1 as const, uv: [...uv] as [number, number], bottom: 0 };
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
    id: "foundation-plaster",
    title: "台基 · 柱子抹灰",
    house: {
      id: "a",
      rectangle: { center: [0, 0], size: [9, 6], rotation: 0.3 },
      foundation: { height: 1.2, mode: "pillars", plaster: { wear: 0.4, color: 2 } }
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
    ground: hills
  },
  {
    id: "timber-round",
    title: "木墙 · 圆屋",
    house: { id: "a", walls: "timber", height: 5, circle: { center: [0, 0], radius: 3, phase: 0 } },
    ground: flat
  },
  {
    id: "timber-round-small",
    title: "木墙 · 小圆屋",
    house: { id: "a", walls: "timber", height: 5, circle: { center: [0, 0], radius: 1.6, phase: 0 } },
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
    ground: flat
  },
  {
    id: "timber-gable",
    title: "木墙 · 山墙",
    house: {
      id: "a",
      walls: "timber",
      rectangle: { center: [0, 0], size: [8, 6], rotation: 0.3 },
      roof: { ridge_length: 1 }
    },
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
    ground: flat
  },
  (() => {
    const base = withEave({ id: "a", height: 4, rectangle: { center: [0, 0], size: [12, 8], rotation: 0 } }, [
      ["dormer-cottage-half", 2, 0.12],
      ["dormer-cottage-half", 2, 0.28]
    ]);
    return {
      id: "eave-shutters",
      title: "半老虎窗 · 百叶窗",
      house: { ...base, attachments: base.attachments!.map((a) => ({ ...a, shutters: true })) },
      ground: flat
    };
  })(),
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
  {
    id: "arch-stone",
    title: "拱 · 砖墙",
    house: {
      id: "a",
      height: 5,
      rectangle: { center: [0, 0], size: [10, 8], rotation: 0 },
      attachments: [
        { id: "a1", kind: "opening", type: "opening-arch", u: 0.36, bottom: 0, width: 2, height: 2.6 },
        { id: "a2", kind: "opening", type: "opening-arch", u: 0.45, bottom: 0, width: 1.2, height: 3.2 }
      ] as never
    },
    ground: flat
  },
  {
    id: "arch-round",
    title: "拱 · 圆墙 · 起伏",
    house: {
      id: "a",
      height: 5,
      circle: { center: [0, 0], radius: 5, phase: 0 },
      attachments: [
        { id: "a1", kind: "opening", type: "opening-arch", u: 0.4, bottom: 0, width: 2.4, height: 3 }
      ] as never
    },
    ground: hills
  },
  {
    id: "arch-timber",
    title: "拱 · 木墙",
    house: {
      id: "a",
      walls: "timber",
      height: 5,
      rectangle: { center: [0, 0], size: [10, 8], rotation: 0 },
      attachments: [
        { id: "a1", kind: "opening", type: "opening-arch", u: 0.36, bottom: 0, width: 2, height: 2.6 },
        { id: "a2", kind: "opening", type: "opening-arch", u: 0.45, bottom: 0, width: 1.2, height: 3 }
      ] as never
    },
    ground: flat
  },
  {
    id: "corner-windows",
    title: "转角窗",
    house: {
      id: "a",
      height: 4,
      rectangle: { center: [0, 0], size: [10, 8], rotation: 0 },
      attachments: ([1, 2, 3] as const).map((rank, i) => {
        const size = ownSize("window-cottage-corner", rank);
        return {
          id: "c" + rank,
          kind: "window",
          type: "window-cottage-corner",
          rank,
          u: [8 / 36, 0.5, 26 / 36][i],
          bottom: 1,
          width: size.width,
          height: size.height
        };
      }) as never
    },
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

// A house moved along x samples the ground as if it stood at the origin.
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
  metrics?: { triangles: number; uploadBytes: number; residentBytes: number };
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
    units: renderInput.groups.reduce((n, g) => n + g.cells.length, 0),
    metrics: r.runtime.metrics
  };
}

let current = CASES[0],
  token = 0;
let drawn: Drawn | undefined;
async function show() {
  const my = ++token,
    c = current;
  const parent = scene.createRootEntity("preview-" + my);
  const signal = new AbortController().signal;
  const next = await core(c, 0, parent, signal);
  if (my !== token) {
    next.destroy();
    parent.destroy();
    return;
  }
  drawn?.destroy();
  for (const e of scene.rootEntities) if (e.name.startsWith("preview-") && e !== parent) e.destroy();
  drawn = next;
  // A drawn building starts hidden; show it once it replaces the last one.
  next.root.isActive = true;
  const height = c.house.height ?? 4;
  // `zoom` in the URL magnifies the view for a close look; `yaw` turns the camera (degrees).
  const zoom = Number(params.get("zoom") ?? 1),
    yaw = (Number(params.get("yaw") ?? 0) * Math.PI) / 180;
  const [ox, oz] = [16 * Math.cos(yaw) - 30 * Math.sin(yaw), 16 * Math.sin(yaw) + 30 * Math.cos(yaw)];
  // `target=x,y,z` in the URL aims the camera at a point instead of the house's middle.
  const [tx, ty, tz] = (params.get("target") ?? `0,${height * 0.55},0`).split(",").map(Number);
  camera.entity.transform.setPosition(tx + ox, ty + 12 + height * 0.45, tz + oz);
  camera.entity.transform.lookAt(new Vector3(tx, ty, tz));
  camera.orthographicSize = (6 + height * 0.3) / zoom;
  $("#checks").innerHTML = "";
  for (const [label, detail] of [
    ["视图", far ? "远景（distance view）" : "近景（常驻单元）"],
    ...(far ? [] : [["单元数量", `${next.units}`]]),
    ["生成耗时", `${next.ms.toFixed(1)} ms`]
  ]) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="ok">•</span><span></span><span class="d"></span>`;
    li.children[1].textContent = label;
    li.children[2].textContent = detail;
    $("#checks").append(li);
  }
  document.body.dataset.ready = c.id;
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
function report(error: unknown) {
  console.error(error);
  $("#checks").innerHTML = `<li><span class="bad">✕</span><span></span></li>`;
  $("#checks").querySelector("li span:last-child")!.textContent = String((error as Error)?.message ?? error);
}
// `town=core` builds one town of the cases below and measures it.
const TOWN = [
  "house",
  "tall",
  "stone-openings",
  "wall-frames",
  "timber-windows",
  "round-facade",
  "corner-windows",
  "eave-gothic",
  "eave-cottage",
  "dormers",
  "cottage-dormers",
  "flat",
  "deck-prefabs",
  "foundation-solid",
  "foundation-pillars",
  "plaster",
  "gable"
];
async function measureTown() {
  const spacing = 22;
  const placed = TOWN.map((id, i): Case => {
    const c = CASES.find((k) => k.id === id);
    if (!c) throw Error(`No case "${id}"`);
    const x = ((i % 5) - 2) * spacing,
      z = (Math.floor(i / 5) - 1.5) * spacing;
    const put = (h: CoreHouseParameters): CoreHouseParameters =>
      h.circle
        ? { ...h, circle: { ...h.circle, center: [h.circle.center[0] + x, h.circle.center[1] + z] } }
        : {
            ...h,
            rectangle: {
              ...(h.rectangle ?? { center: [0, 0], size: [8, 6], rotation: 0 }),
              center: [(h.rectangle?.center[0] ?? 0) + x, (h.rectangle?.center[1] ?? 0) + z] as [number, number]
            }
          };
    return { ...c, ground: flat, house: put(c.house), others: c.others?.map(put) };
  });
  const parent = scene.createRootEntity("town");
  const signal = new AbortController().signal;
  const start = performance.now();
  const drawn: Drawn[] = [];
  for (const c of placed) drawn.push(await core(c, 0, parent, signal));
  const build = performance.now() - start;
  const total = (f: (d: Drawn) => number) => drawn.reduce((n, d) => n + f(d), 0);
  const gl = (engine as unknown as { _hardwareRenderer: { gl: WebGL2RenderingContext } })._hardwareRenderer.gl;
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const timer = gl.getExtension("EXT_disjoint_timer_query_webgl2") as {
    TIME_ELAPSED_EXT: number;
    GPU_DISJOINT_EXT: number;
  } | null;
  engine.pause();
  camera.isOrthographic = false;
  camera.farClipPlane = 1000;
  const place = (angle: number, radius: number) => {
    camera.entity.transform.setPosition(Math.cos(angle) * radius, 34, Math.sin(angle) * radius);
    camera.entity.transform.lookAt(new Vector3(0, 2, 0));
  };
  const frames = async (count: number, move: (i: number) => void) => {
    const update: number[] = [],
      queries: WebGLQuery[] = [];
    for (let i = 0; i < count; i++) {
      move(i);
      const query = timer ? gl.createQuery()! : undefined;
      if (query) gl.beginQuery(timer!.TIME_ELAPSED_EXT, query);
      const t = performance.now();
      engine.update();
      update.push(performance.now() - t);
      if (query) {
        gl.endQuery(timer!.TIME_ELAPSED_EXT);
        queries.push(query);
      }
      await new Promise((r) => requestAnimationFrame(r));
    }
    for (let tries = 0; tries < 60 && queries.length; tries++) {
      if (gl.getQueryParameter(queries[queries.length - 1], gl.QUERY_RESULT_AVAILABLE)) break;
      await new Promise((r) => requestAnimationFrame(r));
    }
    const disjoint = timer ? gl.getParameter(timer.GPU_DISJOINT_EXT) : false;
    const gpu = disjoint
      ? []
      : queries.flatMap((q) =>
          gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) ? [gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6] : []
        );
    const stat = (xs: number[]) => {
      if (!xs.length) return null;
      const sorted = [...xs].sort((a, b) => a - b);
      return {
        mean: xs.reduce((a, b) => a + b, 0) / xs.length,
        p95: sorted[Math.floor(sorted.length * 0.95)]
      };
    };
    return { update: stat(update), gpu: stat(gpu), gpuFrames: gpu.length };
  };
  place(0.8, 80);
  await frames(30, () => {});
  const still = await frames(60, () => {});
  const orbit = await frames(120, (i) => place(0.8 + i * 0.0105, 80));
  const closer = await frames(120, (i) => place(0.8, 80 - i * 0.45));
  const result = {
    renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "unknown",
    houses: placed.length,
    generateMs: total((d) => d.ms),
    buildMs: build,
    units: total((d) => d.units),
    triangles: total((d) => d.metrics?.triangles ?? 0),
    uploadMB: total((d) => d.metrics?.uploadBytes ?? 0) / 1048576,
    residentMB: total((d) => d.metrics?.residentBytes ?? 0) / 1048576,
    still,
    orbit,
    closer
  };
  (window as unknown as { townResult: unknown }).townResult = result;
  document.body.dataset.town = "done";
}
const town = params.get("town");
if (town === "core") void measureTown().catch(report);
else select(CASES.find((c) => c.id === params.get("case")) ?? CASES[0]);
