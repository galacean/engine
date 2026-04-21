/**
 * @title Opaque Texture
 * @category Camera
 */
import {
  Animator,
  BaseMaterial,
  Camera,
  Color,
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
import { ShaderLab } from "@galacean/engine-shaderlab";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

Logger.enable();
WebGLEngine.create({ canvas: "canvas", shaderLab: new ShaderLab() }).then((engine) => {
  Shader.create(`
    Shader "RenderOpaqueTexture" {
      SubShader "Default" {
        Pass "Forward" {
          Tags { pipelineStage = "Forward" }

          #include "Common/Common.glsl"
          #include "Common/Transform.glsl"
          #include "Common/Fog.glsl"
          #include "Common/Attributes.glsl"
          #include "Skin/Skin.glsl"
          #include "Skin/BlendShape.glsl"

          sampler2D camera_OpaqueTexture;

          struct Varyings {
            vec2 v_uv;
            #if SCENE_FOG_MODE != 0
              vec3 v_positionVS;
            #endif
          };

          Varyings vert(Attributes attr) {
            Varyings v;

            vec4 position = vec4(attr.POSITION, 1.0);

            #ifdef RENDERER_HAS_BLENDSHAPE
              calculateBlendShape(attr, position);
            #endif

            #ifdef RENDERER_HAS_SKIN
              mat4 skinMatrix = getSkinMatrix(attr);
              position = skinMatrix * position;
            #endif

            gl_Position = renderer_MVPMat * position;
            #ifdef RENDERER_HAS_UV
              v.v_uv = attr.TEXCOORD_0;
            #endif

            #if SCENE_FOG_MODE != 0
              v.v_positionVS = (renderer_MVMat * position).xyz;
            #endif

            return v;
          }

          void frag(Varyings v) {
            vec4 baseColor = texture2D(camera_OpaqueTexture, v.v_uv);
            gl_FragColor = baseColor;

            #ifndef MATERIAL_IS_TRANSPARENT
              gl_FragColor.a = 1.0;
            #endif
          }

          VertexShader = vert;
          FragmentShader = frag;
        }
      }
    }
  `);
  engine.canvas.resizeByClientSize(2);
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // camera
  const cameraEntity = rootEntity.createChild("camera_node");
  cameraEntity.transform.position = new Vector3(0, 1, 3);
  const camera = cameraEntity.addComponent(Camera);
  cameraEntity.transform.lookAt(new Vector3(0, 1, 0));
  camera.opaqueTextureEnabled = true;

  const lightNode = rootEntity.createChild("light_node");
  lightNode.addComponent(DirectLight).color = new Color(
    0.31854677812509186,
    0.31854677812509186,
    0.31854677812509186,
    1
  );
  lightNode.transform.lookAt(new Vector3(0, 0, 1));
  lightNode.transform.rotate(new Vector3(0, 90, 0));

  engine.resourceManager
    .load<GLTFResource>("https://gw.alipayobjects.com/os/bmw-prod/5e3c1e4e-496e-45f8-8e05-f89f2bd5e4a4.glb")
    .then((gltfResource) => {
      const { defaultSceneRoot } = gltfResource;
      rootEntity.addChild(defaultSceneRoot);
      const animator = defaultSceneRoot.getComponent(Animator);
      animator.play("agree");

      showOpaquePlane(engine, cameraEntity);

      updateForE2E(engine);

      initScreenshot(engine, camera);
    });
});

function showOpaquePlane(engine: Engine, camera: Entity): void {
  const entity = camera.createChild("Plane");
  entity.transform.setPosition(0, 0, -1);
  entity.transform.rotate(new Vector3(90, 0, 0));
  const renderer = entity.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createPlane(engine, 0.5, 0.5);

  // Create material
  const material = new BaseMaterial(engine, Shader.find("RenderOpaqueTexture"));
  material.isTransparent = true;
  renderer.setMaterial(material);
}
