import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createWaterSurfaceAppearanceGpuCalibrationFragmentSource } from "../../runtime/surface/WaterSurfaceAppearanceGpuCalibration";
import { createWaterContactFoamShaderFunctions } from "../../runtime/surface/WaterContactFoamShader";
import { createWaterSurfaceAppearanceShaderFunctions } from "../../runtime/surface/WaterSurfaceAppearanceShader";
import { createWaterSurfaceBrdfShaderFunctions } from "../../runtime/surface/WaterSurfaceBrdfShader";

function readRuntimeSource(relativePath: string): string {
  return readFileSync(new URL(`../../runtime/${relativePath}`, import.meta.url), "utf8");
}

const calibrationModuleSource = readRuntimeSource("surface/WaterSurfaceAppearanceGpuCalibration.ts");
const appearanceModuleSource = readRuntimeSource("surface/WaterSurfaceAppearanceShader.ts");

describe("WaterSurfaceAppearanceGpuCalibration source contract", () => {
  it("keeps the shared Appearance and calibration modules generic", () => {
    const generatedSource = [
      createWaterSurfaceAppearanceShaderFunctions(),
      createWaterSurfaceAppearanceGpuCalibrationFragmentSource()
    ].join("\n");

    for (const source of [appearanceModuleSource, calibrationModuleSource, generatedSource]) {
      expect(source).not.toMatch(/\bGrasslands\b/i);
      expect(source).not.toMatch(/\bhero-grasslands\b/i);
      expect(source).not.toMatch(/\bpreset\b/i);
      expect(source).not.toMatch(/https?:\/\//i);
      expect(source).not.toMatch(/\burl\s*\(/i);
      expect(source).not.toMatch(/\.(?:png|jpe?g|webp|ktx2?)\b/i);
    }
  });

  it("assembles and calls the shared Appearance, contact-foam, and BRDF modules", () => {
    const appearance = createWaterSurfaceAppearanceShaderFunctions();
    const contactFoam = createWaterContactFoamShaderFunctions(3);
    const brdf = createWaterSurfaceBrdfShaderFunctions();
    const fragmentSource = createWaterSurfaceAppearanceGpuCalibrationFragmentSource();
    const mainSource = fragmentSource.slice(fragmentSource.indexOf("void main()"));

    expect(calibrationModuleSource).toContain(
      'import { createWaterContactFoamShaderFunctions } from "./WaterContactFoamShader"'
    );
    expect(calibrationModuleSource).toContain(
      'import { createWaterSurfaceAppearanceShaderFunctions } from "./WaterSurfaceAppearanceShader"'
    );
    expect(calibrationModuleSource).toContain(
      'import { createWaterSurfaceBrdfShaderFunctions } from "./WaterSurfaceBrdfShader"'
    );
    expect(calibrationModuleSource).toContain("const appearance = createWaterSurfaceAppearanceShaderFunctions()");
    expect(calibrationModuleSource).toContain("const contactFoam = createWaterContactFoamShaderFunctions(3)");
    expect(calibrationModuleSource).toContain("const brdf = createWaterSurfaceBrdfShaderFunctions()");
    expect(fragmentSource).toContain(appearance);
    expect(fragmentSource).toContain(contactFoam);
    expect(fragmentSource).toContain(brdf);

    expect(mainSource).toContain("waterSurfaceAppearanceDecodeTangentNormal(");
    expect(mainSource).toContain("waterSurfaceAppearanceBlendTangentNormals(");
    expect(mainSource).toContain("waterSurfaceAppearanceDepthTintFactor(");
    expect(mainSource).toContain("waterSurfaceAppearanceCoastalAlpha(");
    expect(mainSource).toContain("waterSurfaceAppearanceRefractionUvDelta(");
    expect(mainSource).toContain("waterSurfaceAppearanceRefractionSampleValidity(");
    expect(mainSource).toContain("evaluateWaterContactFoamDepthMask(");
    expect(mainSource).toContain("waterSurfaceDirectSpecular(");
  });

  it("keeps the shared Appearance helpers uniform- and caller-agnostic", () => {
    const source = createWaterSurfaceAppearanceShaderFunctions();

    expect(source).toContain("waterSurfaceAppearanceDecodeTangentNormal");
    expect(source).toContain("waterSurfaceAppearanceBlendTangentNormals");
    expect(source).toContain("waterSurfaceAppearanceDepthTintFactor");
    expect(source).toContain("waterSurfaceAppearanceCoastalAlpha");
    expect(source).toContain("waterSurfaceAppearanceRefractionUvDelta");
    expect(source).toContain("waterSurfaceAppearanceRefractionSampleValidity");
    expect(source).not.toMatch(/\buniform\b/);
    expect(source).not.toMatch(/\bmaterial_/);
    expect(source).not.toMatch(/\bu_/);
  });

  it("renders all controlled modes through draw and raw RGBA readPixels", () => {
    const renderedModes = Array.from(
      calibrationModuleSource.matchAll(/renderPass\(gl, resources\.program, (\d),/g),
      (match) => Number(match[1])
    );
    const fragmentSource = createWaterSurfaceAppearanceGpuCalibrationFragmentSource();

    expect(renderedModes).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    for (const mode of [0, 1, 2, 3, 4, 5, 6, 7]) {
      expect(fragmentSource).toMatch(new RegExp(`u_mode == ${mode}`));
    }
    expect(calibrationModuleSource).toContain("gl.drawArrays(gl.TRIANGLES, 0, 3)");
    expect(calibrationModuleSource).toContain("gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bytes)");
    expect(calibrationModuleSource.indexOf("gl.drawArrays(gl.TRIANGLES, 0, 3)")).toBeLessThan(
      calibrationModuleSource.indexOf("gl.readPixels(0, 0, width, height")
    );
    expect(calibrationModuleSource).toContain("const error = gl.getError()");
    expect(calibrationModuleSource).toContain("return Object.freeze(Array.from(bytes))");
  });

  it("returns raw samples and provenance without self-reporting M3 acceptance errors", () => {
    const readbackContract =
      calibrationModuleSource.match(
        /export interface WaterSurfaceAppearanceGpuCalibrationReadback \{[\s\S]*?\n\}\n\ninterface MutableResourceCount/
      )?.[0] ?? "";

    expect(readbackContract).not.toBe("");
    expect(readbackContract).toContain('readonly source: "transient-webgl2-shared-glsl"');
    expect(readbackContract).toContain('readonly readPixelsFormat: "rgba8"');
    expect(readbackContract).toContain("readonly vertexSourceSha256: string");
    expect(readbackContract).toContain("readonly fragmentSourceSha256: string");
    expect(readbackContract).toContain("readonly depthTintRgbaBytes: readonly number[]");
    expect(readbackContract).toContain("readonly encodedUvDeltaRgbaBytes: readonly number[]");
    expect(readbackContract).toContain("readonly validDisplacedSampleRgbaBytes: readonly number[]");
    expect(readbackContract).toContain("readonly aboveWaterGuardedSampleRgbaBytes: readonly number[]");
    expect(readbackContract).toContain("readonly rgbaBytes: readonly number[]");
    expect(readbackContract).not.toMatch(/\bpassed\b/i);
    expect(readbackContract).not.toMatch(/\bverified\b/i);
    expect(readbackContract).not.toMatch(/\bthreshold\b/i);
    expect(readbackContract).not.toMatch(/\btolerance\b/i);
    expect(readbackContract).not.toMatch(/\bmax(?:imum)?(?:Channel)?Error\b/i);
    expect(readbackContract).not.toMatch(/\brelativeError\b/i);
    expect(calibrationModuleSource).toMatch(/threshold evaluation belongs\s*\n\s*\*\s+to the independent E2E harness/);
  });

  it("deletes every transient resource in finally and exposes the post-cleanup balance", () => {
    const finallySource = calibrationModuleSource.slice(calibrationModuleSource.indexOf("} finally {"));

    expect(finallySource).toContain("deleteResources(gl, resources, deleted)");
    expect(finallySource).toContain('gl.getExtension("WEBGL_lose_context")');
    expect(finallySource).toContain("loseContext.loseContext()");
    expect(finallySource).toContain("canvas.remove()");
    expect(finallySource).toContain("cleanupReadback.deleted = freezeResourceCount(deleted)");
    expect(finallySource).toContain("cleanupReadback.activeAfterCleanup = subtractResourceCount(created, deleted)");
    expect(calibrationModuleSource).toContain("gl.deleteFramebuffer(resources.framebuffer)");
    expect(calibrationModuleSource).toContain('["normalTexture", "gradientTexture", "colorTexture"]');
    expect(calibrationModuleSource).toContain("gl.deleteVertexArray(resources.vertexArray)");
    expect(calibrationModuleSource).toContain("gl.deleteBuffer(resources.buffer)");
    expect(calibrationModuleSource).toContain("gl.deleteProgram(resources.program)");
    expect(calibrationModuleSource).toContain('["vertexShader", "fragmentShader"]');
    expect(calibrationModuleSource).toContain("gl.deleteShader(shader)");
  });
});
