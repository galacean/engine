/**
 * @title Opaque Texture
 * @category Camera
 */
import {
  Animator,
  BaseMaterial,
  Camera,
  DirectLight,
  Engine,
  Entity,
  GLTFResource,
  Logger,
  MeshRenderer,
  PrimitiveMesh,
  RenderFace,
  Shader,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { OrbitControl } from "@galacean/engine-toolkit";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

Logger.enable();
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize(2);
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // camera
  const cameraEntity = rootEntity.createChild("camera_node");
  cameraEntity.transform.position = new Vector3(0, 1, 3);
  const camera = cameraEntity.addComponent(Camera);
  cameraEntity.addComponent(OrbitControl).target = new Vector3(0, 1, 0);
  camera.opaqueTextureEnabled = true;

  const lightNode = rootEntity.createChild("light_node");
  lightNode.addComponent(DirectLight).intensity = 0.6;
  lightNode.transform.lookAt(new Vector3(0, 0, 1));
  lightNode.transform.rotate(new Vector3(0, 90, 0));

  engine.resourceManager
    .load<GLTFResource>("https://gw.alipayobjects.com/os/bmw-prod/5e3c1e4e-496e-45f8-8e05-f89f2bd5e4a4.glb")
    .then((gltfResource) => {
      const { defaultSceneRoot } = gltfResource;
      rootEntity.addChild(defaultSceneRoot);
      const animator = defaultSceneRoot.getComponent(Animator);
      animator.play("agree");

      showDepthPlane(engine, cameraEntity);


      updateForE2E(engine);

      initScreenshot(engine, camera);
    });
});

function showDepthPlane(engine: Engine, camera: Entity): void {
  const entity = camera.createChild("Plane");
  entity.transform.setPosition(0, 0, -1);
  entity.transform.rotate(new Vector3(-90, 0, 0));
  const renderer = entity.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createPlane(engine, 0.5, 0.5);

  // Create material
  const material = new BaseMaterial(engine, Shader.find("RenderOpaqueTexture"));
  material.renderFace = RenderFace.Double;
  material.isTransparent = true;
  renderer.setMaterial(material);
}

const renderOpaqueVS = `
    #include <common>
    #include <common_vert>
    #include <blendShape_input>
    #include <uv_share>
    #include <FogVertexDeclaration>

    void main() {
        #include <begin_position_vert>
        #include <blendShape_vert>
        #include <skinning_vert>
        #include <uv_vert>
        #include <position_vert>

        #include <FogVertex>
    }`;

const renderOpaqueFS = `
    #include <common>
    #include <uv_share>
    #include <FogFragmentDeclaration>

    uniform sampler2D camera_OpaqueTexture;

    void main() {
        vec4 baseColor = texture2D(camera_OpaqueTexture, v_uv);
        #ifndef ENGINE_IS_COLORSPACE_GAMMA
            baseColor = gammaToLinear(baseColor);
        #endif

        gl_FragColor = baseColor;

        #ifndef MATERIAL_IS_TRANSPARENT
            gl_FragColor.a = 1.0;
        #endif

        #include <FogFragment>

        #ifndef ENGINE_IS_COLORSPACE_GAMMA
            gl_FragColor = linearToGamma(gl_FragColor);
        #endif
    }`;

Shader.create("RenderOpaqueTexture", renderOpaqueVS, renderOpaqueFS);
