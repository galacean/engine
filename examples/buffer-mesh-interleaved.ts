/**
 * @title Buffer Mesh Interleaved
 * @category Mesh
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*vikrSYHt6mAAAAAAAAAAAAAADiR2AQ/original
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
} from "@galacean/engine";

// Create engine and get root entity
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
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
  const cubeGeometry = createCustomMesh(engine, 1.0);
  const material = new BlinnPhongMaterial(engine);
  cubeEntity.transform.rotate(0, 60, 0);
  cubeRenderer.mesh = cubeGeometry;
  cubeRenderer.setMaterial(material);

  // Run engine.
  engine.run();

  /**
   * Create cube geometry with custom BufferGeometry.
   * @param engine - Engine
   * @param size - Cube size
   * @returns Cube mesh
   */
  function createCustomMesh(engine: Engine, size: number): Mesh {
    const geometry = new BufferMesh(engine, "CustomCubeGeometry");

    // prettier-ignore
    // Create vertices data.
    const vertices: Float32Array = new Float32Array([
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

    // prettier-ignore
    // Create indices data.
    const indices: Uint16Array = new Uint16Array([
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
    const vertexBuffer = new Buffer(
      engine,
      BufferBindFlag.VertexBuffer,
      vertices,
      BufferUsage.Static
    );
    const indexBuffer = new Buffer(
      engine,
      BufferBindFlag.IndexBuffer,
      indices,
      BufferUsage.Static
    );

    // Bind buffer
    geometry.setVertexBufferBinding(vertexBuffer, 24);
    geometry.setIndexBufferBinding(indexBuffer, IndexFormat.UInt16);

    // Add vertexElement
    geometry.setVertexElements([
      new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0),
      new VertexElement("NORMAL", 12, VertexElementFormat.Vector3, 0),
    ]);

    // Add one sub geometry.
    geometry.addSubMesh(0, indices.length);
    return geometry;
  }
});
