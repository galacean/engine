import { describe, expect, it, vi } from "vitest";
import { MeshRenderer, Renderer, Shader, SkinnedMeshRenderer, ShaderMacro, ShaderMacroCollection } from "@galacean/engine";
import { collectSeedWorldRendererVariants } from "@galacean/engine-world-planning/world/SeedWorldShaderWarmup";

function renderer(active: boolean, skinned = false, materials?: object[]) {
  const instance = Object.create((skinned ? SkinnedMeshRenderer : MeshRenderer).prototype);
  const macros = new ShaderMacroCollection();
  macros.enable(ShaderMacro.getByName(active ? "ACTIVE_GEOMETRY" : "INACTIVE_TEMPLATE"));
  Object.defineProperties(instance, {
    entity: { value: { isActiveInHierarchy: active } },
    shaderData: { value: { _macroCollection: macros } },
    mesh: { value: { _primitive: { vertexElements: [{ attribute: "NORMAL" }] } } },
    enabled: { value: false },
    castShadows: { value: true },
    _update: { value: () => {} },
    getMaterials: {
      value: () =>
        materials ?? [
          {
            destroyed: false,
            shader: {
              name: "WarmupContract",
              destroyed: false,
              subShaders: [{ passes: [{ getTagValue: () => "Forward" }] }]
            },
            shaderData: { _macroCollection: new ShaderMacroCollection() }
          }
        ]
    }
  });
  return instance;
}
function collect(renderers: object[], includeInactiveEntities?: boolean) {
  return collectSeedWorldRendererVariants(
    { _macroCollection: new ShaderMacroCollection() } as any,
    { shaderData: { _macroCollection: new ShaderMacroCollection() }, background: { mode: 0 } } as any,
    { _updateShaderData() {}, shaderData: { _macroCollection: new ShaderMacroCollection() } } as any,
    [
      {
        getComponentsIncludeChildren(_type, output) {
          output.length = 0;
          output.push(...renderers);
        }
      }
    ] as any,
    { includeInactiveEntities }
  );
}
describe("renderer warmup scope", () => {
  it("prepares hidden overlay controls with overlay output and no world or instancing macros", () => {
    const overlay = renderer(false);
    Object.setPrototypeOf(overlay, Renderer.prototype);
    const sceneMacros = new ShaderMacroCollection();
    sceneMacros.enable(ShaderMacro.getByName("SCENE_DIRECT_LIGHT_COUNT", "1"));
    const cameraMacros = new ShaderMacroCollection();
    cameraMacros.enable(ShaderMacro.getByName("CAMERA_DEPTH_TEXTURE"));
    const variants = collectSeedWorldRendererVariants(
      { _macroCollection: new ShaderMacroCollection() } as any,
      { shaderData: { _macroCollection: sceneMacros }, background: { mode: 0 } } as any,
      { _updateShaderData() {}, shaderData: { _macroCollection: cameraMacros }, renderTarget: {} } as any,
      [],
      { includeInactiveEntities: false, overlayRenderers: [overlay] }
    );
    expect(variants).toHaveLength(1);
    const names = variants[0].macros.map((m) => m.n);
    expect(names).toEqual(
      expect.arrayContaining(["INACTIVE_TEMPLATE", "ENGINE_SHOULD_SRGB_CORRECT", "ENGINE_OUTPUT_SRGB_CORRECT"])
    );
    for (const name of [
      "SCENE_DIRECT_LIGHT_COUNT",
      "CAMERA_DEPTH_TEXTURE",
      "RENDERER_GPU_INSTANCE",
      "RENDERER_HAS_NORMAL"
    ])
      expect(names).not.toContain(name);
    expect(overlay.entity.isActiveInHierarchy).toBe(false);
  });
  it("keeps contributor passes when another material has the same shader and macros", () => {
    const shader = {
      name: "ContributionContract",
      destroyed: false,
      subShaders: [
        {
          passes: ["Forward", "ScreenSpaceReflectionContributionColor", "ScreenSpaceReflectionContributionDepth"].map(
            (stage) => ({
              getTagValue: () => stage,
              _renderState: { _getRenderQueueByShaderData: () => 2 },
              _renderStateDataMap: {}
            })
          )
        }
      ]
    };
    const materials = [false, true].map((contributeScreenSpaceReflection) => ({
      shader,
      contributeScreenSpaceReflection,
      destroyed: false,
      shaderData: { _macroCollection: new ShaderMacroCollection() }
    }));
    const variants = collect([renderer(true, false, materials)]);
    expect(new Set(variants.map((v) => v.pi))).toEqual(new Set([0, 1, 2]));
  });
  it("excludes inactive templates while retaining disabled LOD renderers on active entities", () => {
    const variants = collect([renderer(false), renderer(true)], false);
    expect(variants.length).toBeGreaterThan(0);
    expect(variants.every((v) => v.macros.some((m) => m.n === "ACTIVE_GEOMETRY"))).toBe(true);
    expect(variants.some((v) => v.macros.some((m) => m.n === "INACTIVE_TEMPLATE"))).toBe(false);
  });
  it("keeps inactive owners available to candidate-world and photo preparation by default", () => {
    expect(collect([renderer(false)]).some((v) => v.macros.some((m) => m.n === "INACTIVE_TEMPLATE"))).toBe(true);
  });
  it("does not request GPU batching for a skinned renderer which cannot batch", () => {
    expect(collect([renderer(true, true)]).some((v) => v.macros.some((m) => m.n === "RENDERER_GPU_INSTANCE"))).toBe(
      false
    );
    expect(collect([renderer(true)]).some((v) => v.macros.some((m) => m.n === "RENDERER_GPU_INSTANCE"))).toBe(true);
  });
  it("expands RENDERER_MASONRY_DITHER symmetrically for resident masonry shaders only", () => {
    const residentShaderName = "Masonry/" + "a".repeat(64);
    const makeMat = (name: string) => ({
      destroyed: false,
      shader: {
        name,
        destroyed: false,
        subShaders: [{ passes: [{ getTagValue: () => "Forward" }] }]
      },
      shaderData: { _macroCollection: new ShaderMacroCollection() }
    });
    const steadyResident = renderer(true, false, [makeMat(residentShaderName)]);
    const fadingResident = renderer(true, false, [makeMat(residentShaderName)]);
    fadingResident.shaderData._macroCollection.enable(ShaderMacro.getByName("RENDERER_MASONRY_DITHER"));
    const proxy = renderer(true, false, [makeMat("Masonry/GlobalProxy")]);

    const fromSteady = collect([steadyResident]).filter((v) => v.shader === residentShaderName);
    expect(fromSteady.some((v) => v.macros.some((m) => m.n === "RENDERER_MASONRY_DITHER"))).toBe(true);
    expect(fromSteady.some((v) => v.macros.every((m) => m.n !== "RENDERER_MASONRY_DITHER"))).toBe(true);

    const fromFading = collect([fadingResident]).filter((v) => v.shader === residentShaderName);
    expect(fromFading.some((v) => v.macros.some((m) => m.n === "RENDERER_MASONRY_DITHER"))).toBe(true);
    expect(fromFading.some((v) => v.macros.every((m) => m.n !== "RENDERER_MASONRY_DITHER"))).toBe(true);

    const fromProxy = collect([proxy]).filter((v) => v.shader === "Masonry/GlobalProxy");
    expect(fromProxy.length).toBeGreaterThan(0);
    expect(fromProxy.every((v) => v.macros.every((m) => m.n !== "RENDERER_MASONRY_DITHER"))).toBe(true);
  });

  it("precompiles Masonry/GlobalProxy and Masonry/GlobalProxyShadowOnly symmetrically for shadow casters", () => {
    const fullShader = {
      name: "Masonry/GlobalProxy",
      destroyed: false,
      subShaders: [{ passes: [{ getTagValue: () => "ShadowCaster" }, { getTagValue: () => "Forward" }] }]
    };
    const shadowOnlyShader = {
      name: "Masonry/GlobalProxyShadowOnly",
      destroyed: false,
      subShaders: [{ passes: [{ getTagValue: () => "ShadowCaster" }] }]
    };
    const spy = vi.spyOn(Shader, "find").mockImplementation((name) => {
      if (name === "Masonry/GlobalProxy") return fullShader as unknown as Shader;
      if (name === "Masonry/GlobalProxyShadowOnly") return shadowOnlyShader as unknown as Shader;
      return null!;
    });
    try {
      const lod2Proxy = renderer(true, false, [
        { destroyed: false, shader: fullShader, shaderData: { _macroCollection: new ShaderMacroCollection() } }
      ]);
      const fromLod2 = collect([lod2Proxy]);
      expect(fromLod2.some((v) => v.shader === "Masonry/GlobalProxy")).toBe(true);
      expect(fromLod2.some((v) => v.shader === "Masonry/GlobalProxyShadowOnly")).toBe(true);

      const lod1ShadowOnly = renderer(true, false, [
        { destroyed: false, shader: shadowOnlyShader, shaderData: { _macroCollection: new ShaderMacroCollection() } }
      ]);
      const fromLod1 = collect([lod1ShadowOnly]);
      expect(fromLod1.some((v) => v.shader === "Masonry/GlobalProxyShadowOnly")).toBe(true);
      expect(fromLod1.some((v) => v.shader === "Masonry/GlobalProxy")).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it("includes inactive LOD children under includeInactiveRoots and explicit additionalRenderers while still skipping inactive templates", () => {
    const templateRenderer = renderer(false);
    const inactiveVegetationLod = renderer(false);
    const offscreenBuildingDetail = renderer(false, false, [
      {
        destroyed: false,
        shader: {
          name: "Masonry/" + "b".repeat(64),
          destroyed: false,
          subShaders: [{ passes: [{ getTagValue: () => "Forward" }] }]
        },
        shaderData: { _macroCollection: new ShaderMacroCollection() }
      }
    ]);
    const variants = collectSeedWorldRendererVariants(
      { _macroCollection: new ShaderMacroCollection() } as any,
      { shaderData: { _macroCollection: new ShaderMacroCollection() }, background: { mode: 0 } } as any,
      { _updateShaderData() {}, shaderData: { _macroCollection: new ShaderMacroCollection() } } as any,
      [
        {
          getComponentsIncludeChildren(_type: unknown, output: object[]) {
            output.length = 0;
            output.push(templateRenderer);
          }
        }
      ] as any,
      {
        includeInactiveEntities: false,
        includeInactiveRoots: [
          {
            getComponentsIncludeChildren(_type: unknown, output: object[]) {
              output.length = 0;
              output.push(inactiveVegetationLod);
            }
          }
        ] as any,
        additionalRenderers: [offscreenBuildingDetail]
      }
    );
    expect(variants.some((v) => v.shader === "WarmupContract")).toBe(true);
    const masonryVariants = variants.filter((v) => v.shader === "Masonry/" + "b".repeat(64));
    expect(masonryVariants.length).toBeGreaterThan(0);
    // Masonry shaders own their custom instance streams and must not expand generic UBO instancing.
    expect(masonryVariants.every((v) => v.macros.every((m) => m.n !== "RENDERER_GPU_INSTANCE"))).toBe(true);
    expect(masonryVariants.some((v) => v.macros.some((m) => m.n === "RENDERER_MASONRY_DITHER"))).toBe(true);
    expect(masonryVariants.some((v) => v.macros.every((m) => m.n !== "RENDERER_MASONRY_DITHER"))).toBe(true);
  });

  it("expands additionalPointLightCounts on Forward passes of lit shaders only, skipping ShadowCaster and Water", () => {
    const litRenderer = renderer(true, true, [
      {
        destroyed: false,
        shader: {
          name: "Terrain/Terrain",
          destroyed: false,
          subShaders: [
            {
              passes: [{ getTagValue: () => "Forward" }, { getTagValue: () => "ShadowCaster" }]
            }
          ]
        },
        shaderData: { _macroCollection: new ShaderMacroCollection() }
      }
    ]);
    const waterRenderer = renderer(true, false, [
      {
        destroyed: false,
        shader: {
          name: "Water/Lake.v1",
          destroyed: false,
          subShaders: [{ passes: [{ getTagValue: () => "Forward" }] }]
        },
        shaderData: { _macroCollection: new ShaderMacroCollection() }
      }
    ]);
    const variants = collectSeedWorldRendererVariants(
      { _macroCollection: new ShaderMacroCollection() } as any,
      { shaderData: { _macroCollection: new ShaderMacroCollection() }, background: { mode: 0 } } as any,
      { _updateShaderData() {}, shaderData: { _macroCollection: new ShaderMacroCollection() } } as any,
      [
        {
          getComponentsIncludeChildren(_type: unknown, output: object[]) {
            output.length = 0;
            output.push(litRenderer, waterRenderer);
          }
        }
      ] as any,
      {
        includeGpuInstancing: false,
        additionalPointLightCounts: [4]
      }
    );
    const terrainForwardWithLights = variants.filter(
      (v) =>
        v.shader === "Terrain/Terrain" &&
        v.pi === 0 &&
        v.macros.some((m) => m.n === "SCENE_POINT_LIGHT_COUNT" && m.v === "4")
    );
    const terrainShadowWithLights = variants.filter(
      (v) =>
        v.shader === "Terrain/Terrain" &&
        v.pi === 1 &&
        v.macros.some((m) => m.n === "SCENE_POINT_LIGHT_COUNT")
    );
    const waterWithLights = variants.filter(
      (v) => v.shader === "Water/Lake.v1" && v.macros.some((m) => m.n === "SCENE_POINT_LIGHT_COUNT")
    );
    expect(terrainForwardWithLights.length).toBeGreaterThan(0);
    expect(terrainShadowWithLights).toHaveLength(0);
    expect(waterWithLights).toHaveLength(0);
  });

  it("adds additionalPointLightCounts onto existing SCENE_POINT_LIGHT_COUNT and clamps to LightManager capacity", () => {
    const litRenderer = renderer(true, false, [
      {
        destroyed: false,
        shader: {
          name: "Terrain/Terrain",
          destroyed: false,
          subShaders: [{ passes: [{ getTagValue: () => "Forward" }] }]
        },
        shaderData: { _macroCollection: new ShaderMacroCollection() }
      }
    ]);
    const sceneMacros = new ShaderMacroCollection();
    sceneMacros.enable(ShaderMacro.getByName("SCENE_POINT_LIGHT_COUNT", "2"));

    const variants = collectSeedWorldRendererVariants(
      { _macroCollection: new ShaderMacroCollection() } as any,
      {
        shaderData: { _macroCollection: sceneMacros },
        background: { mode: 0 },
        _lightManager: { _pointData: { color: new Float32Array(5 * 3) } }
      } as any,
      { _updateShaderData() {}, shaderData: { _macroCollection: new ShaderMacroCollection() } } as any,
      [
        {
          getComponentsIncludeChildren(_type: unknown, output: object[]) {
            output.length = 0;
            output.push(litRenderer);
          }
        }
      ] as any,
      {
        includeGpuInstancing: false,
        additionalPointLightCounts: [4]
      }
    );
    // Baseline 2 + delta 4 = 6, clamped to LightManager capacity 5 (never overwriting to 4).
    expect(
      variants.some(
        (v) => v.shader === "Terrain/Terrain" && v.macros.some((m) => m.n === "SCENE_POINT_LIGHT_COUNT" && m.v === "5")
      )
    ).toBe(true);
    expect(
      variants.some(
        (v) => v.shader === "Terrain/Terrain" && v.macros.some((m) => m.n === "SCENE_POINT_LIGHT_COUNT" && m.v === "4")
      )
    ).toBe(false);
  });

  it("supports negative additionalPointLightCounts to warm lights-OFF and reduced-light Forward passes when decoration lights are already active", () => {
    const litRenderer = renderer(true, true, [
      {
        destroyed: false,
        shader: {
          name: "Terrain/Terrain",
          destroyed: false,
          subShaders: [{ passes: [{ getTagValue: () => "Forward" }, { getTagValue: () => "ShadowCaster" }] }]
        },
        shaderData: { _macroCollection: new ShaderMacroCollection() }
      }
    ]);
    const roots = [
      {
        getComponentsIncludeChildren(_type: unknown, output: object[]) {
          output.length = 0;
          output.push(litRenderer);
        }
      }
    ] as any;

    // Case 1: In-village with only 4 decoration lights active (baseline 4 + delta -4 -> 0, macro removed).
    const activeFour = new ShaderMacroCollection();
    activeFour.enable(ShaderMacro.getByName("SCENE_POINT_LIGHT_COUNT", "4"));
    const variantsToZero = collectSeedWorldRendererVariants(
      { _macroCollection: new ShaderMacroCollection() } as any,
      {
        shaderData: { _macroCollection: activeFour },
        background: { mode: 0 },
        _lightManager: { _pointData: { color: new Float32Array(10 * 3) } }
      } as any,
      { _updateShaderData() {}, shaderData: { _macroCollection: new ShaderMacroCollection() } } as any,
      roots,
      { includeGpuInstancing: false, additionalPointLightCounts: [-4] }
    );
    expect(
      variantsToZero.some(
        (v) => v.shader === "Terrain/Terrain" && v.pi === 0 && v.macros.every((m) => m.n !== "SCENE_POINT_LIGHT_COUNT")
      )
    ).toBe(true);
    expect(
      variantsToZero.some(
        (v) => v.shader === "Terrain/Terrain" && v.pi === 1 && v.macros.every((m) => m.n !== "SCENE_POINT_LIGHT_COUNT")
      )
    ).toBe(false);
    expect(
      variantsToZero.some((v) => v.macros.some((m) => m.n === "SCENE_POINT_LIGHT_COUNT" && m.v === "8"))
    ).toBe(false);

    // Case 2: In-village with 2 scene lights + 4 decoration lights (baseline 6 + delta -4 -> 2).
    const activeSix = new ShaderMacroCollection();
    activeSix.enable(ShaderMacro.getByName("SCENE_POINT_LIGHT_COUNT", "6"));
    const variantsToTwo = collectSeedWorldRendererVariants(
      { _macroCollection: new ShaderMacroCollection() } as any,
      {
        shaderData: { _macroCollection: activeSix },
        background: { mode: 0 },
        _lightManager: { _pointData: { color: new Float32Array(10 * 3) } }
      } as any,
      { _updateShaderData() {}, shaderData: { _macroCollection: new ShaderMacroCollection() } } as any,
      roots,
      { includeGpuInstancing: false, additionalPointLightCounts: [-4] }
    );
    expect(
      variantsToTwo.some(
        (v) =>
          v.shader === "Terrain/Terrain" &&
          v.pi === 0 &&
          v.macros.some((m) => m.n === "SCENE_POINT_LIGHT_COUNT" && m.v === "2")
      )
    ).toBe(true);
  });

  it("emits steady-state (RENDERER_MASONRY_ENTRANCE-off) variants and expands additionalPointLightCounts onto companion Masonry/GlobalProxy", () => {
    const surfaceMacros = new ShaderMacroCollection();
    surfaceMacros.enable(ShaderMacro.getByName("RENDERER_MASONRY_ENTRANCE"));
    const surfaceRenderer = renderer(true, false, [
      {
        destroyed: false,
        shader: {
          name: "Masonry/SupportSurface",
          destroyed: false,
          subShaders: [{ passes: [{ getTagValue: () => "DepthOnly" }, { getTagValue: () => "Forward" }] }]
        },
        shaderData: { _macroCollection: surfaceMacros }
      }
    ]);
    const proxyShadowRenderer = renderer(true, false, [
      {
        destroyed: false,
        shader: {
          name: "Masonry/GlobalProxyShadowOnly",
          destroyed: false,
          subShaders: [{ passes: [{ getTagValue: () => "ShadowCaster" }] }]
        },
        shaderData: { _macroCollection: new ShaderMacroCollection() }
      }
    ]);
    const fakeGlobalProxyShader = {
      name: "Masonry/GlobalProxy",
      destroyed: false,
      subShaders: [
        {
          passes: [
            { getTagValue: () => "ShadowCaster" },
            { getTagValue: () => "DepthOnly" },
            { getTagValue: () => "Forward" }
          ]
        }
      ]
    };
    const findSpy = vi.spyOn(Shader, "find").mockImplementation((name: string) =>
      name === "Masonry/GlobalProxy" ? (fakeGlobalProxyShader as any) : null
    );
    try {
      const variants = collectSeedWorldRendererVariants(
        { _macroCollection: new ShaderMacroCollection() } as any,
        {
          shaderData: { _macroCollection: new ShaderMacroCollection() },
          background: { mode: 0 },
          _lightManager: { _pointData: { color: new Float32Array(10 * 3) } }
        } as any,
        { _updateShaderData() {}, shaderData: { _macroCollection: new ShaderMacroCollection() } } as any,
        [
          {
            getComponentsIncludeChildren(_type: unknown, output: object[]) {
              output.length = 0;
              output.push(surfaceRenderer, proxyShadowRenderer);
            }
          }
        ] as any,
        {
          includeGpuInstancing: false,
          additionalPointLightCounts: [4]
        }
      );

      // Masonry/SupportSurface must include steady-state (RENDERER_MASONRY_ENTRANCE removed) for both PL=0 and PL=4.
      expect(
        variants.some(
          (v) =>
            v.shader === "Masonry/SupportSurface" &&
            v.pi === 1 &&
            v.macros.every((m) => m.n !== "RENDERER_MASONRY_ENTRANCE") &&
            v.macros.some((m) => m.n === "SCENE_POINT_LIGHT_COUNT" && m.v === "4")
        )
      ).toBe(true);
      expect(
        variants.some(
          (v) =>
            v.shader === "Masonry/SupportSurface" &&
            v.pi === 1 &&
            v.macros.every((m) => m.n !== "RENDERER_MASONRY_ENTRANCE") &&
            v.macros.every((m) => m.n !== "SCENE_POINT_LIGHT_COUNT")
        )
      ).toBe(true);

      // Companion Masonry/GlobalProxy collected from Masonry/GlobalProxyShadowOnly must also get Forward PL=4.
      expect(
        variants.some(
          (v) =>
            v.shader === "Masonry/GlobalProxy" &&
            v.pi === 2 &&
            v.macros.some((m) => m.n === "SCENE_POINT_LIGHT_COUNT" && m.v === "4")
        )
      ).toBe(true);
    } finally {
      findSpy.mockRestore();
    }
  });
});
