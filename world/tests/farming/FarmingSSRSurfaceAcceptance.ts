import {
  Camera,
  Color,
  DirectLight,
  MeshRenderer,
  ModelMesh,
  PBRMaterial,
  Scene,
  Shader,
  ScreenSpaceReflection,
  ScreenSpaceReflectionActivationMode,
  ScreenSpaceReflectionReceiverMode,
  Texture2D,
  TextureFormat,
  Vector2,
  Vector3,
  Vector4,
  WebGLEngine,
  WebGLMode
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import plant from "../../../packages/farming/src/farming/procedural/runtime/PlantOrganTint.shader?raw";
import { SOIL_MOISTURE_SHADER } from "../../../packages/farming/src/farming/presentation/soil/SoilMoistureShader";
import { FARM_ITEM_HIGHLIGHT_SHADER } from "../../../packages/farming/src/farming/presentation/FarmItemHighlightShader";
import { getPlantShaderPreparationPasses } from "../../../packages/farming/src/farming/procedural/runtime/preparePlantShaderPrograms";

const FIXTURE = { count: 50, columns: 10, spacing: 0.9, halfSize: 0.35, warmupFrames: 3 };
const paths = ["direct", "clone-runtime", "clone-author"] as const;
const sources = { PlantOrganTint: plant, SoilMoisture: SOIL_MOISTURE_SHADER, ItemRimLight: FARM_ITEM_HIGHLIGHT_SHADER };
const baseline = new URL(location.href).searchParams.has("baseline");
const results: object[] = [];
const output = document.querySelector<HTMLPreElement>("#results")!;
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function main() {
  const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
  const engine = await WebGLEngine.create({
    canvas,
    shaderCompiler: new ShaderCompiler(),
    graphicDeviceOptions: { webGLMode: WebGLMode.WebGL2 }
  });
  const gl = canvas.getContext("webgl2")!;
  assert(gl, "WebGL2 is required for this regression");
  const scene = new Scene(engine);
  engine.sceneManager.activeScene = scene;
  scene.castShadows = false;
  scene.background.solidColor.set(0, 0, 0, 1);
  const cameraEntity = scene.createRootEntity("Camera");
  cameraEntity.transform.setPosition(0, 0, 12);
  const camera = cameraEntity.addComponent(Camera);
  camera.enableHDR = false;
  camera.farClipPlane = 50;
  camera.screenSpaceReflection.maxRoughness = 1;
  scene.createRootEntity("Light").addComponent(DirectLight);
  const texture = new Texture2D(engine, 2, 2, TextureFormat.R8G8B8A8, false);
  // An actual texture cutout, independent of the zero-valued plant organ mask.
  texture.setPixelBuffer(
    new Uint8Array([255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0])
  );
  let calls = 0;
  const originals = {
    drawElements: gl.drawElements,
    drawArrays: gl.drawArrays,
    drawElementsInstanced: gl.drawElementsInstanced,
    drawArraysInstanced: gl.drawArraysInstanced
  };
  gl.drawElements = (...args: Parameters<typeof gl.drawElements>) => {
    calls++;
    originals.drawElements.apply(gl, args);
  };
  gl.drawArrays = (...args: Parameters<typeof gl.drawArrays>) => {
    calls++;
    originals.drawArrays.apply(gl, args);
  };
  gl.drawElementsInstanced = (...args: Parameters<typeof gl.drawElementsInstanced>) => {
    calls++;
    originals.drawElementsInstanced.apply(gl, args);
  };
  gl.drawArraysInstanced = (...args: Parameters<typeof gl.drawArraysInstanced>) => {
    calls++;
    originals.drawArraysInstanced.apply(gl, args);
  };
  const frame = async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    calls = 0;
    engine.update();
    assert(gl.getError() === gl.NO_ERROR, "GL frame must be error-free");
    return calls;
  };
  const pixels = () => {
    const bytes = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    const FNV1A_OFFSET = 2166136261,
      FNV1A_PRIME = 16777619;
    let hash = FNV1A_OFFSET,
      visible = 0;
    for (let index = 0; index < bytes.length; index++) hash = Math.imul(hash ^ bytes[index], FNV1A_PRIME);
    for (let index = 0; index < bytes.length; index += 4)
      if (bytes[index] + bytes[index + 1] + bytes[index + 2] > 0) visible++;
    return { hash: hash >>> 0, visible };
  };
  try {
    for (const [name, source] of [...Object.entries(sources), ["PBR", ""]]) {
      const shader = name === "PBR" ? Shader.find("PBR") : Shader.create(source);
      assert(shader, `${name}: shader creation`);
      for (const registration of name === "PBR" ? (["direct"] as const) : paths) {
        const root = scene.createRootEntity(`${name}:${registration}`);
        const mesh = new ModelMesh(engine);
        const s = FIXTURE.halfSize;
        mesh.setPositions([new Vector3(-s, -s, 0), new Vector3(s, -s, 0), new Vector3(s, s, 0), new Vector3(-s, s, 0)]);
        mesh.setNormals(Array.from({ length: 4 }, () => new Vector3(0, 0, 1)));
        mesh.setUVs([new Vector2(0, 0), new Vector2(1, 0), new Vector2(1, 1), new Vector2(0, 1)]);
        mesh.setColors(Array.from({ length: 4 }, () => new Color(0.8, 0.8, 0.8, name === "PlantOrganTint" ? 0 : 1)));
        mesh.setIndices(new Uint16Array([0, 1, 2, 0, 2, 3]));
        mesh.addSubMesh(0, 6);
        mesh.bounds.min.set(-s, -s, 0);
        mesh.bounds.max.set(s, s, 0);
        mesh.uploadData(false);
        const original = new PBRMaterial(engine),
          material = new PBRMaterial(engine);
        original.baseColor.set(0.6, 0.8, 0.3, 1);
        original.metallic = 0.5;
        original.roughness = 0.2;
        original.baseTexture = texture;
        original.alphaCutoff = 0.5;
        if (registration === "clone-author") original.screenSpaceReflection = { mode: "On", intensity: 1 };
        if (registration === "clone-runtime")
          assert(
            ScreenSpaceReflection.setMaterialReceiver(original, ScreenSpaceReflectionReceiverMode.OpaqueComposite),
            "PBR source registration"
          );
        original.cloneTo(material);
        material.shader = shader;
        const accepted =
          registration === "direct"
            ? ScreenSpaceReflection.setMaterialReceiver(material, ScreenSpaceReflectionReceiverMode.OpaqueComposite)
            : ScreenSpaceReflection.isMaterialReceiver(material);
        assert(accepted === (baseline || name === "PBR"), `${name}/${registration}: receiver eligibility`);
        const renderers: MeshRenderer[] = [];
        for (let index = 0; index < FIXTURE.count; index++) {
          const entity = root.createChild(`Patch ${index}`);
          entity.transform.setPosition(
            ((index % FIXTURE.columns) - (FIXTURE.columns - 1) / 2) * FIXTURE.spacing,
            (Math.floor(index / FIXTURE.columns) - (FIXTURE.count / FIXTURE.columns - 1) / 2) * FIXTURE.spacing,
            0
          );
          const renderer = entity.addComponent(MeshRenderer);
          renderer.mesh = mesh;
          renderer.enableVertexColor = true;
          renderer.setMaterial(material);
          renderer.shaderData.setVector4("renderer_OrganTint", new Vector4(0.7, 0.2, 0.1, 1));
          renderer.shaderData.setVector4("renderer_ItemHighlight", new Vector4(0.2, 0.5, 0.1, 1));
          renderers.push(renderer);
        }
        material.shaderData.setColor("soil_DryColor", new Color(0.7, 0.5, 0.3, 1));
        material.shaderData.setColor("soil_WetColor", new Color(0.2, 0.1, 0.05, 1));
        material.shaderData.setVector2("soil_Roughness", new Vector2(0.8, 0.1));
        material.shaderData.setFloat("soil_CultivationProgress", 1);
        material.shaderData.setFloat("soil_BoundaryProgress", 1);
        for (const row of ["soil_Row0", "soil_Row1", "soil_Row2"])
          material.shaderData.setVector3(row, new Vector3(1, 1, 1));
        camera.screenSpaceReflection.activationMode = ScreenSpaceReflectionActivationMode.ForceOff;
        for (let warmup = 0; warmup < FIXTURE.warmupFrames; warmup++) await frame();
        const forwardDrawCalls = await frame(),
          forwardPixels = pixels();
        assert(forwardPixels.visible > 0, `${name}: Forward must draw visible cutout pixels`);
        camera.screenSpaceReflection.activationMode = ScreenSpaceReflectionActivationMode.ForceOn;
        for (let warmup = 0; warmup < FIXTURE.warmupFrames; warmup++) await frame();
        const ssrDrawCalls = await frame();
        const metrics = structuredClone(camera.screenSpaceReflection.metrics);
        assert(metrics.supported, `SSR support: ${metrics.unsupportedReason}`);
        const expectedReceiver = baseline || name === "PBR";
        assert(
          expectedReceiver ? metrics.surfacePassDrawCount > 0 : metrics.surfacePassDrawCount === 0,
          `${name}: Surface draws`
        );
        const preparedStages = getPlantShaderPreparationPasses(engine, camera, renderers[0], material).map((pass) =>
          pass.getTagValue("pipelineStage")
        );
        assert(
          preparedStages.includes("ScreenSpaceReflectionSurface") === expectedReceiver,
          `${name}: prewarm follows receiver capability`
        );
        results.push({
          name,
          registration,
          meshes: FIXTURE.count,
          accepted,
          forwardDrawCalls,
          ssrDrawCalls,
          surfaceDraws: metrics.surfacePassDrawCount,
          receivers: metrics.opaqueReceiverElementCount,
          forwardPixels,
          preparedStages,
          inactiveReason: metrics.inactiveReason
        });
        output.textContent = JSON.stringify(results, null, 2);
        root.destroy();
        material.destroy();
        original.destroy();
        mesh.destroy();
      }
    }
    document.body.dataset.status = "passed";
  } finally {
    Object.assign(gl, originals);
    engine.destroy();
  }
}
void main().catch((error) => {
  document.body.dataset.status = "failed";
  output.textContent = JSON.stringify(
    { results, error: String(error), stack: error instanceof Error ? error.stack : null },
    null,
    2
  );
});
