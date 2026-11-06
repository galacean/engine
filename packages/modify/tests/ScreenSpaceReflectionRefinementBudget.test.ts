import {
  Camera,
  Material,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  RenderTarget,
  Scene,
  Shader,
  Texture2D,
  TextureFormat,
  Vector3,
  ScreenSpaceReflectionActivationMode as Activation,
  ScreenSpaceReflectionContent as Content,
  ScreenSpaceReflectionReceiverPolicy as Policy,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import source from "../src/native/shader/src/Shaders/Lighting/ScreenSpaceReflection.shader?raw";
import { expect, it } from "vitest";

const SIZE = 128;
const MAX_STEPS = 64;
const REFINEMENT_STEPS = 5;
const BYTE_MAX = 255;
const HIT_CONFIDENCE_THRESHOLD = 20;

/** Observe searches without changing their decisions. RGB stores search, invalid bracket and step counts. */
function instrumentTrace(name: string): Shader {
  const replacements: readonly (readonly [string, string])[] = [
    ['Shader "Lighting/ScreenSpaceReflection"', `Shader "${name}"`],
    ["out vec4 packedOrigin) {", "out vec4 packedOrigin, out vec3 crossingCounts) {"],
    [
      "        vec2 uv;\n        vec4 surface;",
      "        crossingCounts = vec3(0.0);\n        vec2 uv;\n        vec4 surface;"
    ],
    [
      "float previousDifference = -receiverThickness;",
      "float previousDifference = -receiverThickness;\n        float actualPreviousDifference = -receiverThickness;"
    ],
    [
      "          float difference = sampleScreenSpaceReflectionDepthDifference(rayPosition, projectedUV).x;",
      "          crossingCounts.z += 1.0;\n          float difference = sampleScreenSpaceReflectionDepthDifference(rayPosition, projectedUV).x;"
    ],
    [
      "          if (difference >= 0.0 && previousDifference < 0.0) {",
      "          if (difference >= 0.0 && previousDifference < 0.0) {\n            crossingCounts.x += 1.0;\n            if (actualPreviousDifference >= 0.0) crossingCounts.y += 1.0;\n            actualPreviousDifference = difference;"
    ],
    [
      "          previousDifference = difference;\n        }",
      "          previousDifference = difference;\n          actualPreviousDifference = difference;\n        }"
    ],
    [
      "output.reflection = evaluateScreenSpaceReflectionTrace(varyings, origin);",
      `vec3 crossingCounts;\n        output.reflection = evaluateScreenSpaceReflectionTrace(varyings, origin, crossingCounts);\n        output.reflection.rgb = crossingCounts / ${MAX_STEPS}.0;`
    ]
  ];
  let instrumented = source;
  for (const [anchor, replacement] of replacements) {
    expect(instrumented.split(anchor).length, `instrumentation anchor: ${anchor}`).toBe(2);
    instrumented = instrumented.replace(anchor, replacement);
  }
  return Shader.create(instrumented)!;
}

it.each([false, true])(
  "does not repeatedly refine behind a foreground surface (transparent=%s)",
  async (transparent) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIZE;
    const engine = await WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });
    try {
      const scene = new Scene(engine);
      engine.sceneManager.activeScene = scene;
      scene.screenSpaceReflection.apply({
        activationMode: Activation.ForceOn,
        receiverPolicy: Policy.ExplicitOnly,
        reflectionContent: transparent ? Content.OpaqueAndTransparent : Content.OpaqueOnly,
        resolutionScale: 1,
        maxRaySteps: MAX_STEPS,
        hitRefinementSteps: REFINEMENT_STEPS,
        maxRayDistance: 40,
        thickness: 0.02,
        edgeFade: 0
      });
      const camera = scene.createRootEntity().addComponent(Camera);
      camera.entity.transform.setPosition(0, 2.5, 6);
      camera.entity.transform.lookAt(new Vector3(0, 0.5, 0));
      camera.renderTarget = new RenderTarget(
        engine,
        SIZE,
        SIZE,
        new Texture2D(engine, SIZE, SIZE, TextureFormat.R8G8B8A8, false, false),
        TextureFormat.Depth24
      );
      const floor = scene.createRootEntity().addComponent(MeshRenderer);
      floor.mesh = PrimitiveMesh.createPlane(engine, 20, 20);
      const mirror = new PBRMaterial(engine);
      mirror.roughness = 0.05;
      mirror.screenSpaceReflection = { mode: "On", intensity: 1 };
      floor.setMaterial(mirror);
      const wall = scene.createRootEntity().addComponent(MeshRenderer);
      wall.mesh = PrimitiveMesh.createCuboid(engine, 5, 3, 0.25);
      wall.entity.transform.setPosition(0, 1.5, -3);
      const red = new PBRMaterial(engine);
      red.emissiveColor.set(1, 0, 0, 1);
      red.screenSpaceReflection = { mode: "Off", intensity: 0 };
      wall.setMaterial(red);
      const foreground = scene.createRootEntity().addComponent(MeshRenderer);
      foreground.mesh = PrimitiveMesh.createCuboid(engine, 1, 3, 0.25);
      foreground.entity.transform.setPosition(0, 1.5, 1);
      const foregroundMaterial = red.clone();
      foregroundMaterial.isTransparent = transparent;
      foregroundMaterial.baseColor.a = transparent ? 0.5 : 1;
      foregroundMaterial.contributeScreenSpaceReflection = transparent;
      foreground.setMaterial(foregroundMaterial);
      const diagnostic = instrumentTrace(`SSR/RefinementBudget/${transparent}`);
      const pass = (
        camera as unknown as {
          _renderPipeline: {
            _screenSpaceReflectionPass: {
              _material: Material;
              _traceTarget: RenderTarget;
              trace(): void;
            };
          };
        }
      )._renderPipeline._screenSpaceReflectionPass;
      const trace = pass.trace;
      let observe = false;
      let pixels = new Uint8Array(SIZE * SIZE * 4);
      pass.trace = function () {
        const original = this._material.shader;
        try {
          if (observe) this._material.shader = diagnostic;
          trace.call(this);
          pixels = new Uint8Array(SIZE * SIZE * 4);
          (this._traceTarget.getColorTexture(0) as Texture2D).getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
        } finally {
          this._material.shader = original;
        }
      };
      const countHits = () => {
        let hits = 0;
        for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > HIT_CONFIDENCE_THRESHOLD) hits++;
        return hits;
      };
      const reports = [];
      for (const width of [0.5, 2, 4]) {
        foreground.entity.transform.setScale(width, 1, 1);
        observe = false;
        engine.update();
        const hits = countHits();
        expect(hits).toBeGreaterThan(100);
        observe = true;
        engine.update();
        expect(countHits()).toBe(hits);
        let searches = 0,
          invalid = 0,
          steps = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          searches += Math.round((pixels[i] * MAX_STEPS) / BYTE_MAX);
          invalid += Math.round((pixels[i + 1] * MAX_STEPS) / BYTE_MAX);
          steps += Math.round((pixels[i + 2] * MAX_STEPS) / BYTE_MAX);
        }
        reports.push({
          transparent,
          width,
          hits,
          searches,
          invalid,
          steps,
          depthReads: steps + searches * (REFINEMENT_STEPS + 1)
        });
      }
      console.info("SSR_REFINEMENT=" + JSON.stringify(reports));
      expect(reports.map((r) => r.invalid)).toEqual([0, 0, 0]);
      expect(
        (engine as unknown as { _hardwareRenderer: { gl: WebGL2RenderingContext } })._hardwareRenderer.gl.getError()
      ).toBe(0);
    } finally {
      engine.destroy();
    }
  }
);
