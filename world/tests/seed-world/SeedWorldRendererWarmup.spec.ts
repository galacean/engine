import { describe, expect, it, vi } from "vitest";
import {
  DepthTextureMode,
  type Entity,
  Matrix,
  MeshRenderer,
  PointLight,
  RHIBackend,
  Renderer,
  RenderQueueType,
  ScreenSpaceReflectionQuality,
  Shader,
  ShadowType,
  SkinnedMeshRenderer,
  ShaderMacro,
  ShaderMacroCollection,
  Vector3,
  VolumetricLightQuality
} from "@galacean/engine";
import {
  collectSeedWorldRendererVariants,
  hasParallelShaderCompile,
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

  it.each([
    { label: "explicit delta capped at five", external: 2, pool: 0, hasLamps: undefined, expected: [2, 5] },
    { label: "four active wall lamps", external: 0, pool: 4, hasLamps: true, expected: [0, 1] },
    { label: "target without lamps", external: 1, pool: 4, hasLamps: false, expected: [1] },
    { label: "capped scene with four external lights", external: 4, pool: 4, hasLamps: true, expected: [4, 5] },
    { label: "external lights fill capacity", external: 6, pool: 4, hasLamps: true, expected: [5] },
    { label: "world publication", external: 1, pool: 4, hasLamps: true, publish: true, expected: [1, 2] }
  ])("collects the exact Forward light counts for $label", ({ external, pool, hasLamps, publish, expected }) => {
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

    const poolRoot = { isActive: true } as Entity;
    const lights = Array.from({ length: external + pool }, (_, i) =>
      Object.create(PointLight.prototype, {
        enabled: { value: true },
        entity: { value: { isActive: true, parent: i < pool ? poolRoot : null } }
      })
    );
    const lightRoot = {
      getComponentsIncludeChildren(type: unknown, output: PointLight[]) {
        output.length = 0;
        if (type === PointLight) output.push(...lights);
      }
    };
    const variants = collectSeedWorldRendererVariants(
      { _macroCollection: new ShaderMacroCollection() } as any,
      {
        shaderData: { _macroCollection: sceneMacros },
        background: { mode: 0 },
        rootEntities: [lightRoot],
        _lightManager: {
          _pointData: { color: new Float32Array(5 * 3) },
          _pointLights: { length: lights.length, get: (i: number) => lights[i] }
        }
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
        activatedLightRoots: publish ? [] : undefined,
        ...(hasLamps === undefined
          ? { additionalPointLightCounts: [4] }
          : { buildingPointLights: { poolRoot, hasLights: hasLamps } })
      }
    );
    const counts = variants
      .filter((variant) => variant.shader === "Terrain/Terrain")
      .map((variant) => Number(variant.macros.find((macro) => macro.n === "SCENE_POINT_LIGHT_COUNT")?.v ?? 0));
    expect([...new Set(counts)].sort((a, b) => a - b)).toEqual(expected);
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

      // Post-reveal secondary warmup opts into `includeSsrHistoryFallback: true` so Pass 1 (BuildHiZMip0)
      // and Pass 4 (HiZTrace without SSR_CURRENT_FRAME_COLOR) are precompiled in background, avoiding
      // synchronous mid-roam compile hitches if runtime falls back from current-frame color to history color.
      const postOpaqueWithFallback = collectSeedWorldRendererVariants(
        { _macroCollection: new ShaderMacroCollection(), _hardwareRenderer: { supportsRendering: true } } as any,
        {
          shaderData: { _macroCollection: new ShaderMacroCollection() },
          background: { mode: 0 },
          screenSpaceReflection: sceneSsr
        } as any,
        postOpaqueCamera,
        waterRoots,
        {
          includeGpuInstancing: false,
          includeOpaqueScreenSpaceReflection: false,
          includeSsrHistoryFallback: true
        }
      );
      const fallbackSsr = postOpaqueWithFallback.filter((v) => v.shader === "Lighting/ScreenSpaceReflection");
      expect(new Set(fallbackSsr.map((v) => v.pi))).toEqual(new Set([1, 3, 4, 5, 6, 8]));
      const fallbackPass1 = fallbackSsr.find((v) => v.pi === 1)!;
      expect(fallbackPass1.macros.some((m) => m.n === "SSR_DOWNSAMPLE_FROM_FULL_DEPTH")).toBe(true);
      const fallbackPass4s = fallbackSsr.filter((v) => v.pi === 4);
      expect(fallbackPass4s).toHaveLength(2);
      expect(fallbackPass4s.some((v) => v.macros.some((m) => m.n === "SSR_CURRENT_FRAME_COLOR"))).toBe(true);
      expect(
        fallbackPass4s.some(
          (v) =>
            !v.macros.some((m) => m.n === "SSR_CURRENT_FRAME_COLOR") &&
            v.macros.some((m) => m.n === "SSR_LINEAR_TRACE") &&
            v.macros.some((m) => m.n === "SSR_PACKED_HDR_REINHARD") &&
            v.macros.some((m) => m.n === "SSR_PACKED_NORMAL_OCT8")
        )
      ).toBe(true);

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

  it("requests deferred completion for Effect/ParticleFeedback passes and polls parallel programs via fast timer when cooldownFrames and maxFrameIntervalMs are 0", async () => {
    let polls = 0;
    const getProgramCalls: unknown[][] = [];
    const feedbackProgram = {
      isValid: true,
      _pollReady: () => ++polls >= 2
    };
    const feedbackPass = {
      name: "TransformFeedback",
      _getShaderProgram: (...args: unknown[]) => {
        getProgramCalls.push(args);
        return feedbackProgram;
      }
    };
    const feedbackShader = {
      name: "Effect/ParticleFeedback",
      destroyed: false,
      subShaders: [{ passes: [feedbackPass] }]
    };
    const findSpy = vi
      .spyOn(Shader, "find")
      .mockImplementation((name: string) => (name === "Effect/ParticleFeedback" ? (feedbackShader as any) : null));
    const originalRaf = globalThis.requestAnimationFrame;
    const rafSpy = vi.fn((cb: FrameRequestCallback) => {
      cb(performance.now());
      return 1;
    });
    (globalThis as { requestAnimationFrame?: typeof requestAnimationFrame }).requestAnimationFrame = rafSpy as any;
    try {
      const engine = {
        _hardwareRenderer: {
          gl: { getExtension: (name: string) => (name === "KHR_parallel_shader_compile" ? {} : null) }
        }
      } as any;
      const report = await warmupSeedWorldShaderVariants(
        engine,
        [{ shader: "Effect/ParticleFeedback", si: 0, pi: 0, macros: [] }],
        {
          strict: true,
          maximumPendingPrograms: 28,
          pollIntervalMilliseconds: 4
        }
      );
      expect(report.compiled).toBe(1);
      expect(polls).toBe(2);
      expect(rafSpy).not.toHaveBeenCalled();
      expect(getProgramCalls).toHaveLength(1);
      expect(getProgramCalls[0]?.[2]).toEqual(["v_FeedbackPosition", "v_FeedbackVelocity"]);
      expect(getProgramCalls[0]?.[4]).toBe(true);

      // Background warmup with cooldownFrames > 0 keeps rAF polling so frame pacing works.
      polls = 0;
      const bgReport = await warmupSeedWorldShaderVariants(
        engine,
        [{ shader: "Effect/ParticleFeedback", si: 0, pi: 0, macros: [] }],
        {
          strict: true,
          cooldownFrames: 1,
          pollIntervalMilliseconds: 4
        }
      );
      expect(bgReport.compiled).toBe(1);
      expect(rafSpy).toHaveBeenCalled();
    } finally {
      findSpy.mockRestore();
      if (originalRaf === undefined) {
        delete (globalThis as { requestAnimationFrame?: typeof requestAnimationFrame }).requestAnimationFrame;
      } else {
        globalThis.requestAnimationFrame = originalRaf;
      }
    }
  });

  it("frustum-culls offscreen Water/* and Masonry/SupportSurface, omits redundant non-SSR Forward twins for active SSR receivers, and gates SunLensFlare & Blit in primary while keeping all in secondary", async () => {
    const { BoundingBox, Matrix, Vector3 } = await import("@galacean/engine");
    const proj = new Matrix();
    Matrix.perspective(Math.PI / 3, 1, 0.1, 200, proj);
    const view = new Matrix();
    Matrix.lookAt(new Vector3(0, 5, 0), new Vector3(0, 5, -20), new Vector3(0, 1, 0), view);

    const makeShader = (name: string, stages: readonly string[]) => ({
      name,
      destroyed: false,
      subShaders: [
        {
          passes: stages.map((stage) => ({
            getTagValue: () => stage,
            _renderState: {
              _getRenderQueueByShaderData: () =>
                name.startsWith("Water/") ? RenderQueueType.Transparent : RenderQueueType.Opaque
            },
            _renderStateDataMap: {}
          }))
        }
      ]
    });
    const riverShader = makeShader("Water/River.v1", ["Forward", "SSRReceiver"]);
    const lakeShader = makeShader("Water/Lake.v1", ["Forward", "SSRReceiver"]);
    const oceanShader = makeShader("Water/Ocean.v1", ["Forward"]);
    const supportShader = makeShader("Masonry/SupportSurface", ["Forward"]);
    const blitShader = makeShader("Blit/Blit", ["Forward"]);
    const flareShader = makeShader("PostProcess/SunLensFlare", ["Forward"]);
    const flareVisShader = makeShader("PostProcess/SunLensFlareVisibility", ["TransformFeedback"]);
    const ssrShader = {
      name: "Lighting/ScreenSpaceReflection",
      destroyed: false,
      subShaders: [{ passes: Array.from({ length: 9 }, () => ({ getTagValue: () => "Forward" })) }]
    };

    const makeMat = (shader: any, ssrIntensity = 0) => ({
      destroyed: false,
      shader,
      screenSpaceReflectionIntensity: ssrIntensity,
      screenSpaceReflectionBilateral: false,
      isTransparent: shader.name.startsWith("Water/"),
      shaderData: { _macroCollection: new ShaderMacroCollection() }
    });
    const makeBoundedRenderer = (mat: any, bounds: any, castShadows = false) => {
      const r = Object.create(MeshRenderer.prototype);
      Object.defineProperties(r, {
        entity: { value: { isActiveInHierarchy: true, destroyed: false, layer: 1 } },
        shaderData: { value: { _macroCollection: new ShaderMacroCollection() } },
        mesh: { value: { _primitive: { vertexElements: [{ attribute: "NORMAL" }] } } },
        enabled: { value: true },
        destroyed: { value: false },
        castShadows: { value: castShadows },
        bounds: { value: bounds },
        getMaterials: { value: () => [mat] }
      });
      return r;
    };

    const inFrontBox = new BoundingBox(new Vector3(-5, 0, -40), new Vector3(5, 2, -20));
    const behindBox = new BoundingBox(new Vector3(-5, 0, 30), new Vector3(5, 2, 50));

    const visibleRiver = makeBoundedRenderer(makeMat(riverShader, 1), inFrontBox);
    const offscreenLake = makeBoundedRenderer(makeMat(lakeShader, 1), behindBox);
    const offscreenOcean = makeBoundedRenderer(makeMat(oceanShader, 0), behindBox);
    const offscreenSupport = makeBoundedRenderer(makeMat(supportShader, 0), behindBox);

    const blitMat = makeMat(blitShader);
    const flareMat = makeMat(flareShader);

    // Sun behind camera (+Z reverseDirection while camera looks down -Z).
    const behindSunScene = {
      shaderData: { _macroCollection: new ShaderMacroCollection() },
      background: { mode: 0 },
      castShadows: true,
      shadowDistance: 120,
      sun: { reverseDirection: new Vector3(0, 0.5, 1) },
      screenSpaceReflection: {
        enabled: true,
        quality: ScreenSpaceReflectionQuality.Medium,
        intensity: 1,
        maxRoughness: 0.6
      }
    } as any;
    const camera = {
      _updateShaderData() {},
      _isIndependentCanvasEnabled: () => true,
      depthTextureMode: DepthTextureMode.PrePass,
      _enableForwardDepthResolve: true,
      opaqueTextureEnabled: true,
      enablePostProcess: true,
      enableScreenSpaceReflection: true,
      renderTarget: null,
      entity: { transform: { worldPosition: new Vector3(0, 5, 0) } },
      viewMatrix: view,
      projectionMatrix: proj,
      shaderData: { _macroCollection: new ShaderMacroCollection() }
    } as any;
    const engine = {
      _macroCollection: new ShaderMacroCollection(),
      _hardwareRenderer: { supportsRendering: true, capability: { maxDrawBuffers: 4 } },
      _basicResources: { blitMaterial: blitMat },
      _getActivePostProcessPasses: () => [{ isActive: true, _sunLensFlareMaterial: flareMat }]
    } as any;
    const roots = [
      {
        getComponentsIncludeChildren(_type: unknown, out: unknown[]) {
          out.length = 0;
          out.push(visibleRiver, offscreenLake, offscreenOcean, offscreenSupport);
          return out;
        }
      }
    ] as any;
    const findSpy = vi.spyOn(Shader, "find").mockImplementation((name: string) => {
      if (name === "Lighting/ScreenSpaceReflection") return ssrShader as any;
      if (name === "PostProcess/SunLensFlareVisibility") return flareVisShader as any;
      return null;
    });
    try {
      const postState = {
        enabled: true,
        bloom: false,
        bloomHighQuality: false,
        bloomDirt: false,
        colorAdjustments: false,
        sunLensFlare: true
      };
      const primary = collectSeedWorldRendererVariants(engine, behindSunScene, camera, roots, {
        onlyEnabledRenderers: true,
        onlyFrustumVisible: true,
        includeGpuInstancing: false,
        postProcessState: postState
      });

      // Offscreen Lake, Ocean, SupportSurface, and behind-camera SunLensFlare are deferred out of primary.
      expect(primary.some((v) => v.shader === "Water/Lake.v1")).toBe(false);
      expect(primary.some((v) => v.shader === "Water/Ocean.v1")).toBe(false);
      expect(primary.some((v) => v.shader === "Masonry/SupportSurface")).toBe(false);
      expect(primary.some((v) => v.shader === "PostProcess/SunLensFlare")).toBe(false);
      expect(primary.some((v) => v.shader === "PostProcess/SunLensFlareVisibility")).toBe(false);
      // Visible River warms SSR Forward + SSRReceiver ONLY when current-frame color reuse avoids WarmupColor Frame 0.
      const riverForward = primary.filter((v) => v.shader === "Water/River.v1" && v.pi === 0);
      expect(riverForward).toHaveLength(1);
      expect(riverForward[0]!.macros.some((m) => m.n === "CAMERA_ENABLE_SSR")).toBe(true);
      expect(primary.some((v) => v.shader === "Water/River.v1" && v.pi === 1)).toBe(true);
      expect(primary.some((v) => v.shader === "Lighting/ScreenSpaceReflection")).toBe(true);
      // Primary Blit/Blit warms only the camera's active renderToTexture sRGB state (1 variant).
      expect(primary.filter((v) => v.shader === "Blit/Blit")).toHaveLength(1);

      // When Frame 0 enters WarmupColor (`!canReuseCurrentFrameColor`, e.g. `!opaqueTextureEnabled` or rainy opaque SSR),
      // primary warmup MUST retain the non-SSR Forward variant so Frame 0 does not suffer revealCompileMisses.
      const warmupColorCamera = { ...camera, opaqueTextureEnabled: false };
      const primaryWarmupColor = collectSeedWorldRendererVariants(engine, behindSunScene, warmupColorCamera, roots, {
        onlyEnabledRenderers: true,
        onlyFrustumVisible: true,
        includeGpuInstancing: false,
        postProcessState: postState
      });
      const riverWarmupForward = primaryWarmupColor.filter((v) => v.shader === "Water/River.v1" && v.pi === 0);
      expect(riverWarmupForward.some((v) => v.macros.some((m) => m.n === "CAMERA_ENABLE_SSR"))).toBe(true);
      expect(riverWarmupForward.some((v) => !v.macros.some((m) => m.n === "CAMERA_ENABLE_SSR"))).toBe(true);

      // When NO SSR-receiving water is in frustum, Lighting/ScreenSpaceReflection is also deferred out of primary.
      const noVisibleWaterRoots = [
        {
          getComponentsIncludeChildren(_type: unknown, out: unknown[]) {
            out.length = 0;
            out.push(offscreenLake, offscreenOcean, offscreenSupport);
            return out;
          }
        }
      ] as any;
      const primaryNoSsr = collectSeedWorldRendererVariants(engine, behindSunScene, camera, noVisibleWaterRoots, {
        onlyEnabledRenderers: true,
        onlyFrustumVisible: true,
        includeGpuInstancing: false,
        postProcessState: postState
      });
      expect(primaryNoSsr.some((v) => v.shader === "Lighting/ScreenSpaceReflection")).toBe(false);

      // When sun IS in front of camera (-Z), primary warms both SunLensFlare shaders.
      const frontSunScene = { ...behindSunScene, sun: { reverseDirection: new Vector3(0, 0.2, -1) } };
      const primarySunInFront = collectSeedWorldRendererVariants(engine, frontSunScene, camera, roots, {
        onlyEnabledRenderers: true,
        onlyFrustumVisible: true,
        includeGpuInstancing: false,
        postProcessState: postState
      });
      expect(primarySunInFront.some((v) => v.shader === "PostProcess/SunLensFlare")).toBe(true);
      expect(primarySunInFront.some((v) => v.shader === "PostProcess/SunLensFlareVisibility")).toBe(true);

      // Secondary collection (onlyFrustumVisible: false) retains ALL deferred variants (offscreen water,
      // non-SSR water fallback, SupportSurface, SunLensFlare, and both Blit/Blit sRGB variants).
      const secondary = collectSeedWorldRendererVariants(engine, behindSunScene, camera, roots, {
        onlyEnabledRenderers: false,
        onlyFrustumVisible: false,
        includeGpuInstancing: false,
        postProcessState: postState
      });
      expect(secondary.some((v) => v.shader === "Water/Lake.v1")).toBe(true);
      expect(secondary.some((v) => v.shader === "Water/Ocean.v1")).toBe(true);
      expect(secondary.some((v) => v.shader === "Masonry/SupportSurface")).toBe(true);
      expect(secondary.some((v) => v.shader === "PostProcess/SunLensFlare")).toBe(true);
      expect(secondary.some((v) => v.shader === "PostProcess/SunLensFlareVisibility")).toBe(true);
      expect(secondary.filter((v) => v.shader === "Water/River.v1" && v.pi === 0)).toHaveLength(2);
      expect(secondary.filter((v) => v.shader === "Blit/Blit")).toHaveLength(2);
    } finally {
      findSpy.mockRestore();
    }
  });

  it("uses frustum-visible batch counts for GPU instancing in primary warmup while retaining both variants in secondary", async () => {
    const { BoundingBox, Matrix, Vector3 } = await import("@galacean/engine");
    const proj = new Matrix();
    Matrix.perspective(Math.PI / 3, 1, 0.1, 200, proj);
    const view = new Matrix();
    Matrix.lookAt(new Vector3(0, 5, 0), new Vector3(0, 5, -20), new Vector3(0, 1, 0), view);

    const makeShader = (name: string) => ({
      name,
      destroyed: false,
      subShaders: [{ passes: [{ getTagValue: () => "Forward" }] }]
    });
    const farTerrainMat = {
      destroyed: false,
      shader: makeShader("Terrain/Terrain"),
      isTransparent: false,
      shaderData: { _macroCollection: new ShaderMacroCollection() }
    };
    farTerrainMat.shaderData._macroCollection.enable(ShaderMacro.getByName("MATERIAL_TERRAIN_FAR"));
    const propMat = {
      destroyed: false,
      shader: makeShader("PBR"),
      isTransparent: false,
      shaderData: { _macroCollection: new ShaderMacroCollection() }
    };
    const sharedFarMesh = { _primitive: { vertexElements: [{ attribute: "NORMAL" }] } };
    const sharedPropMesh = { _primitive: { vertexElements: [{ attribute: "NORMAL" }] } };
    const inFront = new BoundingBox(new Vector3(-5, 0, -40), new Vector3(5, 2, -20));
    const behind = new BoundingBox(new Vector3(-5, 0, 30), new Vector3(5, 2, 50));
    const makeTile = (mesh: any, mat: any, bounds: any) => {
      const r = Object.create(MeshRenderer.prototype);
      Object.defineProperties(r, {
        entity: { value: { isActiveInHierarchy: true, destroyed: false, layer: 1 } },
        shaderData: {
          value: { _macroCollection: new ShaderMacroCollection(), _matchesRendererBatchShared: () => true }
        },
        mesh: { value: mesh },
        enabled: { value: true },
        destroyed: { value: false },
        castShadows: { value: false },
        receiveShadows: { value: true },
        priority: { value: 50 },
        bounds: { value: bounds },
        getMaterials: { value: () => [mat] }
      });
      return r;
    };
    const allRenderers = [
      // 4 frustum-visible far terrain tiles sharing (sharedFarMesh, farTerrainMat) -> instanced-only in primary.
      makeTile(sharedFarMesh, farTerrainMat, inFront),
      makeTile(sharedFarMesh, farTerrainMat, inFront),
      makeTile(sharedFarMesh, farTerrainMat, inFront),
      makeTile(sharedFarMesh, farTerrainMat, inFront),
      // 1 frustum-visible PBR prop + 2 behind camera -> only 1 visible copy -> non-instanced-only in primary.
      makeTile(sharedPropMesh, propMat, inFront),
      makeTile(sharedPropMesh, propMat, behind),
      makeTile(sharedPropMesh, propMat, behind)
    ];
    const engine = { _macroCollection: new ShaderMacroCollection() } as any;
    const scene = {
      shaderData: { _macroCollection: new ShaderMacroCollection() },
      background: { mode: 0 },
      castShadows: false
    } as any;
    const camera = {
      _updateShaderData() {},
      entity: { transform: { worldPosition: new Vector3(0, 5, 0) } },
      viewMatrix: view,
      projectionMatrix: proj,
      shaderData: { _macroCollection: new ShaderMacroCollection() }
    } as any;
    const roots = [
      {
        getComponentsIncludeChildren(_type: unknown, out: unknown[]) {
          out.length = 0;
          out.push(...allRenderers);
          return out;
        }
      }
    ] as any;

    const primary = collectSeedWorldRendererVariants(engine, scene, camera, roots, {
      onlyEnabledRenderers: true,
      onlyFrustumVisible: true,
      includeGpuInstancing: true,
      onlySharedMeshGpuInstancing: true
    });
    const primaryFar = primary.filter((v) => v.shader === "Terrain/Terrain");
    expect(primaryFar).toHaveLength(1);
    expect(primaryFar[0]!.macros.some((m) => m.n === "RENDERER_GPU_INSTANCE")).toBe(true);
    const primaryProp = primary.filter((v) => v.shader === "PBR");
    expect(primaryProp).toHaveLength(1);
    expect(primaryProp[0]!.macros.some((m) => m.n === "RENDERER_GPU_INSTANCE")).toBe(false);

    // Secondary keeps both non-instanced and instanced variants for exploration.
    const secondary = collectSeedWorldRendererVariants(engine, scene, camera, roots, {
      onlyEnabledRenderers: false,
      onlyFrustumVisible: false,
      includeGpuInstancing: true,
      onlySharedMeshGpuInstancing: true
    });
    expect(secondary.filter((v) => v.shader === "Terrain/Terrain")).toHaveLength(2);
    expect(secondary.filter((v) => v.shader === "PBR")).toHaveLength(2);
  });

  it("retains disabled resident Masonry/<sha256> unitLod renderers on active building roots under onlyEnabledRenderers while still skipping disabled SupportSurface and inactive buildings", () => {
    const residentShaderName = `Masonry/${"c".repeat(64)}`;
    const makeShader = (name: string) => ({
      name,
      destroyed: false,
      subShaders: [{ passes: [{ getTagValue: () => "Forward" }] }]
    });
    const makeMat = (name: string) => ({
      destroyed: false,
      shader: makeShader(name),
      shaderData: { _macroCollection: new ShaderMacroCollection() }
    });
    const activeDisabledResident = renderer(true, false, [makeMat(residentShaderName)], false);
    const inactiveDisabledResident = renderer(false, false, [makeMat(`Masonry/${"d".repeat(64)}`)], false);
    const activeDisabledSupport = renderer(true, false, [makeMat("Masonry/SupportSurface")], false);

    const variants = collectSeedWorldRendererVariants(
      { _macroCollection: new ShaderMacroCollection() } as any,
      { shaderData: { _macroCollection: new ShaderMacroCollection() }, background: { mode: 0 } } as any,
      { _updateShaderData() {}, shaderData: { _macroCollection: new ShaderMacroCollection() } } as any,
      [
        {
          getComponentsIncludeChildren(_type: unknown, out: unknown[]) {
            out.length = 0;
            out.push(activeDisabledResident, inactiveDisabledResident, activeDisabledSupport);
            return out;
          }
        }
      ] as any,
      {
        includeInactiveEntities: false,
        onlyEnabledRenderers: true,
        includeGpuInstancing: false,
        includeMasonryDither: false,
        includeMasonryEntrance: false
      }
    );

    expect(variants.map((v) => v.shader)).toEqual([residentShaderName]);
  });

  it("P1-9: suppresses non-instanced primary variant only for >=3 homogeneous real visible single-subMesh renderers under a single opaque sort-key bucket (H1/H2/H3 + Control)", async () => {
    const { BoundingBox, Matrix, Vector3 } = await import("@galacean/engine");
    const proj = new Matrix();
    Matrix.perspective(Math.PI / 3, 1, 0.1, 200, proj);
    const view = new Matrix();
    Matrix.lookAt(new Vector3(0, 5, 0), new Vector3(0, 5, -20), new Vector3(0, 1, 0), view);

    const makeMat = (shaderName: string) => ({
      destroyed: false,
      shader: {
        name: shaderName,
        destroyed: false,
        subShaders: [{ passes: [{ getTagValue: () => "Forward" }] }]
      },
      isTransparent: false,
      shaderData: { _macroCollection: new ShaderMacroCollection() }
    });
    const inFront = new BoundingBox(new Vector3(-5, 0, -40), new Vector3(5, 2, -20));
    const makeRenderer = (opts: {
      mesh: any;
      materials: any[];
      active?: boolean;
      enabled?: boolean;
      priority?: number;
      frontFaceInvert?: boolean;
      extraMacro?: string;
    }) => {
      const macros = new ShaderMacroCollection();
      if (opts.extraMacro) macros.enable(ShaderMacro.getByName(opts.extraMacro));
      const r = Object.create(MeshRenderer.prototype);
      Object.defineProperties(r, {
        entity: {
          value: {
            isActiveInHierarchy: opts.active ?? true,
            destroyed: false,
            layer: 1,
            transform: { _isFrontFaceInvert: () => Boolean(opts.frontFaceInvert) }
          }
        },
        shaderData: { value: { _macroCollection: macros, _matchesRendererBatchShared: () => true } },
        mesh: { value: opts.mesh },
        enabled: { value: opts.enabled ?? true },
        destroyed: { value: false },
        castShadows: { value: false },
        receiveShadows: { value: true },
        priority: { value: opts.priority ?? 0 },
        bounds: { value: inFront },
        getMaterials: { value: () => opts.materials }
      });
      return r;
    };
    const engine = { _macroCollection: new ShaderMacroCollection() } as any;
    const scene = {
      shaderData: { _macroCollection: new ShaderMacroCollection() },
      background: { mode: 0 },
      castShadows: false
    } as any;
    const camera = {
      _updateShaderData() {},
      entity: { transform: { worldPosition: new Vector3(0, 5, 0) } },
      viewMatrix: view,
      projectionMatrix: proj,
      shaderData: { _macroCollection: new ShaderMacroCollection() }
    } as any;
    const runPrimary = (rootRenderers: any[], additionalRenderers?: any[]) =>
      collectSeedWorldRendererVariants(
        engine,
        scene,
        camera,
        [
          {
            getComponentsIncludeChildren(_type: unknown, out: unknown[]) {
              out.length = 0;
              out.push(...rootRenderers);
              return out;
            }
          }
        ] as any,
        {
          includeInactiveEntities: false,
          onlyEnabledRenderers: true,
          onlyFrustumVisible: true,
          includeGpuInstancing: true,
          onlySharedMeshGpuInstancing: true,
          additionalRenderers
        }
      );

    // H1: Single renderer with 3 same-material subMeshes must NEVER self-count to 3 or drop non-instanced.
    const multiSubMesh = { _primitive: { vertexElements: [{ attribute: "NORMAL" }] }, subMeshes: [{}, {}, {}] };
    const h1Mat = makeMat("PBR");
    const h1Variants = runPrimary([makeRenderer({ mesh: multiSubMesh, materials: [h1Mat, h1Mat, h1Mat] })]);
    expect(h1Variants.some((v) => v.macros.every((m) => m.n !== "RENDERER_GPU_INSTANCE"))).toBe(true);

    // H2: 2 real renderers + 2 forced additionalRenderers (inactive) must NOT drop non-instanced.
    const h2Mesh = { _primitive: { vertexElements: [{ attribute: "NORMAL" }] }, subMeshes: [{}] };
    const h2Mat = makeMat("PBR");
    const h2Real = [
      makeRenderer({ mesh: h2Mesh, materials: [h2Mat] }),
      makeRenderer({ mesh: h2Mesh, materials: [h2Mat] })
    ];
    const h2Forced = [
      makeRenderer({ mesh: h2Mesh, materials: [h2Mat], active: false }),
      makeRenderer({ mesh: h2Mesh, materials: [h2Mat], active: false })
    ];
    const h2Variants = runPrimary(h2Real, h2Forced);
    expect(h2Variants.some((v) => v.macros.every((m) => m.n !== "RENDERER_GPU_INSTANCE"))).toBe(true);
    expect(h2Variants.some((v) => v.macros.some((m) => m.n === "RENDERER_GPU_INSTANCE"))).toBe(true);

    // H3: 3 normal + 1 mirrored (frontFaceInvert=true) sharing (priority, material, mesh) sort key
    // has 2 distinct batch buckets under the same sort key -> must keep non-instanced!
    const h3Mesh = { _primitive: { vertexElements: [{ attribute: "NORMAL" }] }, subMeshes: [{}] };
    const h3Mat = makeMat("PBR");
    const h3Variants = runPrimary([
      makeRenderer({ mesh: h3Mesh, materials: [h3Mat], priority: 50 }),
      makeRenderer({ mesh: h3Mesh, materials: [h3Mat], priority: 50 }),
      makeRenderer({ mesh: h3Mesh, materials: [h3Mat], priority: 50 }),
      makeRenderer({ mesh: h3Mesh, materials: [h3Mat], priority: 50, frontFaceInvert: true })
    ]);
    expect(h3Variants.some((v) => v.macros.every((m) => m.n !== "RENDERER_GPU_INSTANCE"))).toBe(true);
    expect(h3Variants.some((v) => v.macros.some((m) => m.n === "RENDERER_GPU_INSTANCE"))).toBe(true);

    // Control: 3 homogeneous real visible single-subMesh renderers under 1 sort-key bucket -> instanced-only in primary!
    const ctrlMesh = { _primitive: { vertexElements: [{ attribute: "NORMAL" }] }, subMeshes: [{}] };
    const ctrlMat = makeMat("Terrain/Terrain");
    const ctrlVariants = runPrimary([
      makeRenderer({ mesh: ctrlMesh, materials: [ctrlMat], priority: 50 }),
      makeRenderer({ mesh: ctrlMesh, materials: [ctrlMat], priority: 50 }),
      makeRenderer({ mesh: ctrlMesh, materials: [ctrlMat], priority: 50 })
    ]);
    expect(ctrlVariants).toHaveLength(1);
    expect(ctrlVariants[0]!.macros.some((m) => m.n === "RENDERER_GPU_INSTANCE")).toBe(true);
  });

  it("P2-5: honors SunLensFlareEffect.sunDirectionOverride ahead of scene.sun when gating SunLensFlare primary warmup", async () => {
    const { Matrix, SunLensFlareEffect, Vector3 } = await import("@galacean/engine");
    const proj = new Matrix();
    Matrix.perspective(Math.PI / 3, 1, 0.1, 200, proj);
    const view = new Matrix();
    // Camera looks down -Z.
    Matrix.lookAt(new Vector3(0, 5, 0), new Vector3(0, 5, -20), new Vector3(0, 1, 0), view);

    const makeShader = (name: string, stage: string) => ({
      name,
      destroyed: false,
      subShaders: [{ passes: [{ getTagValue: () => stage }] }]
    });
    const flareMat = {
      destroyed: false,
      shader: makeShader("PostProcess/SunLensFlare", "Forward"),
      shaderData: { _macroCollection: new ShaderMacroCollection() }
    };
    const flareVisShader = makeShader("PostProcess/SunLensFlareVisibility", "TransformFeedback");
    const engine = {
      _macroCollection: new ShaderMacroCollection(),
      _hardwareRenderer: { supportsRendering: true },
      _basicResources: {},
      _getActivePostProcessPasses: () => [{ isActive: true, _sunLensFlareMaterial: flareMat }]
    } as any;
    const camera = {
      _updateShaderData() {},
      enablePostProcess: true,
      renderTarget: null,
      entity: { transform: { worldPosition: new Vector3(0, 5, 0) } },
      viewMatrix: view,
      projectionMatrix: proj,
      shaderData: { _macroCollection: new ShaderMacroCollection() }
    } as any;
    const basePostState = {
      enabled: true,
      bloom: false,
      bloomHighQuality: false,
      bloomDirt: false,
      colorAdjustments: false,
      sunLensFlare: true
    };
    const findSpy = vi
      .spyOn(Shader, "find")
      .mockImplementation((name: string) =>
        name === "PostProcess/SunLensFlareVisibility" ? (flareVisShader as any) : null
      );
    try {
      // Trigger A: scene.sun is behind camera (+Z reverseDirection), but postProcessState.sunDirectionOverride
      // travels along +Z (so -override points down -Z, directly in front of camera!) -> MUST warm both flare shaders.
      const behindSunScene = {
        shaderData: { _macroCollection: new ShaderMacroCollection() },
        background: { mode: 0 },
        sun: { reverseDirection: new Vector3(0, 0.4, 1) }
      } as any;
      const viaState = collectSeedWorldRendererVariants(engine, behindSunScene, camera, [], {
        onlyFrustumVisible: true,
        postProcessState: { ...basePostState, sunDirectionOverride: [0, -0.2, 1] }
      });
      expect(viaState.some((v) => v.shader === "PostProcess/SunLensFlare")).toBe(true);
      expect(viaState.some((v) => v.shader === "PostProcess/SunLensFlareVisibility")).toBe(true);

      // Trigger B: same via scene.postProcessManager.getBlendEffect(SunLensFlareEffect).
      const viaBlendScene = {
        ...behindSunScene,
        postProcessManager: {
          getBlendEffect: (type: unknown) =>
            type === SunLensFlareEffect ? { sunDirectionOverride: { value: new Vector3(0, -0.2, 1) } } : undefined
        }
      } as any;
      const viaBlend = collectSeedWorldRendererVariants(engine, viaBlendScene, camera, [], {
        onlyFrustumVisible: true,
        postProcessState: basePostState
      });
      expect(viaBlend.some((v) => v.shader === "PostProcess/SunLensFlare")).toBe(true);
      expect(viaBlend.some((v) => v.shader === "PostProcess/SunLensFlareVisibility")).toBe(true);

      // Control: scene.sun is in front (-Z reverseDirection), but sunDirectionOverride points down -Z
      // (so -override is +Z, behind camera!) -> skips flare shaders in primary, retains in secondary.
      const frontSunWithBehindOverride = {
        shaderData: { _macroCollection: new ShaderMacroCollection() },
        background: { mode: 0 },
        sun: { reverseDirection: new Vector3(0, 0.2, -1) }
      } as any;
      const primarySkipped = collectSeedWorldRendererVariants(engine, frontSunWithBehindOverride, camera, [], {
        onlyFrustumVisible: true,
        postProcessState: { ...basePostState, sunDirectionOverride: [0, -0.2, -1] }
      });
      expect(primarySkipped.some((v) => v.shader === "PostProcess/SunLensFlare")).toBe(false);
      expect(primarySkipped.some((v) => v.shader === "PostProcess/SunLensFlareVisibility")).toBe(false);

      const secondaryKept = collectSeedWorldRendererVariants(engine, frontSunWithBehindOverride, camera, [], {
        onlyFrustumVisible: false,
        postProcessState: { ...basePostState, sunDirectionOverride: [0, -0.2, -1] }
      });
      expect(secondaryKept.some((v) => v.shader === "PostProcess/SunLensFlare")).toBe(true);
      expect(secondaryKept.some((v) => v.shader === "PostProcess/SunLensFlareVisibility")).toBe(true);
    } finally {
      findSpy.mockRestore();
    }
  });

  it("warms active VolumetricLight passes, Uber ENABLE_EFFECT_VOLUMETRIC_LIGHT, and custom PostProcessPass materials", () => {
    const vlShader = {
      name: "PostProcess/VolumetricLight",
      destroyed: false,
      subShaders: [
        {
          passes: [
            { getTagValue: () => "Forward" },
            { getTagValue: () => "Forward" },
            { getTagValue: () => "Forward" },
            { getTagValue: () => "Forward" },
            { getTagValue: () => "Forward" }
          ]
        }
      ]
    };
    const uberShader = {
      name: "PostProcess/Uber",
      destroyed: false,
      subShaders: [{ passes: [{ getTagValue: () => "Forward" }] }]
    };
    const oilPaintShader = {
      name: "PostProcess/OilPaint",
      destroyed: false,
      subShaders: [{ passes: [{ getTagValue: () => "Forward" }] }]
    };
    const vlMat = {
      destroyed: false,
      shader: vlShader,
      shaderData: { _macroCollection: new ShaderMacroCollection() }
    };
    const uberMat = {
      destroyed: false,
      shader: uberShader,
      shaderData: { _macroCollection: new ShaderMacroCollection() }
    };
    const oilPaintMat = {
      destroyed: false,
      shader: oilPaintShader,
      shaderData: { _macroCollection: new ShaderMacroCollection() }
    };
    const oilPaintPass = { isActive: true, _material: oilPaintMat };
    const engine = {
      _macroCollection: new ShaderMacroCollection(),
      _hardwareRenderer: { supportsRendering: true },
      _getActivePostProcessPasses: () => [
        { isActive: true, _uberMaterial: uberMat, _volumetricLightMaterial: vlMat },
        oilPaintPass
      ]
    } as any;
    const view = new Matrix();
    const proj = new Matrix();
    Matrix.lookAt(new Vector3(0, 5, 0), new Vector3(0, 5, -10), new Vector3(0, 1, 0), view);
    Matrix.perspective((60 * Math.PI) / 180, 1.5, 0.1, 200, proj);
    const camera = {
      _updateShaderData() {},
      _needFinalPass: () => true,
      depthTextureMode: DepthTextureMode.PrePass,
      enablePostProcess: true,
      renderTarget: null,
      viewMatrix: view,
      projectionMatrix: proj,
      shaderData: { _macroCollection: new ShaderMacroCollection() }
    } as any;
    const frontSunScene = {
      shaderData: { _macroCollection: new ShaderMacroCollection() },
      background: { mode: 0 },
      castShadows: true,
      shadowDistance: 80,
      sun: { reverseDirection: new Vector3(0, 0.5, -0.866), shadowType: ShadowType.Hard, shadowStrength: 1 }
    } as any;
    const behindSunScene = {
      ...frontSunScene,
      sun: { reverseDirection: new Vector3(0, 0.4, 0.916), shadowType: ShadowType.Hard, shadowStrength: 1 }
    } as any;

    const lowState = {
      enabled: true,
      bloom: false,
      bloomHighQuality: false,
      bloomDirt: false,
      colorAdjustments: false,
      volumetricLight: true,
      volumetricLightQuality: VolumetricLightQuality.Low
    };

    // Primary warmup facing sun (Low): warms VolumetricLight passes 0/1/2, Uber WITH ENABLE_EFFECT_VOLUMETRIC_LIGHT,
    // and active custom OilPaintPostPass (PostProcess/OilPaint pass 0).
    const primaryFront = collectSeedWorldRendererVariants(engine, frontSunScene, camera, [], {
      onlyFrustumVisible: true,
      postProcessState: lowState
    });
    expect(new Set(primaryFront.filter((v) => v.shader === "PostProcess/VolumetricLight").map((v) => v.pi))).toEqual(
      new Set([0, 1, 2])
    );
    const primaryFrontUber = primaryFront.filter((v) => v.shader === "PostProcess/Uber");
    expect(primaryFrontUber).toHaveLength(1);
    expect(primaryFrontUber[0]!.macros.some((m) => m.n === "ENABLE_EFFECT_VOLUMETRIC_LIGHT")).toBe(true);
    expect(primaryFrontUber[0]!.macros.some((m) => m.n === "VOLUMETRIC_LIGHT_RAYMARCH")).toBe(false);
    expect(primaryFront.some((v) => v.shader === "PostProcess/OilPaint" && v.pi === 0)).toBe(true);

    // Primary warmup with sun behind camera (Low): defers VolumetricLight passes and keeps Uber WITHOUT macro.
    const primaryBehind = collectSeedWorldRendererVariants(engine, behindSunScene, camera, [], {
      onlyFrustumVisible: true,
      postProcessState: lowState
    });
    expect(primaryBehind.some((v) => v.shader === "PostProcess/VolumetricLight")).toBe(false);
    const primaryBehindUber = primaryBehind.filter((v) => v.shader === "PostProcess/Uber");
    expect(primaryBehindUber).toHaveLength(1);
    expect(primaryBehindUber[0]!.macros.some((m) => m.n === "ENABLE_EFFECT_VOLUMETRIC_LIGHT")).toBe(false);

    // Full/background warmup (Low): warms passes 0/1/2 AND both Uber WITH/WITHOUT ENABLE_EFFECT_VOLUMETRIC_LIGHT.
    const fullBehind = collectSeedWorldRendererVariants(engine, behindSunScene, camera, [], {
      onlyFrustumVisible: false,
      postProcessState: lowState
    });
    expect(new Set(fullBehind.filter((v) => v.shader === "PostProcess/VolumetricLight").map((v) => v.pi))).toEqual(
      new Set([0, 1, 2])
    );
    const fullUber = fullBehind.filter((v) => v.shader === "PostProcess/Uber");
    expect(fullUber.some((v) => v.macros.some((m) => m.n === "ENABLE_EFFECT_VOLUMETRIC_LIGHT"))).toBe(true);
    expect(fullUber.some((v) => !v.macros.some((m) => m.n === "ENABLE_EFFECT_VOLUMETRIC_LIGHT"))).toBe(true);

    // Medium/High raymarch mode: warms passes 3/4 with VOLUMETRIC_LIGHT_QUALITY & VOLUMETRIC_LIGHT_HEIGHT_FOG,
    // plus Uber WITH VOLUMETRIC_LIGHT_RAYMARCH even when sun is behind camera (360-degree 3D raymarching).
    oilPaintPass.isActive = false;
    const raymarchPrimary = collectSeedWorldRendererVariants(engine, behindSunScene, camera, [], {
      onlyFrustumVisible: true,
      postProcessState: {
        ...lowState,
        volumetricLightQuality: VolumetricLightQuality.High,
        volumetricLightHeightFog: true
      }
    });
    const raymarchVl = raymarchPrimary.filter((v) => v.shader === "PostProcess/VolumetricLight");
    expect(new Set(raymarchVl.map((v) => v.pi))).toEqual(new Set([3, 4]));
    expect(raymarchVl[0]!.macros.some((m) => m.n === "VOLUMETRIC_LIGHT_QUALITY" && m.v === "2")).toBe(true);
    expect(raymarchVl[0]!.macros.some((m) => m.n === "VOLUMETRIC_LIGHT_HEIGHT_FOG")).toBe(true);
    const raymarchUber = raymarchPrimary.filter((v) => v.shader === "PostProcess/Uber");
    expect(raymarchUber).toHaveLength(1);
    expect(raymarchUber[0]!.macros.some((m) => m.n === "ENABLE_EFFECT_VOLUMETRIC_LIGHT")).toBe(true);
    expect(raymarchUber[0]!.macros.some((m) => m.n === "VOLUMETRIC_LIGHT_RAYMARCH")).toBe(true);
    expect(raymarchPrimary.some((v) => v.shader === "PostProcess/OilPaint")).toBe(false);
  });

  it("selects WebGPU parallel PSO prewarm, skips WebGL2-only TF variants, and passes primitive/shaderData specialization", async () => {
    const webgpuEngine = {
      _macroCollection: new ShaderMacroCollection(),
      _hardwareRenderer: {
        backend: RHIBackend.WebGPU,
        supportsRendering: true,
        supportsCompute: true,
        supportsTransformFeedback: false,
        capability: { maxAntiAliasing: 4 }
      }
    } as any;
    const webglNoExtEngine = {
      _hardwareRenderer: {
        backend: RHIBackend.WebGL2,
        gl: { getExtension: () => null }
      }
    } as any;

    expect(hasParallelShaderCompile(webgpuEngine)).toBe(true);
    expect(hasParallelShaderCompile(webglNoExtEngine)).toBe(false);

    const prewarmSpy = vi.fn(async () => {});
    const getProgramSpy = vi.fn(() => ({
      isValid: true,
      _platformProgram: { prewarm: prewarmSpy }
    }));
    const resolvedState = { tag: "resolved-render-state" };
    const forwardPass = {
      getTagValue: () => "Forward",
      _getShaderProgram: getProgramSpy,
      _renderState: { _resolve: () => resolvedState },
      _renderStateDataMap: {}
    };
    const tfPass = {
      getTagValue: () => "TransformFeedback",
      _getShaderProgram: vi.fn()
    };
    const mockShader = {
      name: "Test/WebGPURhiWarmup",
      destroyed: false,
      subShaders: [{ passes: [forwardPass, tfPass] }]
    };

    const findSpy = vi.spyOn(Shader, "find").mockImplementation((name: string) => {
      if (name === "Test/WebGPURhiWarmup") return mockShader as any;
      return null as any;
    });

    try {
      const fakePrimitive = {
        vertexElements: [{ attribute: "NORMAL" }],
        _getShaderInputs: () => ({ key: "6:NORMAL:float", types: { NORMAL: "float" } })
      };
      const fakeSubMesh = { topology: 4 };
      const materialShaderData = { _macroCollection: new ShaderMacroCollection() };
      const material = {
        instanceId: 42,
        destroyed: false,
        shader: mockShader,
        shaderData: materialShaderData
      };
      const meshRenderer = Object.create(MeshRenderer.prototype);
      Object.defineProperties(meshRenderer, {
        entity: { value: { isActiveInHierarchy: true } },
        shaderData: { value: { _macroCollection: new ShaderMacroCollection() } },
        mesh: { value: { _primitive: fakePrimitive, subMeshes: [fakeSubMesh] } },
        enabled: { value: true },
        castShadows: { value: false },
        _update: { value: () => {} },
        getMaterials: { value: () => [material] }
      });

      const scene = { shaderData: { _macroCollection: new ShaderMacroCollection() }, background: { mode: 0 } } as any;
      const camera = {
        _updateShaderData() {},
        shaderData: { _macroCollection: new ShaderMacroCollection() },
        _isIndependentCanvasEnabled: () => false
      } as any;
      const root = {
        getComponentsIncludeChildren(_type: unknown, output: unknown[]) {
          output.length = 0;
          output.push(meshRenderer);
        }
      } as any;

      const variants = collectSeedWorldRendererVariants(webgpuEngine, scene, camera, [root], {
        includeGpuInstancing: false
      });
      // WebGPU skips TransformFeedback pass (pi=1) and only keeps Forward pass (pi=0)
      expect(variants).toHaveLength(1);
      expect(variants[0]!.pi).toBe(0);

      const report = await warmupSeedWorldShaderVariants(webgpuEngine, variants, { strict: true });
      expect(report.compiled).toBe(1);
      expect(report.parallelCompileSupported).toBe(true);
      expect(report.issues).toEqual([]);
      // Passed real primitive and material/renderer shaderData so WebGPU cache specialization matches draw time
      expect(getProgramSpy).toHaveBeenCalledTimes(1);
      expect(getProgramSpy.mock.calls[0]![3]).toBe(fakePrimitive);
      expect(getProgramSpy.mock.calls[0]![5]).toBe(materialShaderData);
      // Invoked async PSO prewarm with primitive, subMesh, target, resolved renderState, frontFaceInvert
      expect(prewarmSpy).toHaveBeenCalledTimes(1);
      expect(prewarmSpy).toHaveBeenCalledWith(fakePrimitive, fakeSubMesh, null, resolvedState, false);
    } finally {
      findSpy.mockRestore();
    }
  });
});
