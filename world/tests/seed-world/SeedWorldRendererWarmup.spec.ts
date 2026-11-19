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
});
