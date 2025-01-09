/**
 * @title LUT Test
 * @category Material
 */
import { Camera, Material, MeshRenderer, PrimitiveMesh, Shader, Vector3, WebGLEngine } from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

// Create engine
WebGLEngine.create({ canvas: "canvas" })
  .then((engine) => {
    engine.canvas.resizeByClientSize(2);

    const scene = engine.sceneManager.activeScene;
    const rootEntity = scene.createRootEntity();
    // engine.run();

    // Create camera
    const cameraEntity = rootEntity.createChild("Camera");
    cameraEntity.transform.position = new Vector3(0, 0, 3);
    const camera = cameraEntity.addComponent(Camera);

    const entity = rootEntity.createChild("Entity");
    entity.transform.setRotation(90, 0, 0);
    const renderer = entity.addComponent(MeshRenderer);
    renderer.mesh = PrimitiveMesh.createPlane(engine, 1, 1);

    const shader = Shader.create(
      "LUT-test",
      `
    attribute vec3 POSITION;
    attribute vec2 TEXCOORD_0;
    uniform mat4 renderer_MVPMat;
    varying vec2 v_uv;
    
    void main(){
      gl_Position = renderer_MVPMat * vec4(POSITION, 1.0);
      v_uv = TEXCOORD_0;
    }`,
      `
    varying vec2 v_uv;
    uniform sampler2D scene_PrefilteredDFG;

    void main(){
      gl_FragColor = texture2D(scene_PrefilteredDFG, v_uv);
    }
    `
    );
    const material = new Material(engine, shader);
    renderer.setMaterial(material);
    updateForE2E(engine);
    initScreenshot(engine, camera);
  })
  .catch((e) => {
    console.log(e);
  });
