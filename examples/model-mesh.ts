/**
 * @title Model Mesh
 * @category Mesh
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*-wVwQrYm6b8AAAAAAAAAAAAADiR2AQ/original
 */
import {
  AssetType,
  Camera,
  Color,
  Engine,
  Entity,
  Material,
  MeshRenderer,
  ModelMesh,
  PrimitiveMesh,
  Script,
  Shader,
  Texture2D,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";

main();

async function main() {
  // Create engine
  const engine = await WebGLEngine.create({ canvas: "canvas" });
  engine.canvas.resizeByClientSize();

  // Create root entity
  const rootEntity = engine.sceneManager.activeScene.createRootEntity();

  // Create camera
  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.setPosition(0, 10, 10);
  cameraEntity.transform.lookAt(new Vector3(0, 8, 0));
  const camera = cameraEntity.addComponent(Camera);
  camera.farClipPlane = 2000;
  camera.fieldOfView = 55;

  createPlane(engine, rootEntity);
  engine.run();
}

/**
 * Create a plane as a child of entity.
 */
function createPlane(engine: Engine, entity: Entity): void {
  engine.resourceManager
    .load({
      url: "https://gw.alipayobjects.com/mdn/rms_2e421e/afts/img/A*fRtNTKrsq3YAAAAAAAAAAAAAARQnAQ",
      type: AssetType.Texture2D,
    })
    .then((texture) => {
      const planeEntity = entity.createChild("plane");
      const meshRenderer = planeEntity.addComponent(MeshRenderer);
      const material = new Material(engine, shader);

      // planeEntity.transform.setRotation(-90, 0, 0);
      meshRenderer.mesh = PrimitiveMesh.createPlane(
        engine,
        1245,
        1245,
        100,
        100,
        false
      );
      meshRenderer.setMaterial(material);

      planeEntity.addComponent(PlaneAnimation);

      const { shaderData } = material;
      shaderData.setTexture("material_BaseTexture", texture);
      shaderData.setColor("u_fogColor", new Color(0.25, 0.25, 0.25, 1));
      shaderData.setFloat("u_fogDensity", 0.004);
      shaderData.setColor(
        "u_color",
        new Color(86 / 255, 182 / 255, 194 / 255, 1)
      );
    });
}

/**
 * Plane animation script.
 */
class PlaneAnimation extends Script {
  private _planeMesh: ModelMesh;
  private _initZ: number[];
  private _counter: number = 0;

  /**
   * @override
   * Called when be enabled first time, only once.
   */
  onAwake(): void {
    const renderer = this.entity.getComponent(MeshRenderer);
    console.log('render', renderer)
    const mesh = renderer.mesh;
    const { vertexCount } = mesh;
    const positions = mesh.getPositions();
    const initY = new Array(vertexCount);

    for (var i = 0; i < vertexCount; i++) {
      const position = positions[i];
      position.y += Math.random() * 10 - 10;
      initY[i] = position.y;
    }
    this._initZ = initY;
    this._planeMesh = mesh;
  }

  /**
   * @override
   * The main loop, called frame by frame.
   * @param deltaTime - The deltaTime when the script update.
   */
  onUpdate(deltaTime: number): void {
    const mesh = this._planeMesh;
    let { _counter: counter, _initZ: initZ } = this;
    const positions = mesh.getPositions();
    for (let i = 0, n = positions.length; i < n; i++) {
      const position = positions[i];
      position.y =
        Math.sin(i + counter * 0.00002) * (initZ[i] - initZ[i] * 0.6);
      counter += 0.1;
    }
    mesh.setPositions(positions);
    mesh.uploadData(false);
    this._counter = counter;
  }
}

const shader = Shader.create(
  "test-plane",
  `uniform mat4 renderer_MVPMat;
    attribute vec4 POSITION;
    attribute vec2 TEXCOORD_0;
    
    uniform mat4 renderer_MVMat;
    
    varying vec2 v_uv;
    varying vec3 v_position;
    
    void main() {
      v_uv = TEXCOORD_0;
      v_position = (renderer_MVMat * POSITION).xyz;
      gl_Position = renderer_MVPMat * POSITION;
    }`,

  `
    uniform sampler2D material_BaseTexture;
    uniform vec4 u_color;
    uniform vec4 u_fogColor;
    uniform float u_fogDensity;
    
    varying vec2 v_uv;
    varying vec3 v_position;
    

    vec4 linearToGamma(vec4 linearIn){
      return vec4( pow(linearIn.rgb, vec3(1.0 / 2.2)), linearIn.a);
    }
    
    void main() {
      vec4 color = texture2D(material_BaseTexture, v_uv) * u_color;
      float fogDistance = length(v_position);
      float fogAmount = 1. - exp2(-u_fogDensity * u_fogDensity * fogDistance * fogDistance * 1.442695);
      fogAmount = clamp(fogAmount, 0., 1.);
      gl_FragColor = mix(color, u_fogColor, fogAmount); 

      gl_FragColor = linearToGamma(gl_FragColor);
    }
    `
);
