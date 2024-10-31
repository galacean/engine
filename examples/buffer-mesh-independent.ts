/**
 * @title Buffer Mesh Independent
 * @category Mesh
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*YnS0RIRZQv0AAAAAAAAAAAAADiR2AQ/original
 */
import {
  BlinnPhongMaterial,
  Buffer,
  BufferBindFlag,
  BufferMesh,
  BufferUsage,
  Camera,
  Engine,
  IndexFormat,
  Mesh,
  MeshRenderer,
  PointLight,
  Vector3,
  VertexElement,
  VertexElementFormat,
  WebGLEngine,
  Script,
} from "@galacean/engine";

/**
 * Script for updating color buffer.
 */
class RandomColorScript extends Script {
  /** Color data. */
  colorData: Float32Array;
  /** Color buffer. */
  colorBuffer: Buffer;

  private _loopCount = 0;

  /**
   * @override
   * The main loop, called frame by frame.
   * @param deltaTime - The deltaTime when the script update.
   */
  onUpdate(deltaTime: number): void {
    if (this._loopCount === 30) {
      const { colorData } = this;
      for (let i = 0; i < 6; i++) {
        const r = Math.random();
        const g = Math.random();
        const b = Math.random();
        const faceOffset = i * 12;
        for (let i = 0; i < 4; i++) {
          const vertexOffset = i * 3;
          colorData[faceOffset + vertexOffset] = r;
          colorData[faceOffset + vertexOffset + 1] = g;
          colorData[faceOffset + vertexOffset + 2] = b;
        }
      }
      this.colorBuffer.setData(colorData);
      this._loopCount = 0;
    }
    this._loopCount++;
  }
}

main();

async function main() {
  // Create engine and get root entity.
  const engine = await WebGLEngine.create({ canvas: "canvas" });
  engine.canvas.resizeByClientSize();

  const rootEntity = engine.sceneManager.activeScene.createRootEntity("Root");

  // Create light.
  const lightEntity = rootEntity.createChild("pointLight");
  const pointLight = lightEntity.addComponent(PointLight);
  pointLight.distance = 10;
  lightEntity.transform.setPosition(2, 5, 5);
  // Create camera.
  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.setPosition(0, 6, 10);
  cameraEntity.transform.lookAt(new Vector3(0, 0, 0));
  cameraEntity.addComponent(Camera);

  // Create custom cube.
  // Use createCustomMesh() to create custom cube mesh.
  const cubeEntity = rootEntity.createChild("Cube");
  const cubeRenderer = cubeEntity.addComponent(MeshRenderer);
  const randomColorScript = cubeEntity.addComponent(RandomColorScript);
  const cubeGeometry = createCustomMesh(engine, 1.0, randomColorScript);
  const material = new BlinnPhongMaterial(engine);
  cubeEntity.transform.rotate(0, 60, 0);
  cubeRenderer.mesh = cubeGeometry;
  cubeRenderer.setMaterial(material);

  // Run engine.
  engine.run();
}

/**
 * Create cube geometry with custom BufferGeometry.
 * @param engine - Engine
 * @param size - Cube size
 * @returns Cube mesh
 */
function createCustomMesh(
  engine: Engine,
  size: number,
  randomColorScript: RandomColorScript
): Mesh {
  const cubeMesh = new BufferMesh(engine, "CustomCubeMesh");

  // Create vertices position and normal data.
  // prettier-ignore
  const positionNormals = new Float32Array([
          // Up
          -size, size, -size, 0, 1, 0, size, size, -size, 0, 1, 0, size, size, size, 0, 1, 0, -size, size, size, 0, 1, 0,
          // Down
          -size, -size, -size, 0, -1, 0, size, -size, -size, 0, -1, 0, size, -size, size, 0, -1, 0, -size, -size, size, 0, -1, 0,
          // Left
          -size, size, -size, -1, 0, 0, -size, size, size, -1, 0, 0, -size, -size, size, -1, 0, 0, -size, -size, -size, -1, 0, 0,
          // Right
          size, size, -size, 1, 0, 0, size, size, size, 1, 0, 0, size, -size, size, 1, 0, 0, size, -size, -size, 1, 0, 0,
          // Front
          -size, size, size, 0, 0, 1, size, size, size, 0, 0, 1, size, -size, size, 0, 0, 1, -size, -size, size, 0, 0, 1,
          // Back
          -size, size, -size, 0, 0, -1, size, size, -size, 0, 0, -1, size, -size, -size, 0, 0, -1, -size, -size, -size, 0, 0, -1]);

  // Create vertices color and init by white.
  const colorData = new Float32Array(3 * 24);
  colorData.fill(1.0);

  // Create indices data.
  // prettier-ignore
  const indices = new Uint16Array([
          // Up
          0, 2, 1, 2, 0, 3,
          // Down
          4, 6, 7, 6, 4, 5,
          // Left
          8, 10, 9, 10, 8, 11,
          // Right
          12, 14, 15, 14, 12, 13,
          // Front
          16, 18, 17, 18, 16, 19,
          // Back
          20, 22, 23, 22, 20, 21]);

  // Create gpu vertex buffer and index buffer.
  const posNorBuffer = new Buffer(
    engine,
    BufferBindFlag.VertexBuffer,
    positionNormals,
    BufferUsage.Static
  );
  const independentColorBuffer = new Buffer(
    engine,
    BufferBindFlag.VertexBuffer,
    colorData,
    BufferUsage.Dynamic
  );
  const indexBuffer = new Buffer(
    engine,
    BufferBindFlag.IndexBuffer,
    indices,
    BufferUsage.Static
  );

  // Bind buffer.
  cubeMesh.setVertexBufferBinding(posNorBuffer, 24, 0);
  cubeMesh.setVertexBufferBinding(independentColorBuffer, 12, 1);
  cubeMesh.setIndexBufferBinding(indexBuffer, IndexFormat.UInt16);

  // Set vertexElements.
  cubeMesh.setVertexElements([
    new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0),
    new VertexElement("NORMAL", 12, VertexElementFormat.Vector3, 0),
    new VertexElement("COLOR_0", 0, VertexElementFormat.Vector3, 1),
  ]);

  // Add one sub geometry.
  cubeMesh.addSubMesh(0, indices.length);

  // Set `vertexColors` and `colorBuffer` to `randomColorScript`.
  randomColorScript.colorData = colorData;
  randomColorScript.colorBuffer = independentColorBuffer;

  return cubeMesh;
}
