import { describe, expect, it, vi } from "vitest";
import {
  DepthTextureMode,
  MeshRenderer,
  Renderer,
  RenderQueueType,
  ScreenSpaceReflectionQuality,
  Shader,
  SkinnedMeshRenderer,
  ShaderMacro,
  ShaderMacroCollection
} from "@galacean/engine";
import {
  collectSeedWorldRendererVariants,
  warmupSeedWorldShaderVariants,
  withSeedWorldGenerationRevealVariants
} from "@galacean/engine-world-planning/world/SeedWorldShaderWarmup";

function renderer(active: boolean, skinned = false, materials?: object[], castShadows = true) {
  const instance = Object.create((skinned ? SkinnedMeshRenderer : MeshRenderer).prototype);
  const macros = new ShaderMacroCollection();
  macros.enable(ShaderMacro.getByName(active ? "ACTIVE_GEOMETRY" : "INACTIVE_TEMPLATE"));
  Object.defineProperties(instance, {
    entity: { value: { isActiveInHierarchy: active } },
    shaderData: { value: { _macroCollection: macros } },
    mesh: { value: { _primitive: { vertexElements: [{ attribute: "NORMAL" }] } } },
    enabled: { value: false },
    castShadows: { value: castShadows },
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
          passes: ["Forward", "SSRContributionDepth"].map((stage) => ({
            getTagValue: () => stage,
            _renderState: { _getRenderQueueByShaderData: () => 2 },
            _renderStateDataMap: {}
          }))
        }
      ]
    };
    const materials = [false, true].map((contributeScreenSpaceReflectionDepth) => ({
      shader,
      contributeScreenSpaceReflectionDepth,
      destroyed: false,
      shaderData: { _macroCollection: new ShaderMacroCollection() }
    }));
    const variants = collectSeedWorldRendererVariants(
      { _macroCollection: new ShaderMacroCollection(), _hardwareRenderer: { supportsRendering: true } } as any,
      {
        shaderData: { _macroCollection: new ShaderMacroCollection() },
        background: { mode: 0 },
        screenSpaceReflection: {
          enabled: true,
          quality: ScreenSpaceReflectionQuality.Medium,
          intensity: 1,
          maxRoughness: 0.6
        }
      } as any,
      {
        _updateShaderData() {},
        shaderData: { _macroCollection: new ShaderMacroCollection() },
        enableScreenSpaceReflection: true
      } as any,
      [
        {
          getComponentsIncludeChildren(_type: unknown, output: object[]) {
            output.length = 0;
            output.push(renderer(true, false, materials));
          }
        }
      ] as any
    );
    expect(new Set(variants.map((v) => v.pi))).toEqual(new Set([0, 1]));
  });

  it("strips transient SSR macros from active cameras and skips SSRContributionDepth when SSR is disabled", () => {
    const shader = {
      name: "SsrWarmupRegression",
      destroyed: false,
      subShaders: [
        {
          passes: ["Forward", "SSRReceiver", "SSRContributionDepth"].map((stage) => ({
            getTagValue: () => stage,
            _renderState: { _getRenderQueueByShaderData: () => RenderQueueType.Transparent },
            _renderStateDataMap: {}
          }))
        }
      ]
    };
    const mat = {
      shader,
      destroyed: false,
      contributeScreenSpaceReflectionDepth: true,
      screenSpaceReflectionIntensity: 1,
      screenSpaceReflectionBilateral: false,
      shaderData: { _macroCollection: new ShaderMacroCollection() }
    };
    const cameraMacros = new ShaderMacroCollection();
    for (const macroName of [
      "CAMERA_ENABLE_SSR",
      "CAMERA_SSR_VERIFY_RECEIVER_DEPTH",
      "CAMERA_SSR_BILATERAL_SAMPLE",
      "SSR_PACKED_DEPTH_RG8",
      "SSR_PACKED_NORMAL_OCT8"
    ]) {
      cameraMacros.enable(ShaderMacro.getByName(macroName));
    }
    const roots = [
      {
        getComponentsIncludeChildren(_type: unknown, output: object[]) {
          output.length = 0;
          output.push(renderer(true, false, [mat]));
        }
      }
    ] as any;
    const offVariants = collectSeedWorldRendererVariants(
      { _macroCollection: new ShaderMacroCollection(), _hardwareRenderer: { supportsRendering: true } } as any,
      {
        shaderData: { _macroCollection: new ShaderMacroCollection() },
        background: { mode: 0 },
        screenSpaceReflection: { enabled: false }
      } as any,
      {
        _updateShaderData() {},
        _isIndependentCanvasEnabled: () => true,
        renderTarget: null,
        shaderData: { _macroCollection: cameraMacros },
        enableScreenSpaceReflection: false
      } as any,
      roots,
      { includeGpuInstancing: false }
    );
    expect(offVariants).toHaveLength(1);
    expect(offVariants[0].pi).toBe(0);
    for (const macroName of [
      "CAMERA_ENABLE_SSR",
      "CAMERA_SSR_VERIFY_RECEIVER_DEPTH",
      "CAMERA_SSR_BILATERAL_SAMPLE",
      "SSR_PACKED_DEPTH_RG8",
      "SSR_PACKED_NORMAL_OCT8"
    ]) {
      expect(offVariants[0].macros.some((m) => m.n === macroName)).toBe(false);
    }

    const fakeSsrShader = {
      name: "Lighting/ScreenSpaceReflection",
      destroyed: false,
      subShaders: [{ passes: Array.from({ length: 8 }, () => ({ getTagValue: () => "Forward" })) }]
    };
    const findSpy = vi
      .spyOn(Shader, "find")
      .mockImplementation((name: string) =>
        name === "Lighting/ScreenSpaceReflection" ? (fakeSsrShader as any) : null
      );
    try {
      const onVariants = collectSeedWorldRendererVariants(
        {
          _macroCollection: new ShaderMacroCollection(),
          _hardwareRenderer: { supportsRendering: true, supportsRenderTargetColorFormat: () => false }
        } as any,
        {
          shaderData: { _macroCollection: new ShaderMacroCollection() },
          background: { mode: 0 },
          screenSpaceReflection: {
            enabled: true,
            quality: ScreenSpaceReflectionQuality.Medium,
            intensity: 1,
            maxRoughness: 0.6
          }
        } as any,
        {
          _updateShaderData() {},
          _isIndependentCanvasEnabled: () => true,
          renderTarget: null,
          shaderData: { _macroCollection: cameraMacros },
          enableScreenSpaceReflection: true
        } as any,
        roots,
        { includeGpuInstancing: false }
      );
      const receiverVariant = onVariants.find((v) => v.shader === "SsrWarmupRegression" && v.pi === 1)!;
      const contribVariant = onVariants.find((v) => v.shader === "SsrWarmupRegression" && v.pi === 2)!;
      expect(receiverVariant).toBeDefined();
      expect(contribVariant).toBeDefined();
      expect(receiverVariant.macros.some((m) => m.n === "ENGINE_OUTPUT_SRGB_CORRECT")).toBe(false);
      expect(contribVariant.macros.some((m) => m.n === "ENGINE_OUTPUT_SRGB_CORRECT")).toBe(false);
      // Forward verified-depth variant gets SSR_PACKED_DEPTH_RG8 when R16F is unsupported, never SSR_PACKED_NORMAL_OCT8.
      const forwardSsr = onVariants.find(
        (v) => v.shader === "SsrWarmupRegression" && v.pi === 0 && v.macros.some((m) => m.n === "CAMERA_ENABLE_SSR")
      )!;
      expect(forwardSsr.macros.some((m) => m.n === "SSR_PACKED_DEPTH_RG8")).toBe(true);
      expect(forwardSsr.macros.some((m) => m.n === "SSR_PACKED_NORMAL_OCT8")).toBe(false);
      // BuildHiZMip0 (Pass 1) is warmed both with and without SSR_HAS_CONTRIB_DEPTH when contributors exist.
      const pass1Variants = onVariants.filter((v) => v.shader === "Lighting/ScreenSpaceReflection" && v.pi === 1);
      expect(pass1Variants.some((v) => v.macros.some((m) => m.n === "SSR_HAS_CONTRIB_DEPTH"))).toBe(true);
      expect(pass1Variants.some((v) => !v.macros.some((m) => m.n === "SSR_HAS_CONTRIB_DEPTH"))).toBe(true);
    } finally {
      findSpy.mockRestore();
    }
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
      (v) => v.shader === "Terrain/Terrain" && v.pi === 1 && v.macros.some((m) => m.n === "SCENE_POINT_LIGHT_COUNT")
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
    expect(variantsToZero.some((v) => v.macros.some((m) => m.n === "SCENE_POINT_LIGHT_COUNT" && m.v === "8"))).toBe(
      false
    );

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
    const findSpy = vi
      .spyOn(Shader, "find")
      .mockImplementation((name: string) => (name === "Masonry/GlobalProxy" ? (fakeGlobalProxyShader as any) : null));
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

  it("skips DepthOnly only when WebGL2 forward depth resolve is explicitly opted in and AO is disabled", () => {
    const meshRenderer = renderer(true, false, [
      {
        destroyed: false,
        shader: {
          name: "Terrain/Terrain",
          destroyed: false,
          subShaders: [{ passes: [{ getTagValue: () => "Forward" }, { getTagValue: () => "DepthOnly" }] }]
        },
        shaderData: { _macroCollection: new ShaderMacroCollection() }
      }
    ]);
    const roots = [
      {
        getComponentsIncludeChildren(_type: unknown, output: object[]) {
          output.length = 0;
          output.push(meshRenderer);
        }
      }
    ] as any;
    const collectDepth = (forwardDepthResolve: boolean | undefined, aoValid: boolean) =>
      collectSeedWorldRendererVariants(
        { _macroCollection: new ShaderMacroCollection(), _hardwareRenderer: { supportsRendering: true } } as any,
        {
          shaderData: { _macroCollection: new ShaderMacroCollection() },
          background: { mode: 0 },
          ambientOcclusion: { _isValid: () => aoValid }
        } as any,
        {
          _updateShaderData() {},
          _isIndependentCanvasEnabled: () => true,
          ...(forwardDepthResolve !== undefined ? { _enableForwardDepthResolve: forwardDepthResolve } : {}),
          shaderData: { _macroCollection: new ShaderMacroCollection() },
          depthTextureMode: DepthTextureMode.PrePass,
          renderTarget: null
        } as any,
        roots,
        { includeGpuInstancing: false }
      ).map((v) => v.pi);

    // Opted-in WebGL2 forward depth resolve with AO disabled -> skips DepthOnly (pi=1).
    expect(collectDepth(true, false)).toEqual([0]);
    // Opt-in false or undefined (non-modify Camera) -> retains DepthOnly (pi=1).
    expect(collectDepth(false, false)).toEqual([0, 1]);
    expect(collectDepth(undefined, false)).toEqual([0, 1]);
    // AO enabled forces DepthOnly even when forward depth resolve is opted in.
    expect(collectDepth(true, true)).toEqual([0, 1]);
  });

  it("filters SSRReceiver by intensity/roughness and warms Lighting/ScreenSpaceReflection v2 passes only when receivers exist", () => {
    const fakeSsrShader = {
      name: "Lighting/ScreenSpaceReflection",
      destroyed: false,
      subShaders: [
        {
          passes: Array.from({ length: 9 }, () => ({ getTagValue: () => "Forward" }))
        }
      ]
    };
    const makeShader = (name: string, queue: RenderQueueType) => ({
      name,
      destroyed: false,
      subShaders: [
        {
          passes: ["Forward", "SSRReceiver"].map((stage) => ({
            getTagValue: () => stage,
            _renderState: { _getRenderQueueByShaderData: () => queue },
            _renderStateDataMap: {}
          }))
        }
      ]
    });
    const dryTerrainMat = {
      destroyed: false,
      shader: makeShader("Terrain/Terrain", RenderQueueType.Opaque),
      shaderData: { _macroCollection: new ShaderMacroCollection() },
      screenSpaceReflectionIntensity: 0,
      screenSpaceReflectionBilateral: false
    };
    const waterMat = {
      destroyed: false,
      shader: makeShader("Water/Lake.v1", RenderQueueType.Transparent),
      shaderData: { _macroCollection: new ShaderMacroCollection() },
      screenSpaceReflectionIntensity: 1,
      screenSpaceReflectionBilateral: false
    };
    const pbrMat = {
      destroyed: false,
      shader: makeShader("PBR", RenderQueueType.Opaque),
      shaderData: { _macroCollection: new ShaderMacroCollection() },
      screenSpaceReflectionIntensity: 1
    };
    const sceneSsr = {
      enabled: true,
      quality: ScreenSpaceReflectionQuality.Medium,
      intensity: 1,
      maxRoughness: 0.6
    };
    const camera = {
      _updateShaderData() {},
      shaderData: { _macroCollection: new ShaderMacroCollection() },
      enableScreenSpaceReflection: true,
      screenSpaceReflectionOverride: null as typeof sceneSsr | null
    } as any;
    const findSpy = vi
      .spyOn(Shader, "find")
      .mockImplementation((name: string) =>
        name === "Lighting/ScreenSpaceReflection" ? (fakeSsrShader as any) : null
      );
    try {
      const dryRoots = [
        {
          getComponentsIncludeChildren(_type: unknown, output: object[]) {
            output.length = 0;
            output.push(renderer(true, false, [dryTerrainMat]));
          }
        }
      ] as any;
      const dryVariants = collectSeedWorldRendererVariants(
        { _macroCollection: new ShaderMacroCollection(), _hardwareRenderer: { supportsRendering: true } } as any,
        {
          shaderData: { _macroCollection: new ShaderMacroCollection() },
          background: { mode: 0 },
          screenSpaceReflection: sceneSsr
        } as any,
        camera,
        dryRoots,
        { includeGpuInstancing: false, includeOpaqueScreenSpaceReflection: false }
      );
      // Dry scene: Terrain SSRReceiver skipped, 0 Lighting/ScreenSpaceReflection passes warmed.
      expect(dryVariants.some((v) => v.shader === "Terrain/Terrain" && v.pi === 1)).toBe(false);
      expect(dryVariants.some((v) => v.shader === "Lighting/ScreenSpaceReflection")).toBe(false);

      const waterRoots = [
        {
          getComponentsIncludeChildren(_type: unknown, output: object[]) {
            output.length = 0;
            output.push(renderer(true, false, [dryTerrainMat, waterMat]));
          }
        }
      ] as any;
      const waterVariants = collectSeedWorldRendererVariants(
        { _macroCollection: new ShaderMacroCollection(), _hardwareRenderer: { supportsRendering: true } } as any,
        {
          shaderData: { _macroCollection: new ShaderMacroCollection() },
          background: { mode: 0 },
          screenSpaceReflection: sceneSsr
        } as any,
        camera,
        waterRoots,
        { includeGpuInstancing: false, includeOpaqueScreenSpaceReflection: false }
      );
      // Water scene (Medium, full-depth prepass): Water SSRReceiver kept + passes 1..6 & 8 warmed (Pass 0 replaced by merged Pass 8; Pass 7 omitted when hardware generateMipmaps handles non-XHigh color pyramid).
      expect(waterVariants.some((v) => v.shader === "Water/Lake.v1" && v.pi === 1)).toBe(true);
      expect(
        waterVariants.some(
          (v) =>
            v.shader === "Water/Lake.v1" &&
            v.pi === 0 &&
            v.macros.some((m) => m.n === "CAMERA_ENABLE_SSR") &&
            v.macros.some((m) => m.n === "CAMERA_SSR_VERIFY_RECEIVER_DEPTH")
        )
      ).toBe(true);
      expect(
        waterVariants.some(
          (v) => v.shader === "Terrain/Terrain" && v.pi === 0 && v.macros.some((m) => m.n === "CAMERA_ENABLE_SSR")
        )
      ).toBe(false);
      const ssrPasses = waterVariants.filter((v) => v.shader === "Lighting/ScreenSpaceReflection");
      expect(new Set(ssrPasses.map((v) => v.pi))).toEqual(new Set([1, 2, 3, 4, 5, 6, 8]));
      const pass1 = ssrPasses.find((v) => v.pi === 1)!;
      expect(pass1.macros.some((m) => m.n === "SSR_DOWNSAMPLE_FROM_FULL_DEPTH")).toBe(true);
      expect(pass1.macros.some((m) => m.n === "SSR_PACKED_NORMAL_OCT8")).toBe(true);
      const pass8 = ssrPasses.find((v) => v.pi === 8)!;
      expect(pass8.macros.some((m) => m.n === "SSR_DOWNSAMPLE_FROM_FULL_DEPTH")).toBe(true);
      expect(pass8.macros.some((m) => m.n === "SSR_PACKED_NORMAL_OCT8")).toBe(true);
      const pass5 = ssrPasses.find((v) => v.pi === 5)!;
      expect(pass5.macros.some((m) => m.n === "SSR_TEMPORAL_5TAP_CLAMP")).toBe(true);

      // Medium HDR + post-opaque transparent-only SSR (forwardDepthResolve + opaqueTextureEnabled):
      // keeps SSR_PACKED_NORMAL_OCT8 + SSR_PACKED_HDR_REINHARD, reuses current-frame color (SSR_CURRENT_FRAME_COLOR),
      // skips WarmupColor Pass 1, and warms merged Pass 8.
      const postOpaqueCamera = {
        _updateShaderData() {},
        _isIndependentCanvasEnabled: () => true,
        _enableForwardDepthResolve: true,
        depthTextureMode: DepthTextureMode.PrePass,
        enableHDR: true,
        opaqueTextureEnabled: true,
        shaderData: { _macroCollection: new ShaderMacroCollection() },
        enableScreenSpaceReflection: true,
        screenSpaceReflectionOverride: { ...sceneSsr, useLinearTrace: true }
      } as any;
      const postOpaqueVariants = collectSeedWorldRendererVariants(
        { _macroCollection: new ShaderMacroCollection(), _hardwareRenderer: { supportsRendering: true } } as any,
        {
          shaderData: { _macroCollection: new ShaderMacroCollection() },
          background: { mode: 0 },
          screenSpaceReflection: sceneSsr
        } as any,
        postOpaqueCamera,
        waterRoots,
        { includeGpuInstancing: false, includeOpaqueScreenSpaceReflection: false }
      );
      const postOpaqueWaterRecv = postOpaqueVariants.find((v) => v.shader === "Water/Lake.v1" && v.pi === 1)!;
      expect(postOpaqueWaterRecv.macros.some((m) => m.n === "SSR_PACKED_NORMAL_OCT8")).toBe(true);
      const postOpaqueWaterFwd = postOpaqueVariants.find(
        (v) => v.shader === "Water/Lake.v1" && v.pi === 0 && v.macros.some((m) => m.n === "CAMERA_ENABLE_SSR")
      )!;
      expect(postOpaqueWaterFwd.macros.some((m) => m.n === "SSR_PACKED_HDR_REINHARD")).toBe(true);
      const postOpaqueSsr = postOpaqueVariants.filter((v) => v.shader === "Lighting/ScreenSpaceReflection");
      expect(new Set(postOpaqueSsr.map((v) => v.pi))).toEqual(new Set([3, 4, 5, 6, 8]));
      const postOpaquePass4 = postOpaqueSsr.find((v) => v.pi === 4)!;
      expect(postOpaquePass4.macros.some((m) => m.n === "SSR_CURRENT_FRAME_COLOR")).toBe(true);
      expect(postOpaquePass4.macros.some((m) => m.n === "SSR_LINEAR_TRACE")).toBe(true);
      expect(postOpaquePass4.macros.some((m) => m.n === "SSR_PACKED_HDR_REINHARD")).toBe(true);
      expect(postOpaquePass4.macros.some((m) => m.n === "SSR_PACKED_NORMAL_OCT8")).toBe(true);
      const postOpaquePass5 = postOpaqueSsr.find((v) => v.pi === 5)!;
      expect(postOpaquePass5.macros.some((m) => m.n === "SSR_TEMPORAL_5TAP_CLAMP")).toBe(true);
      expect(postOpaquePass5.macros.some((m) => m.n === "SSR_PACKED_HDR_REINHARD")).toBe(true);
      const postOpaquePass8 = postOpaqueSsr.find((v) => v.pi === 8)!;
      expect(postOpaquePass8.macros.some((m) => m.n === "SSR_DOWNSAMPLE_FROM_FULL_DEPTH")).toBe(true);
      expect(postOpaquePass8.macros.some((m) => m.n === "SSR_PACKED_HDR_REINHARD")).toBe(true);
      expect(postOpaquePass8.macros.some((m) => m.n === "SSR_PACKED_NORMAL_OCT8")).toBe(true);

      // Linear trace mode (useLinearTrace: true) skips BuildHiZMipN (pass 2) and warms SSR_LINEAR_TRACE on HiZTrace (pass 4).
      camera.screenSpaceReflectionOverride = {
        ...sceneSsr,
        useLinearTrace: true
      };
      const linearWaterVariants = collectSeedWorldRendererVariants(
        { _macroCollection: new ShaderMacroCollection(), _hardwareRenderer: { supportsRendering: true } } as any,
        {
          shaderData: { _macroCollection: new ShaderMacroCollection() },
          background: { mode: 0 },
          screenSpaceReflection: sceneSsr
        } as any,
        camera,
        waterRoots,
        { includeGpuInstancing: false, includeOpaqueScreenSpaceReflection: false }
      );
      const linearSsrPasses = linearWaterVariants.filter((v) => v.shader === "Lighting/ScreenSpaceReflection");
      expect(new Set(linearSsrPasses.map((v) => v.pi))).toEqual(new Set([1, 3, 4, 5, 6, 8]));
      const linearTracePass = linearSsrPasses.find((v) => v.pi === 4)!;
      expect(linearTracePass.macros.some((m) => m.n === "SSR_LINEAR_TRACE")).toBe(true);

      // Low quality disables temporal resolve (pass 5).
      camera.screenSpaceReflectionOverride = {
        ...sceneSsr,
        quality: ScreenSpaceReflectionQuality.Low
      };
      const lowWaterVariants = collectSeedWorldRendererVariants(
        { _macroCollection: new ShaderMacroCollection(), _hardwareRenderer: { supportsRendering: true } } as any,
        {
          shaderData: { _macroCollection: new ShaderMacroCollection() },
          background: { mode: 0 },
          screenSpaceReflection: sceneSsr
        } as any,
        camera,
        waterRoots,
        { includeGpuInstancing: false, includeOpaqueScreenSpaceReflection: false }
      );
      const lowSsrPasses = lowWaterVariants.filter((v) => v.shader === "Lighting/ScreenSpaceReflection");
      expect(new Set(lowSsrPasses.map((v) => v.pi))).toEqual(new Set([1, 2, 3, 4, 6, 8]));

      // Software fallback device (supportsRenderTargetColorFormat = false) still warms Pass 7 on non-XHigh.
      const fallbackDeviceVariants = collectSeedWorldRendererVariants(
        {
          _macroCollection: new ShaderMacroCollection(),
          _hardwareRenderer: { supportsRendering: true, supportsRenderTargetColorFormat: () => false }
        } as any,
        {
          shaderData: { _macroCollection: new ShaderMacroCollection() },
          background: { mode: 0 },
          screenSpaceReflection: sceneSsr
        } as any,
        camera,
        waterRoots,
        { includeGpuInstancing: false, includeOpaqueScreenSpaceReflection: false }
      );
      expect(fallbackDeviceVariants.some((v) => v.shader === "Lighting/ScreenSpaceReflection" && v.pi === 7)).toBe(
        true
      );

      // XHigh quality warms Pass 7 (base + SSR_COLOR_PYRAMID_KARIS_DOWNSAMPLE).
      camera.screenSpaceReflectionOverride = {
        ...sceneSsr,
        quality: ScreenSpaceReflectionQuality.XHigh
      };
      const xhighWaterVariants = collectSeedWorldRendererVariants(
        { _macroCollection: new ShaderMacroCollection(), _hardwareRenderer: { supportsRendering: true } } as any,
        {
          shaderData: { _macroCollection: new ShaderMacroCollection() },
          background: { mode: 0 },
          screenSpaceReflection: sceneSsr
        } as any,
        camera,
        waterRoots,
        { includeGpuInstancing: false, includeOpaqueScreenSpaceReflection: false }
      );
      expect(
        xhighWaterVariants.some(
          (v) =>
            v.shader === "Lighting/ScreenSpaceReflection" &&
            v.pi === 7 &&
            !v.macros.some((m) => m.n === "SSR_COLOR_PYRAMID_KARIS_DOWNSAMPLE")
        )
      ).toBe(true);
      expect(
        xhighWaterVariants.some(
          (v) =>
            v.shader === "Lighting/ScreenSpaceReflection" &&
            v.pi === 7 &&
            v.macros.some((m) => m.n === "SSR_COLOR_PYRAMID_KARIS_DOWNSAMPLE")
        )
      ).toBe(true);

      // High quality warms hitDist, high virtual reprojection, bilateral sampling for PBR, and 2-tap depth-verified SSR for Water & Terrain.
      camera.screenSpaceReflectionOverride = {
        ...sceneSsr,
        quality: ScreenSpaceReflectionQuality.High
      };
      const highPbrRoots = [
        {
          getComponentsIncludeChildren(_type: unknown, output: object[]) {
            output.length = 0;
            output.push(renderer(true, false, [dryTerrainMat, waterMat, pbrMat]));
          }
        }
      ] as any;
      const highWaterVariants = collectSeedWorldRendererVariants(
        { _macroCollection: new ShaderMacroCollection(), _hardwareRenderer: { supportsRendering: true } } as any,
        {
          shaderData: { _macroCollection: new ShaderMacroCollection() },
          background: { mode: 0 },
          screenSpaceReflection: sceneSsr
        } as any,
        camera,
        highPbrRoots,
        { includeGpuInstancing: false, includeOpaqueScreenSpaceReflection: false }
      );
      expect(
        highWaterVariants.some(
          (v) =>
            v.shader === "Lighting/ScreenSpaceReflection" &&
            v.pi === 4 &&
            v.macros.some((m) => m.n === "SSR_OUTPUT_HIT_DIST")
        )
      ).toBe(true);
      expect(
        highWaterVariants.some(
          (v) =>
            v.shader === "Lighting/ScreenSpaceReflection" &&
            v.pi === 5 &&
            v.macros.some((m) => m.n === "SSR_HIGH_VIRTUAL_REPROJECTION")
        )
      ).toBe(true);
      expect(
        highWaterVariants.some(
          (v) =>
            v.shader === "PBR" &&
            v.pi === 0 &&
            v.macros.some((m) => m.n === "CAMERA_ENABLE_SSR") &&
            v.macros.some((m) => m.n === "CAMERA_SSR_BILATERAL_SAMPLE") &&
            !v.macros.some((m) => m.n === "CAMERA_SSR_VERIFY_RECEIVER_DEPTH")
        )
      ).toBe(true);
      expect(
        highWaterVariants.some(
          (v) =>
            v.shader === "Water/Lake.v1" &&
            v.pi === 0 &&
            v.macros.some((m) => m.n === "CAMERA_ENABLE_SSR") &&
            v.macros.some((m) => m.n === "CAMERA_SSR_VERIFY_RECEIVER_DEPTH") &&
            !v.macros.some((m) => m.n === "CAMERA_SSR_BILATERAL_SAMPLE")
        )
      ).toBe(true);
      expect(
        highWaterVariants.some(
          (v) => v.shader === "Terrain/Terrain" && v.pi === 0 && v.macros.some((m) => m.n === "CAMERA_ENABLE_SSR")
        )
      ).toBe(false);

      // Opaque wet terrain (screenSpaceReflectionBilateral = false) receives CAMERA_SSR_VERIFY_RECEIVER_DEPTH (not bilateral) even without Water.
      const opaqueOnlyTerrainRoots = [
        {
          getComponentsIncludeChildren(_type: unknown, output: object[]) {
            output.length = 0;
            output.push(renderer(true, false, [dryTerrainMat]));
          }
        }
      ] as any;
      const wetHighVariants = collectSeedWorldRendererVariants(
        { _macroCollection: new ShaderMacroCollection(), _hardwareRenderer: { supportsRendering: true } } as any,
        {
          shaderData: { _macroCollection: new ShaderMacroCollection() },
          background: { mode: 0 },
          screenSpaceReflection: sceneSsr
        } as any,
        camera,
        opaqueOnlyTerrainRoots,
        { includeGpuInstancing: false, includeOpaqueScreenSpaceReflection: true }
      );
      expect(
        wetHighVariants.some(
          (v) =>
            v.shader === "Terrain/Terrain" &&
            v.pi === 0 &&
            v.macros.some((m) => m.n === "CAMERA_ENABLE_SSR") &&
            v.macros.some((m) => m.n === "CAMERA_SSR_VERIFY_RECEIVER_DEPTH") &&
            !v.macros.some((m) => m.n === "CAMERA_SSR_BILATERAL_SAMPLE")
        )
      ).toBe(true);

      // Under Medium quality with both Water and wet Terrain, warm both verified and opaque-only Terrain variants.
      camera.screenSpaceReflectionOverride = {
        ...sceneSsr,
        quality: ScreenSpaceReflectionQuality.Medium
      };
      const mixedMediumVariants = collectSeedWorldRendererVariants(
        { _macroCollection: new ShaderMacroCollection(), _hardwareRenderer: { supportsRendering: true } } as any,
        {
          shaderData: { _macroCollection: new ShaderMacroCollection() },
          background: { mode: 0 },
          screenSpaceReflection: sceneSsr
        } as any,
        camera,
        waterRoots,
        { includeGpuInstancing: false, includeOpaqueScreenSpaceReflection: true }
      );
      expect(
        mixedMediumVariants.some(
          (v) =>
            v.shader === "Terrain/Terrain" &&
            v.pi === 0 &&
            v.macros.some((m) => m.n === "CAMERA_ENABLE_SSR") &&
            v.macros.some((m) => m.n === "CAMERA_SSR_VERIFY_RECEIVER_DEPTH")
        )
      ).toBe(true);
      expect(
        mixedMediumVariants.some(
          (v) =>
            v.shader === "Terrain/Terrain" &&
            v.pi === 0 &&
            v.macros.some((m) => m.n === "CAMERA_ENABLE_SSR") &&
            !v.macros.some((m) => m.n === "CAMERA_SSR_VERIFY_RECEIVER_DEPTH")
        )
      ).toBe(true);
    } finally {
      findSpy.mockRestore();
    }
  });

  it("warms additionalInstancedRenderers with GPU instancing and omits redundant LOD_DITHER synthesis by default", () => {
    const unmaterializedTree = renderer(false, false, [
      {
        destroyed: false,
        shader: {
          name: "Terrain/Vegetation",
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
      [],
      {
        includeGpuInstancing: true,
        onlySharedMeshGpuInstancing: true,
        additionalInstancedRenderers: [unmaterializedTree]
      }
    );
    // Single temporary representative still gets RENDERER_GPU_INSTANCE under onlySharedMeshGpuInstancing.
    expect(
      variants.some((v) => v.shader === "Terrain/Vegetation" && v.macros.some((m) => m.n === "RENDERER_GPU_INSTANCE"))
    ).toBe(true);
    // includeLodDither defaults to false: must not synthesize RENDERER_LOD_DITHER onto a renderer without it.
    expect(
      variants.some((v) => v.shader === "Terrain/Vegetation" && v.macros.some((m) => m.n === "RENDERER_LOD_DITHER"))
    ).toBe(false);
  });

  it("falls back SSR Forward variants on MAX_TEXTURE_IMAGE_UNITS overflow and caches _ssrFallback* while failing strictly on GLSL errors", async () => {
    const enableSsrMacro = ShaderMacro.getByName("CAMERA_ENABLE_SSR");
    const bilateralMacro = ShaderMacro.getByName("CAMERA_SSR_BILATERAL_SAMPLE");
    const verifyDepthMacro = ShaderMacro.getByName("CAMERA_SSR_VERIFY_RECEIVER_DEPTH");
    const makeMockEngine = () =>
      ({
        _hardwareRenderer: {
          capability: { maxFragmentTextureUnits: 16 }
        }
      }) as any;

    const fakeLevel2 = {
      isValid: false,
      _errorLog: "link: FRAGMENT shader texture image units count exceeds MAX_TEXTURE_IMAGE_UNITS(16)",
      _pollReady: () => true
    } as any;
    const fakeLevel1Overflow = {
      isValid: true,
      activeTextureCount: 17,
      _pollReady: () => true
    } as any;
    const fakeLevel0 = {
      isValid: true,
      activeTextureCount: 14,
      _pollReady: () => true
    } as any;

    const fakePassCaseA = {
      _getShaderProgram(_engine: unknown, macros: ShaderMacroCollection) {
        if (macros.isEnable(bilateralMacro)) return fakeLevel2;
        if (macros.isEnable(enableSsrMacro)) {
          expect(macros.isEnable(verifyDepthMacro)).toBe(true);
          return fakeLevel1Overflow;
        }
        return fakeLevel0;
      }
    };

    const fakeShaderCaseA = {
      name: "Terrain/MockFallbackA",
      subShaders: [{ passes: [fakePassCaseA] }]
    };

    const findSpy = vi.spyOn(Shader, "find").mockImplementation((name: string) => {
      if (name === "Terrain/MockFallbackA") return fakeShaderCaseA as any;
      return null;
    });

    try {
      // Case A: Level 2 (link overflow) -> Level 1 (activeTextureCount 17 > 16) -> Level 0 (succeeds)
      const reportA = await warmupSeedWorldShaderVariants(
        makeMockEngine(),
        [
          {
            shader: "Terrain/MockFallbackA",
            si: 0,
            pi: 0,
            macros: [{ n: "CAMERA_ENABLE_SSR" }, { n: "CAMERA_SSR_BILATERAL_SAMPLE" }]
          }
        ],
        { strict: true, ssrVerifyReceiverDepth: true, frameBudgetMilliseconds: 1000 }
      );
      expect(reportA.compiled).toBe(1);
      expect(reportA.issues).toEqual([]);
      expect(fakeLevel2._ssrFallbackMaxUnits).toBe(16);
      expect(fakeLevel2._ssrFallbackVerify).toBe(fakeLevel0);
      expect(fakeLevel1Overflow._ssrFallbackMaxUnits).toBe(16);
      expect(fakeLevel1Overflow._ssrFallbackVerify).toBe(fakeLevel0);

      // Case B: Level 2 -> Level 1 (succeeds at activeTextureCount 16 <= 16)
      const fakeLevel2B = {
        isValid: false,
        _errorLog: "link: FRAGMENT shader texture image units count exceeds MAX_TEXTURE_IMAGE_UNITS(16)",
        _pollReady: () => true
      } as any;
      const fakeLevel1Ok = {
        isValid: true,
        activeTextureCount: 16,
        _pollReady: () => true
      } as any;
      const fakePassCaseB = {
        _getShaderProgram(_engine: unknown, macros: ShaderMacroCollection) {
          if (macros.isEnable(bilateralMacro)) return fakeLevel2B;
          if (macros.isEnable(enableSsrMacro) && macros.isEnable(verifyDepthMacro)) return fakeLevel1Ok;
          throw new Error("Unexpected fallback beyond Level 1");
        }
      };
      findSpy.mockImplementation((name: string) =>
        name === "Terrain/MockFallbackB" ? ({ name, subShaders: [{ passes: [fakePassCaseB] }] } as any) : null
      );
      const reportB = await warmupSeedWorldShaderVariants(
        makeMockEngine(),
        [
          {
            shader: "Terrain/MockFallbackB",
            si: 0,
            pi: 0,
            macros: [{ n: "CAMERA_ENABLE_SSR" }, { n: "CAMERA_SSR_BILATERAL_SAMPLE" }]
          }
        ],
        { strict: true, ssrVerifyReceiverDepth: true, frameBudgetMilliseconds: 1000 }
      );
      expect(reportB.compiled).toBe(1);
      expect(reportB.issues).toEqual([]);
      expect(fakeLevel2B._ssrFallbackMaxUnits).toBe(16);
      expect(fakeLevel2B._ssrFallbackVerify).toBe(fakeLevel1Ok);

      // Case C: Non-overflow GLSL/redefinition error must NOT fall back and must still throw under strict: true
      const fakeBrokenProgram = {
        isValid: false,
        _errorLog: "ERROR: 0:10: 'camera_ProjectionParams' : redefinition",
        _pollReady: () => true
      } as any;
      const fakePassCaseC = {
        _getShaderProgram(_engine: unknown, macros: ShaderMacroCollection) {
          if (macros.isEnable(enableSsrMacro)) return fakeBrokenProgram;
          throw new Error("Should not fall back on non-overflow GLSL errors");
        }
      };
      findSpy.mockImplementation((name: string) =>
        name === "Terrain/MockBrokenC" ? ({ name, subShaders: [{ passes: [fakePassCaseC] }] } as any) : null
      );
      await expect(
        warmupSeedWorldShaderVariants(
          makeMockEngine(),
          [
            {
              shader: "Terrain/MockBrokenC",
              si: 0,
              pi: 0,
              macros: [{ n: "CAMERA_ENABLE_SSR" }]
            }
          ],
          { strict: true, frameBudgetMilliseconds: 1000 }
        )
      ).rejects.toThrow("redefinition");
    } finally {
      findSpy.mockRestore();
    }
  });

  it("expands vegetation, surface, and terrain shaders for authoring CRUD rainbow effects when includeGenerationReveal is enabled", () => {
    const expanded = withSeedWorldGenerationRevealVariants([
      { shader: "Terrain/Vegetation", si: 0, pi: 0, macros: [] },
      { shader: "Terrain/Surface", si: 0, pi: 0, macros: [] },
      { shader: "Terrain/Terrain", si: 0, pi: 0, macros: [] },
      { shader: "Terrain/Vegetation", si: 0, pi: 0, macros: [{ n: "RENDERER_WORLD_PICK" }] }
    ]);
    expect(
      expanded.some(
        (v) => v.shader === "Terrain/Vegetation" && v.macros.some((m) => m.n === "RENDERER_GENERATION_REVEAL")
      )
    ).toBe(true);
    expect(
      expanded.some((v) => v.shader === "Terrain/Surface" && v.macros.some((m) => m.n === "RENDERER_GENERATION_REVEAL"))
    ).toBe(true);
    expect(
      expanded.some(
        (v) => v.shader === "Terrain/Terrain" && v.macros.some((m) => m.n === "TERRAIN_PROJECT_ENTRANCE_WAVE")
      )
    ).toBe(true);
    expect(
      expanded.some(
        (v) =>
          v.macros.some((m) => m.n === "RENDERER_WORLD_PICK") &&
          v.macros.some((m) => m.n === "RENDERER_GENERATION_REVEAL")
      )
    ).toBe(false);
  });

  it("omits SCENE_POINT_LIGHT_COUNT expansion on GLOBAL_PROXY_ENTRANCE variants while keeping it on steady-state Masonry/GlobalProxy", () => {
    const entranceMacros = new ShaderMacroCollection();
    entranceMacros.enable(ShaderMacro.getByName("GLOBAL_PROXY_ENTRANCE"));
    const globalProxyRenderer = renderer(true, false, [
      {
        destroyed: false,
        shader: {
          name: "Masonry/GlobalProxy",
          destroyed: false,
          subShaders: [{ passes: [{ getTagValue: () => "Forward" }] }]
        },
        shaderData: { _macroCollection: entranceMacros }
      }
    ]);

    const variants = collectSeedWorldRendererVariants(
      { _macroCollection: new ShaderMacroCollection() } as any,
      { shaderData: { _macroCollection: new ShaderMacroCollection() }, background: { mode: 0 } } as any,
      { _updateShaderData() {}, shaderData: { _macroCollection: new ShaderMacroCollection() } } as any,
      [],
      {
        additionalRenderers: [globalProxyRenderer],
        additionalPointLightCounts: [4]
      }
    );

    const hasMacro = (v: (typeof variants)[number], name: string, value?: string) =>
      v.macros.some((m) => m.n === name && (value === undefined || m.v === value));
    // Entrance variant must NOT expand SCENE_POINT_LIGHT_COUNT=4.
    expect(
      variants.some(
        (v) =>
          v.shader === "Masonry/GlobalProxy" &&
          hasMacro(v, "GLOBAL_PROXY_ENTRANCE") &&
          hasMacro(v, "SCENE_POINT_LIGHT_COUNT", "4")
      )
    ).toBe(false);
    // Paired steady-state variant (macro-off) MUST still expand SCENE_POINT_LIGHT_COUNT=4.
    expect(
      variants.some(
        (v) =>
          v.shader === "Masonry/GlobalProxy" &&
          !hasMacro(v, "GLOBAL_PROXY_ENTRANCE") &&
          hasMacro(v, "SCENE_POINT_LIGHT_COUNT", "4")
      )
    ).toBe(true);
  });

  it("collects steady-state ShadowCaster for Masonry/GlobalProxy with GLOBAL_PROXY_PLASTER when shadow-only companion is present", () => {
    const structMacros = new ShaderMacroCollection();
    structMacros.enable(ShaderMacro.getByName("GLOBAL_PROXY_ENTRANCE"));
    structMacros.enable(ShaderMacro.getByName("GLOBAL_PROXY_PLASTER"));
    const globalProxyShader = {
      name: "Masonry/GlobalProxy",
      destroyed: false,
      subShaders: [{ passes: [{ getTagValue: () => "ShadowCaster" }, { getTagValue: () => "Forward" }] }]
    };
    const shadowOnlyMat = {
      destroyed: false,
      shader: {
        name: "Masonry/GlobalProxyShadowOnly",
        destroyed: false,
        subShaders: [{ passes: [{ getTagValue: () => "ShadowCaster" }] }]
      },
      shaderData: { _macroCollection: new ShaderMacroCollection() }
    };
    const bucketRenderer = renderer(
      true,
      false,
      [
        {
          destroyed: false,
          shader: globalProxyShader,
          shaderData: { _macroCollection: structMacros }
        }
      ],
      false
    );
    const findSpy = vi
      .spyOn(Shader, "find")
      .mockImplementation((name: string) => (name === "Masonry/GlobalProxy" ? (globalProxyShader as any) : null));
    try {
      const variants = collectSeedWorldRendererVariants(
        { _macroCollection: new ShaderMacroCollection() } as any,
        { shaderData: { _macroCollection: new ShaderMacroCollection() }, background: { mode: 0 } } as any,
        { _updateShaderData() {}, shaderData: { _macroCollection: new ShaderMacroCollection() } } as any,
        [],
        {
          includeGpuInstancing: false,
          additionalRenderers: [bucketRenderer],
          additionalRendererMaterials: new Map([[bucketRenderer, [shadowOnlyMat as any]]])
        }
      );

      // Steady-state ShadowCaster (pi=0) with GLOBAL_PROXY_PLASTER must be collected for t=2.4s settle.
      expect(
        variants.some(
          (v) =>
            v.shader === "Masonry/GlobalProxy" &&
            v.pi === 0 &&
            v.macros.every((m) => m.n !== "GLOBAL_PROXY_ENTRANCE") &&
            v.macros.some((m) => m.n === "GLOBAL_PROXY_PLASTER")
        )
      ).toBe(true);
      // Entrance ShadowCaster (pi=0) with GLOBAL_PROXY_ENTRANCE must remain omitted while castShadows=false.
      expect(
        variants.some(
          (v) =>
            v.shader === "Masonry/GlobalProxy" && v.pi === 0 && v.macros.some((m) => m.n === "GLOBAL_PROXY_ENTRANCE")
        )
      ).toBe(false);
    } finally {
      findSpy.mockRestore();
    }
  });

  it("collects steady-state ShadowCaster with GLOBAL_PROXY_PLASTER regardless of bucket ordering when a non-shadow bucket precedes a shadow-casting bucket", () => {
    const makeStructMacros = () => {
      const m = new ShaderMacroCollection();
      m.enable(ShaderMacro.getByName("GLOBAL_PROXY_ENTRANCE"));
      m.enable(ShaderMacro.getByName("GLOBAL_PROXY_PLASTER"));
      return m;
    };
    const globalProxyShader = {
      name: "Masonry/GlobalProxy",
      destroyed: false,
      subShaders: [{ passes: [{ getTagValue: () => "ShadowCaster" }, { getTagValue: () => "Forward" }] }]
    };
    const shadowOnlyMat = {
      destroyed: false,
      shader: {
        name: "Masonry/GlobalProxyShadowOnly",
        destroyed: false,
        subShaders: [{ passes: [{ getTagValue: () => "ShadowCaster" }] }]
      },
      shaderData: { _macroCollection: new ShaderMacroCollection() }
    };
    const noShadowBucket = renderer(
      true,
      false,
      [
        {
          destroyed: false,
          shader: globalProxyShader,
          shaderData: { _macroCollection: makeStructMacros() }
        }
      ],
      false
    );
    const shadowBucket = renderer(
      true,
      false,
      [
        {
          destroyed: false,
          shader: globalProxyShader,
          shaderData: { _macroCollection: makeStructMacros() }
        }
      ],
      false
    );
    const findSpy = vi
      .spyOn(Shader, "find")
      .mockImplementation((name: string) => (name === "Masonry/GlobalProxy" ? (globalProxyShader as any) : null));
    try {
      const collect = (order: MeshRenderer[]) =>
        collectSeedWorldRendererVariants(
          { _macroCollection: new ShaderMacroCollection() } as any,
          { shaderData: { _macroCollection: new ShaderMacroCollection() }, background: { mode: 0 } } as any,
          { _updateShaderData() {}, shaderData: { _macroCollection: new ShaderMacroCollection() } } as any,
          [],
          {
            includeGpuInstancing: false,
            additionalRenderers: order,
            additionalRendererMaterials: new Map([[shadowBucket, [shadowOnlyMat as any]]])
          }
        );
      const hasSteadyPlasterShadow = (list: ReturnType<typeof collect>) =>
        list.some(
          (v) =>
            v.shader === "Masonry/GlobalProxy" &&
            v.pi === 0 &&
            v.macros.every((m) => m.n !== "GLOBAL_PROXY_ENTRANCE") &&
            v.macros.some((m) => m.n === "GLOBAL_PROXY_PLASTER")
        );
      expect(hasSteadyPlasterShadow(collect([noShadowBucket, shadowBucket]))).toBe(true);
      expect(hasSteadyPlasterShadow(collect([shadowBucket, noShadowBucket]))).toBe(true);
    } finally {
      findSpy.mockRestore();
    }
  });

  it("supports view-culled additionalCameraOnlyRenderers and additionalShadowOnlyRenderers under onlyEnabledRenderers", () => {
    const vegShader = {
      name: "Terrain/Vegetation",
      destroyed: false,
      subShaders: [
        {
          passes: [{ getTagValue: () => "Forward" }, { getTagValue: () => "ShadowCaster" }]
        }
      ]
    };
    const camBucket = renderer(true, false, [
      { destroyed: false, shader: vegShader, shaderData: { _macroCollection: new ShaderMacroCollection() } }
    ]);
    camBucket.shaderData._macroCollection.enable(ShaderMacro.getByName("RENDERER_IS_RECEIVE_SHADOWS"));

    const shadowView = renderer(false, false, [
      { destroyed: false, shader: vegShader, shaderData: { _macroCollection: new ShaderMacroCollection() } }
    ]);

    const variants = collectSeedWorldRendererVariants(
      { _macroCollection: new ShaderMacroCollection() } as any,
      { shaderData: { _macroCollection: new ShaderMacroCollection() }, background: { mode: 0 } } as any,
      { _updateShaderData() {}, shaderData: { _macroCollection: new ShaderMacroCollection() } } as any,
      [],
      {
        onlyEnabledRenderers: true,
        includeGpuInstancing: false,
        additionalCameraOnlyRenderers: [camBucket],
        additionalShadowOnlyRenderers: [shadowView]
      }
    );

    const forward = variants.filter((v) => v.shader === "Terrain/Vegetation" && v.pi === 0);
    const shadow = variants.filter((v) => v.shader === "Terrain/Vegetation" && v.pi === 1);
    expect(forward).toHaveLength(1);
    expect(forward[0]!.macros.some((m) => m.n === "RENDERER_IS_RECEIVE_SHADOWS")).toBe(true);
    expect(shadow).toHaveLength(1);
    expect(shadow[0]!.macros.some((m) => m.n === "RENDERER_IS_RECEIVE_SHADOWS")).toBe(false);
  });

  it("strips transient masonry dither macros when includeMasonryDither is false", () => {
    const masonryShader = {
      name: "Masonry/TestWall",
      destroyed: false,
      subShaders: [{ passes: [{ getTagValue: () => "Forward" }] }]
    };
    const masonryRenderer = renderer(true, false, [
      { destroyed: false, shader: masonryShader, shaderData: { _macroCollection: new ShaderMacroCollection() } }
    ]);
    masonryRenderer.shaderData._macroCollection.enable(ShaderMacro.getByName("RENDERER_MASONRY_DITHER"));
    masonryRenderer.shaderData._macroCollection.enable(ShaderMacro.getByName("RENDERER_MASONRY_ENTRANCE"));

    const variants = collectSeedWorldRendererVariants(
      { _macroCollection: new ShaderMacroCollection() } as any,
      { shaderData: { _macroCollection: new ShaderMacroCollection() }, background: { mode: 0 } } as any,
      { _updateShaderData() {}, shaderData: { _macroCollection: new ShaderMacroCollection() } } as any,
      [],
      {
        includeMasonryDither: false,
        includeMasonryEntrance: false,
        additionalRenderers: [masonryRenderer]
      }
    );

    const masonryVariants = variants.filter((v) => v.shader === "Masonry/TestWall");
    expect(masonryVariants).toHaveLength(1);
    expect(masonryVariants[0]!.macros.some((m) => m.n === "RENDERER_MASONRY_DITHER")).toBe(false);
    expect(masonryVariants[0]!.macros.some((m) => m.n === "RENDERER_MASONRY_ENTRANCE")).toBe(true);
  });

  it("defers inactive far-only Ocean near-field variants out of primary warmup and collects them via includeInactiveRoots", () => {
    const oceanNearShader = {
      name: "Water/Ocean.v1",
      destroyed: false,
      subShaders: [{ passes: [{ getTagValue: () => "Forward" }] }]
    };
    const oceanFarShader = {
      name: "WaterFar/test-ocean-far",
      destroyed: false,
      subShaders: [{ passes: [{ getTagValue: () => "Forward" }] }]
    };
    const oceanNearRenderer = Object.create(MeshRenderer.prototype);
    Object.defineProperties(oceanNearRenderer, {
      entity: { value: { isActiveInHierarchy: false } },
      shaderData: { value: { _macroCollection: new ShaderMacroCollection() } },
      mesh: { value: { _primitive: { vertexElements: [{ attribute: "TEXCOORD_0" }] } } },
      enabled: { value: false },
      castShadows: { value: false },
      getMaterials: {
        value: () => [
          { destroyed: false, shader: oceanNearShader, shaderData: { _macroCollection: new ShaderMacroCollection() } }
        ]
      }
    });
    const oceanFarRenderer = Object.create(MeshRenderer.prototype);
    Object.defineProperties(oceanFarRenderer, {
      entity: { value: { isActiveInHierarchy: true } },
      shaderData: { value: { _macroCollection: new ShaderMacroCollection() } },
      mesh: { value: { _primitive: { vertexElements: [{ attribute: "TEXCOORD_0" }] } } },
      enabled: { value: true },
      castShadows: { value: false },
      getMaterials: {
        value: () => [
          { destroyed: false, shader: oceanFarShader, shaderData: { _macroCollection: new ShaderMacroCollection() } }
        ]
      }
    });
    const waterRoot = {
      getComponentsIncludeChildren: (_type: unknown, out: unknown[]) => {
        out.length = 0;
        out.push(oceanNearRenderer, oceanFarRenderer);
      }
    } as any;

    const primary = collectSeedWorldRendererVariants(
      { _macroCollection: new ShaderMacroCollection() } as any,
      { shaderData: { _macroCollection: new ShaderMacroCollection() }, background: { mode: 0 } } as any,
      { _updateShaderData() {}, shaderData: { _macroCollection: new ShaderMacroCollection() } } as any,
      [waterRoot],
      {
        includeInactiveEntities: false,
        includeInactiveRoots: undefined,
        onlyEnabledRenderers: true,
        includeGpuInstancing: false
      }
    );
    expect(primary.some((v) => v.shader === "WaterFar/test-ocean-far")).toBe(true);
    expect(primary.some((v) => v.shader === "Water/Ocean.v1")).toBe(false);

    const deferredAll = collectSeedWorldRendererVariants(
      { _macroCollection: new ShaderMacroCollection() } as any,
      { shaderData: { _macroCollection: new ShaderMacroCollection() }, background: { mode: 0 } } as any,
      { _updateShaderData() {}, shaderData: { _macroCollection: new ShaderMacroCollection() } } as any,
      [waterRoot],
      {
        includeInactiveEntities: false,
        includeInactiveRoots: [waterRoot],
        includeGpuInstancing: false
      }
    );
    expect(deferredAll.some((v) => v.shader === "WaterFar/test-ocean-far")).toBe(true);
    expect(deferredAll.some((v) => v.shader === "Water/Ocean.v1")).toBe(true);
  });
});
