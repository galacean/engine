import { describe, expect, it } from "vitest";
import { ShaderFactory, ShaderLanguage } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { ShaderMacroProcessor } from "../../core/src/shader/ShaderMacroProcessor";
import { registerConstructionSceneLighting } from "../src/building/runtime/ConstructionSceneLighting";
import { constructionPlasterGLSL } from "../src/building/runtime/ConstructionPlasterShader";
import farProxyShaderSource from "../src/building/runtime/MasonryFarProxy.shader?raw";
import globalProxyShaderSource from "../src/building/runtime/MasonryGlobalProxy.shader?raw";
import lodDither from "../src/building/runtime/MasonryLodDither.glsl?raw";
import { DecorationMaterial } from "../src/building/runtime/ConstructionDecorationMaterial";
import {
  PLASTER_NORMAL_BIAS_METRES,
  ROOF_NORMAL_BIAS_METRES,
  collapseDecorationToBoxes,
  proxyDecorationNormalBias,
  proxyPartNormalBias
} from "../src/building/runtime/BuildingFarProxy";
import type { ConstructionDecorationPart } from "../src/building/runtime/ConstructionDecorations";

describe("Masonry/FarProxy shader packing contract", () => {
  it("compiles DepthOnly and Forward passes and unpacks compact vertex attributes", () => {
    registerConstructionSceneLighting();
    if (!ShaderFactory.includeMap["Masonry/LodDither.glsl"]) {
      ShaderFactory.registerInclude("Masonry/LodDither.glsl", lodDither);
    }
    if (!ShaderFactory.includeMap["Masonry/Plaster.glsl"]) {
      ShaderFactory.registerInclude("Masonry/Plaster.glsl", constructionPlasterGLSL);
    }
    const compiler = new ShaderCompiler();
    compiler._setIncludeMap(ShaderFactory.includeMap);
    const parsed = compiler._parseShaderSource(farProxyShaderSource);
    const macros = new Map<string, string>([
      ["GRAPHICS_API_WEBGL2", ""],
      ["RENDERER_HAS_NORMAL", ""],
      ["RENDERER_ENABLE_VERTEXCOLOR", ""],
      ["RENDERER_HAS_UV", ""],
      ["RENDERER_HAS_TANGENT", ""],
      ["SCENE_DIRECT_LIGHT_COUNT", "1"],
      ["SCENE_USE_SH", ""]
    ]);

    const passes = parsed.subShaders[0].passes;
    expect(passes).toHaveLength(2);
    for (const pass of passes) {
      const compiled = compiler._parseShaderPass(
        pass.contents,
        pass.vertexEntry,
        pass.fragmentEntry,
        ShaderLanguage.GLSLES300,
        undefined,
        pass.contentScopeStarts
      );
      expect(compiled).toBeDefined();
      const vs = ShaderMacroProcessor.evaluate([...compiled!.vertexShaderInstructions!], macros);
      const fs = ShaderMacroProcessor.evaluate([...compiled!.fragmentShaderInstructions!], macros);
      expect(vs).toContain("a.TANGENT.x * 255.0");
      expect(vs).toContain("a.TANGENT.z * 256.0");
      expect(fs.length).toBeGreaterThan(0);
    }

    const forwardCompiled = compiler._parseShaderPass(
      passes[1].contents,
      passes[1].vertexEntry,
      passes[1].fragmentEntry,
      ShaderLanguage.GLSLES300,
      undefined,
      passes[1].contentScopeStarts
    )!;
    const forwardVs = ShaderMacroProcessor.evaluate([...forwardCompiled.vertexShaderInstructions!], macros);
    expect(forwardVs).toContain("a.COLOR_0.rgb * 2.0");
    expect(forwardVs).toContain("a.COLOR_0.a * 8.0");
  });

  it("preserves LOD1/LOD2 color, lighting, lantern cap, window visibility, and roof silhouette parity", () => {
    // 1. Roof outward normal bias matches 3D shingle elevation; plaster bias stays slim so recessed windows stay visible.
    expect(proxyPartNormalBias({ material: "roof_tile" })).toBe(ROOF_NORMAL_BIAS_METRES);
    expect(ROOF_NORMAL_BIAS_METRES).toBeGreaterThanOrEqual(0.06);
    expect(proxyPartNormalBias({ material: "wall", plaster: { wear: 0.2, color: 0, wallLength: 4, edgeDistances: [] } })).toBe(
      PLASTER_NORMAL_BIAS_METRES
    );
    expect(PLASTER_NORMAL_BIAS_METRES).toBeLessThanOrEqual(0.02);
    expect(proxyDecorationNormalBias(DecorationMaterial.glass)).toBeGreaterThan(
      proxyDecorationNormalBias(DecorationMaterial.frame)
    );
    expect(proxyDecorationNormalBias(DecorationMaterial.frame)).toBeGreaterThan(PLASTER_NORMAL_BIAS_METRES);

    // 2. Lantern body collapses to its slim upper cap (never swallowing the lower glowing lantern bulb).
    const lanternBody: ConstructionDecorationPart = {
      id: "b/l/body",
      ownerId: "b",
      kind: "wall-lamp",
      positions: [0, 1, 0, 0.4, 1, 0, 0.4, 2, 0.4, 0, 2, 0.4],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
      colors: [0.15, 0.1, 0.12, 0.15, 0.1, 0.12, 0.15, 0.1, 0.12, 0.15, 0.1, 0.12],
      emission: [0, 0, 0, 0],
      indices: [0, 1, 2, 0, 2, 3],
      appearance: {
        materialUVs: [[0, 0], [1, 0], [1, 1], [0, 1]],
        kinds: [DecorationMaterial.lanternBody, DecorationMaterial.lanternBody, DecorationMaterial.lanternBody, DecorationMaterial.lanternBody],
        colorIds: [0, 0, 0, 0],
        centers: [0.2, 1.5, 0.2, 0.2, 1.5, 0.2, 0.2, 1.5, 0.2, 0.2, 1.5, 0.2]
      }
    };
    const [cap] = collapseDecorationToBoxes(lanternBody);
    expect(cap).toBeDefined();
    let capMinY = Infinity;
    for (let i = 1; i < cap!.positions.length; i += 3) capMinY = Math.min(capMinY, cap!.positions[i]!);
    expect(capMinY).toBeGreaterThan(1.65);

    // 3. Window frame collapses into 4 hollow perimeter bars (flush on rotated walls too, never swallowing glass),
    //    and unlit daytime window glass stays bright frosted glass proud of wall/plaster.
    const c45 = Math.SQRT1_2;
    const rotatedFrame: ConstructionDecorationPart = {
      id: "b/w/frame",
      ownerId: "b",
      kind: "window",
      // 1.2m wide x 1.4m tall x 0.24m thick frame rotated 45 deg in XZ (closed mesh whose normals cancel out).
      positions: [
        -0.6 * c45 - 0.12 * c45, 1.0, -0.6 * c45 + 0.12 * c45,
        0.6 * c45 - 0.12 * c45, 1.0, 0.6 * c45 + 0.12 * c45,
        0.6 * c45 + 0.12 * c45, 2.4, 0.6 * c45 - 0.12 * c45,
        -0.6 * c45 + 0.12 * c45, 2.4, -0.6 * c45 - 0.12 * c45
      ],
      normals: [0, 0, 1, 0, 0, -1, 0, 0, 1, 0, 0, -1],
      colors: [0.1, 0.2, 0.12, 0.1, 0.2, 0.12, 0.1, 0.2, 0.12, 0.1, 0.2, 0.12],
      emission: [0, 0, 0, 0],
      indices: [0, 1, 2, 0, 2, 3],
      appearance: {
        materialUVs: [[0, 0], [1, 0], [1, 1], [0, 1]],
        kinds: [DecorationMaterial.frame, DecorationMaterial.frame, DecorationMaterial.frame, DecorationMaterial.frame],
        colorIds: [0, 0, 0, 0],
        centers: [0, 1.7, 0, 0, 1.7, 0, 0, 1.7, 0, 0, 1.7, 0]
      }
    };
    const frameBars = collapseDecorationToBoxes(rotatedFrame);
    expect(frameBars).toHaveLength(4);
    // Verify flush depth along wall normal N = (-c45, 0, c45) is clamped <= 0.16m (not a 0.85m axis-aligned cube).
    let minN = Infinity,
      maxN = -Infinity;
    for (const bar of frameBars) {
      for (let i = 0; i < bar.positions.length; i += 3) {
        const pn = bar.positions[i]! * -c45 + bar.positions[i + 2]! * c45;
        if (pn < minN) minN = pn;
        if (pn > maxN) maxN = pn;
      }
    }
    expect(maxN - minN).toBeLessThanOrEqual(0.16);

    const windowGlass: ConstructionDecorationPart = {
      id: "b/w/glass",
      ownerId: "b",
      kind: "window",
      positions: [0, 1, 5.0, 1, 1, 5.0, 1, 2, 5.02, 0, 2, 5.02],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
      colors: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1],
      emission: [0, 0, 0, 0],
      indices: [0, 1, 2, 0, 2, 3],
      appearance: {
        materialUVs: [[0, 0], [1, 0], [1, 1], [0, 1]],
        kinds: [DecorationMaterial.lattice, DecorationMaterial.lattice, DecorationMaterial.lattice, DecorationMaterial.lattice],
        colorIds: [0, 0, 0, 0],
        centers: [0.5, 1.5, 5.0, 0.5, 1.5, 5.0, 0.5, 1.5, 5.0, 0.5, 1.5, 5.0]
      }
    };
    const [glassBox] = collapseDecorationToBoxes(windowGlass);
    expect(glassBox).toBeDefined();
    expect(glassBox!.appearance?.kinds?.[0]).toBe(DecorationMaterial.glass);
    // Dark recessed interior base (sky brightness comes from physical F0=0.04 Fresnel reflection, not a bright white floor).
    expect(glassBox!.colors[0]).toBeLessThan(0.1);
    let glassMaxZ = -Infinity;
    for (let i = 2; i < glassBox!.positions.length; i += 3) glassMaxZ = Math.max(glassMaxZ, glassBox!.positions[i]!);
    expect(glassMaxZ).toBeGreaterThan(5.05);

    // 4. Both GlobalProxy and FarProxy shaders use stone-grey mortar, roof AO / brick calibration,
    //    GPR-neutral sky-gradient Fresnel glass (no cubemap sampler / envDFGApprox / GGX / fwidth in
    //    the glass branch so wall/roof Adreno wave occupancy stays flat), and a single masonryFarProxyLight call.
    for (const src of [globalProxyShaderSource, farProxyShaderSource]) {
      expect(src).not.toContain("vec3(0.45, 0.40, 0.36)");
      expect(src).not.toContain("vec3(0.44, 0.48, 0.47)");
      expect(src).toContain("mortarAlbedo");
      expect(src).toContain("0.73 * masonryFarCourseTone");
      expect(src).toContain("1.20 * masonryFarCourseTone");
      expect(src).not.toContain("envDFGApprox(");
      expect(src).not.toContain("getLightProbeRadiance(");
      expect(src).toContain("float fresnel =");
      expect(src.match(/\bmasonryFarProxyLight\s*\(/g)).toHaveLength(1);
    }
  });
});
