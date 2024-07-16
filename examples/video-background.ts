/**
 * @title Video Background
 * @category Video
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*8t0SSqZFaXcAAAAAAAAAAAAADiR2AQ/original
 */
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import {
  BackgroundMode,
  Camera,
  CompareFunction,
  CullMode,
  Engine,
  Material,
  PrimitiveMesh,
  Script,
  Shader,
  Texture2D,
  TextureFormat,
  TextureUsage,
  WebGLEngine,
} from "@galacean/engine";

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();
  const cameraEntity = rootEntity.createChild();
  cameraEntity.transform.setPosition(0, 0, 10);
  const camera = cameraEntity.addComponent(Camera);
  camera.fieldOfView = 80;
  const control = cameraEntity.addComponent(OrbitControl);
  control.autoRotate = true;
  control.autoRotateSpeed = 0.1;
  engine.run();

  // video skybox
  Shader.create(
    "video",
    `
attribute vec3 POSITION;
attribute vec2 TEXCOORD_0;
varying vec2 v_uv;

uniform mat4 camera_VPMat;

void main() {
    v_uv = TEXCOORD_0;
    gl_Position = camera_VPMat * vec4( POSITION, 1.0 );
}
  `,
    `
  uniform sampler2D u_texture;
  varying vec2 v_uv;

  void main(){
    gl_FragColor = texture2D(u_texture, vec2(-v_uv.x,v_uv.y));
    
  }
  `
  );
  class VideoMaterial extends Material {
    constructor(engine: Engine) {
      super(engine, Shader.find("video"));

      this.renderState.rasterState.cullMode = CullMode.Off;
      this.renderState.depthState.compareFunction = CompareFunction.LessEqual;
    }

    get texture(): Texture2D {
      return this.shaderData.getTexture("u_texture") as Texture2D;
    }

    set texture(v: Texture2D) {
      this.shaderData.setTexture("u_texture", v);
    }
  }

  class UpdateVideoScript extends Script {
    video: HTMLVideoElement;
    texture: Texture2D;

    onUpdate() {
      this.texture.setImageSource(this.video);
    }
  }

  const dom: HTMLVideoElement = document.createElement("video");
  const width = 3840;
  const height = 1920;
  dom.src =
    "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/file/A*p_f5QYjE_2kAAAAAAAAAAAAAARQnAQ";
  dom.crossOrigin = "anonymous";
  dom.loop = true;
  dom.muted = true;
  dom.play();

  // create video background
  const texture = new Texture2D(
    engine,
    width,
    height,
    TextureFormat.R8G8B8,
    false,
    TextureUsage.Dynamic
  );
  const { background } = scene;
  background.mode = BackgroundMode.Sky;
  const skyMaterial = (background.sky.material = new VideoMaterial(engine));
  background.sky.mesh = PrimitiveMesh.createSphere(engine, 2);
  skyMaterial.texture = texture;

  function updateVideo() {
    texture.setImageSource(dom);
    (dom as any).requestVideoFrameCallback(updateVideo);
  }

  if ("requestVideoFrameCallback" in dom) {
    (dom as any).requestVideoFrameCallback(updateVideo);
  } else {
    const script = rootEntity.addComponent(UpdateVideoScript);
    script.video = dom;
    script.texture = texture;
  }
});
