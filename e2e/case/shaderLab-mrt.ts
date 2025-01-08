/**
 * @title ShaderLab MRT
 * @category Material
 */

import { Camera, Color, Logger, Material, MeshRenderer, PrimitiveMesh, Shader, WebGLEngine } from "@galacean/engine";
import { ShaderLab } from "@galacean/engine-shaderlab";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

const shaderLab = new ShaderLab();

const shaderSource = `Shader "/custom.gs" {
          SubShader "Default" {
            UsePass "pbr/Default/ShadowCaster"

            Pass "Pass0" {
              struct Attributes {
                vec3 POSITION;
                vec2 TEXCOORD_0;
                vec4 JOINTS_0;
  	            vec4 WEIGHTS_0;
              };
            
              struct Varyings {
                vec2 uv;
              };

              mat4 renderer_MVPMat;

              vec4 material_BaseColor;
            
            
              VertexShader = vert;
              FragmentShader = frag;
            
              Varyings vert(Attributes attr) {
                Varyings v;

                vec4 position = vec4(attr.POSITION, 1.0);

                // Skin
                #ifdef RENDERER_HAS_SKIN
                  mat4 skinMatrix = getSkinMatrix(attr);
                  position = skinMatrix * position;
                #endif

                gl_Position = renderer_MVPMat * position;
                v.uv = attr.TEXCOORD_0;

                return v;
              }

              struct mrt {
                layout(location = 0) vec4 fragColor0;
                layout(location = 1) vec4 fragColor1;
              };
            
              mrt frag(Varyings v) {
                mrt o;

                vec4 baseColor = material_BaseColor;

                #ifdef MATERIAL_HAS_BASETEXTURE
                    vec4 textureColor = texture2D(material_BaseTexture, v.uv);
                    #ifndef ENGINE_IS_COLORSPACE_GAMMA
                        textureColor = gammaToLinear(textureColor);
                    #endif
                    baseColor *= textureColor;
                #endif
            
                #ifdef MATERIAL_IS_ALPHA_CUTOFF
                    if( baseColor.a < material_AlphaCutoff ) {
                        discard;
                    }
                #endif
                
                o.fragColor0 = baseColor;
                o.fragColor1 = baseColor;

                return o;
              }
          }
        }
      }`;

Logger.enable();
WebGLEngine.create({ canvas: "canvas", shaderLab }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const shader = Shader.create(shaderSource);
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // camera
  const cameraEntity = rootEntity.createChild("cameraNode");
  cameraEntity.transform.setPosition(0, 0, 5);
  const camera = cameraEntity.addComponent(Camera);

  // sphere
  {
    const sphere = rootEntity.createChild("sphere");
    sphere.transform.position.x = -1;
    const renderer = sphere.addComponent(MeshRenderer);
    renderer.mesh = PrimitiveMesh.createSphere(engine);
    const material = new Material(engine, shader);
    material.shaderData.setColor("material_BaseColor", new Color(1, 0, 0, 0.2));
    renderer.setMaterial(material);
  }

  updateForE2E(engine);

  initScreenshot(engine, camera);
});
