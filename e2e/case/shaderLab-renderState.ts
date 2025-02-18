/**
 * @title ShaderLab RenderState
 * @category Material
 */

import {
  BlendFactor,
  Camera,
  Color,
  CullMode,
  Logger,
  Material,
  MeshRenderer,
  PrimitiveMesh,
  RenderQueueType,
  Shader,
  WebGLEngine
} from "@galacean/engine";
import { ShaderLab } from "@galacean/engine-shaderlab";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

const shaderLab = new ShaderLab();

const shaderSource = `Shader "Test RenderState" {
  SubShader "Default" {
    Pass "0" {
	DepthState {
      WriteEnabled = depthWriteEnabled;
    }
    
	BlendState {
      Enabled = blendEnabled;
      SourceColorBlendFactor = sourceColorBlendFactor;
      DestinationColorBlendFactor = destinationColorBlendFactor;
      SourceAlphaBlendFactor = sourceAlphaBlendFactor;
      DestinationAlphaBlendFactor = destinationAlphaBlendFactor;
    }
    
	RasterState{
      CullMode = rasterStateCullMode;
    }
    // RenderQueueType = renderQueueType;
	RenderQueueType = Transparent;
      
	mat4 renderer_MVPMat;
    vec4 u_color;

    struct a2v {
      vec4 POSITION;
    };

    struct v2f {
		vec4 test;
    };

    VertexShader = vert;
    FragmentShader = frag;

    v2f vert(a2v v) {
      v2f o;

      gl_Position = renderer_MVPMat * v.POSITION;
      return o;
    }

    void frag(v2f i) {
      gl_FragColor = u_color;
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
    material.shaderData.setColor("u_color", new Color(1, 0, 0, 0.2));
    renderer.setMaterial(material);
  }

  // Cuboid
  {
    const cuboid = rootEntity.createChild("sphere");
    cuboid.transform.position.x = 1;
    const renderer = cuboid.addComponent(MeshRenderer);
    renderer.mesh = PrimitiveMesh.createCuboid(engine);
    const material = new Material(engine, shader);
    material.shaderData.setColor("u_color", new Color(1, 0, 0, 0.2));
    renderer.setMaterial(material);

    const shaderData = material.shaderData;
    shaderData.setInt("depthWriteEnabled", 0);
    shaderData.setInt("blendEnabled", 1);
    shaderData.setInt("renderQueueType", RenderQueueType.Transparent);
    shaderData.enableMacro("MATERIAL_IS_TRANSPARENT");
    shaderData.setInt("sourceColorBlendFactor", BlendFactor.SourceAlpha);
    shaderData.setInt("destinationColorBlendFactor", BlendFactor.OneMinusSourceAlpha);
    shaderData.setInt("sourceAlphaBlendFactor", BlendFactor.One);
    shaderData.setInt("destinationAlphaBlendFactor", BlendFactor.OneMinusSourceAlpha);
    shaderData.setInt("rasterStateCullMode", CullMode.Off);
  }

  updateForE2E(engine);

  initScreenshot(engine, camera);
});
