/**
 * @title Custom mesh
 * @category Mesh
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*hxtTRZxXFOAAAAAAAAAAAAAADiR2AQ/original
 */
import {
  BoundingBox,
  Buffer,
  BufferBindFlag,
  Camera,
  Entity,
  MeshRenderer,
  MeshTopology,
  ModelMesh,
  RenderFace,
  SubMesh,
  UnlitMaterial,
  VertexAttribute,
  VertexBufferBinding,
  VertexElement,
  VertexElementFormat,
  WebGLEngine,
} from "@galacean/engine";
import * as dat from "dat.gui";
const gui = new dat.GUI();
const debugInfo = {
  shape: "Circle",
  Circle: { radius: 100 },
  Ellipse: { halfWidth: 100, halfHeight: 50 },
  RoundedRect: { width: 200, height: 100, radius: 20 },
};

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  // Create root entity
  const root: Entity | null = engine.sceneManager.scenes[0].createRootEntity();

  // Create camera
  const cameraEntity = root.createChild("camera");
  cameraEntity.transform.setPosition(0, 0, 600);
  const camera = cameraEntity.addComponent(Camera);
  camera.isOrthographic = true;
  camera.orthographicSize = engine.canvas.height / 2;
  camera.farClipPlane = 2000;

  const entity = root.createChild("renderer");
  const renderer = entity.addComponent(MeshRenderer);
  const modelMesh = resetModelMesh("Circle");
  renderer.mesh = modelMesh;
  const material = new UnlitMaterial(engine);
  material.renderFace = RenderFace.Double;
  renderer.setMaterial(material);

  engine.run();

  function resetModelMesh(shape: string): ModelMesh {
    const shapeInfo = debugInfo[shape];
    const modelMesh = new ModelMesh(engine);
    const points = [];
    switch (shape) {
      case "Circle":
        buildCircle(shapeInfo.radius, points);
        break;
      case "Ellipse":
        buildEllipse(shapeInfo.halfWidth, shapeInfo.halfHeight, points);
        break;
      case "RoundedRect":
        buildRoundedRect(
          shapeInfo.width,
          shapeInfo.height,
          shapeInfo.radius,
          points
        );
        break;
      default:
        break;
    }
    const vertexData = new Float32Array((points.length / 2 + 1) * 3);
    const indicesData = new Uint16Array((points.length / 2) * 3);
    triangulate(points, vertexData, 3, 0, indicesData, 0, modelMesh.bounds);
    modelMesh.setVertexElements([
      new VertexElement(
        VertexAttribute.Position,
        0,
        VertexElementFormat.Vector3,
        0
      ),
    ]);
    modelMesh.setVertexBufferBinding(
      new VertexBufferBinding(
        new Buffer(engine, BufferBindFlag.VertexBuffer, vertexData),
        12
      )
    );
    modelMesh.setIndices(indicesData);
    modelMesh.addSubMesh(
      new SubMesh(0, indicesData.length, MeshTopology.Triangles)
    );
    modelMesh.uploadData(true);
    return modelMesh;
  }

  const initDatGUI = (shape: string) => {
    let curFolder;
    gui
      .add(debugInfo, "shape", ["Circle", "Ellipse", "RoundedRect"])
      .onChange((v) => {
        gui.removeFolder(curFolder);
        curFolder = addFolder(v);
        renderer.mesh = resetModelMesh(v);
      });

    curFolder = addFolder(shape);
    function addFolder(shape: string) {
      let folder;
      switch (shape) {
        case "Circle":
          folder = gui.addFolder("Circle");
          folder.add(debugInfo.Circle, "radius", 1, 200).onChange((v) => {
            renderer.mesh = resetModelMesh("Circle");
          });
          break;
        case "Ellipse":
          folder = gui.addFolder("Ellipse");
          folder.add(debugInfo.Ellipse, "halfWidth", 1, 200).onChange((v) => {
            renderer.mesh = resetModelMesh("Ellipse");
          });
          folder.add(debugInfo.Ellipse, "halfHeight", 1, 200).onChange((v) => {
            renderer.mesh = resetModelMesh("Ellipse");
          });
          break;
        case "RoundedRect":
          folder = gui.addFolder("RoundedRect");
          folder.add(debugInfo.RoundedRect, "width", 1, 200).onChange((v) => {
            renderer.mesh = resetModelMesh("RoundedRect");
          });
          folder.add(debugInfo.RoundedRect, "height", 1, 200).onChange((v) => {
            renderer.mesh = resetModelMesh("RoundedRect");
          });
          folder.add(debugInfo.RoundedRect, "radius", 1, 50).onChange((v) => {
            renderer.mesh = resetModelMesh("RoundedRect");
          });
          break;
      }
      folder.open();
      return folder;
    }
  };
  initDatGUI("Circle");
});

function buildCircle(radius: number, pointers: number[]): number[] {
  const x = 0;
  const y = 0;
  const rx = radius;
  const ry = radius;
  const dx = 0;
  const dy = 0;
  build(x, y, rx, ry, dx, dy, pointers);
  return pointers;
}

function buildEllipse(
  halfWidth: number,
  halfHeight: number,
  pointers: number[]
): number[] {
  const x = 0;
  const y = 0;
  const rx = halfWidth;
  const ry = halfHeight;
  const dx = 0;
  const dy = 0;
  build(x, y, rx, ry, dx, dy, pointers);
  return pointers;
}

function buildRoundedRect(
  width: number,
  height: number,
  radius: number,
  pointers: number[]
): number[] {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const x = 0;
  const y = 0;
  const temp = Math.max(0, Math.min(radius, Math.min(halfWidth, halfHeight)));
  const rx = temp;
  const ry = temp;
  const dx = halfWidth - temp;
  const dy = halfHeight - temp;
  build(x, y, rx, ry, dx, dy, pointers);
  return pointers;
}

function build(
  x: number,
  y: number,
  rx: number,
  ry: number,
  dx: number,
  dy: number,
  points: number[]
) {
  if (!(rx >= 0 && ry >= 0 && dx >= 0 && dy >= 0)) {
    return points;
  }
  // Choose a number of segments such that the maximum absolute deviation from the circle is approximately 0.029
  const n = Math.ceil(2.3 * Math.sqrt(rx + ry));
  const m = n * 8 + (dx ? 4 : 0) + (dy ? 4 : 0);
  if (m === 0) {
    return points;
  }

  if (n === 0) {
    points[0] = points[6] = x + dx;
    points[1] = points[3] = y + dy;
    points[2] = points[4] = x - dx;
    points[5] = points[7] = y - dy;

    return points;
  }

  let j1 = 0;
  let j2 = n * 4 + (dx ? 2 : 0) + 2;
  let j3 = j2;
  let j4 = m;

  let x0 = dx + rx;
  let y0 = dy;
  let x1 = x + x0;
  let x2 = x - x0;
  let y1 = y + y0;

  points[j1++] = x1;
  points[j1++] = y1;
  points[--j2] = y1;
  points[--j2] = x2;

  if (dy) {
    const y2 = y - y0;

    points[j3++] = x2;
    points[j3++] = y2;
    points[--j4] = y2;
    points[--j4] = x1;
  }

  for (let i = 1; i < n; i++) {
    const a = (Math.PI / 2) * (i / n);
    const x0 = dx + Math.cos(a) * rx;
    const y0 = dy + Math.sin(a) * ry;
    const x1 = x + x0;
    const x2 = x - x0;
    const y1 = y + y0;
    const y2 = y - y0;

    points[j1++] = x1;
    points[j1++] = y1;
    points[--j2] = y1;
    points[--j2] = x2;
    points[j3++] = x2;
    points[j3++] = y2;
    points[--j4] = y2;
    points[--j4] = x1;
  }

  x0 = dx;
  y0 = dy + ry;
  x1 = x + x0;
  x2 = x - x0;
  y1 = y + y0;
  const y2 = y - y0;

  points[j1++] = x1;
  points[j1++] = y1;
  points[--j4] = y2;
  points[--j4] = x1;

  if (dx) {
    points[j1++] = x2;
    points[j1++] = y1;
    points[--j4] = y2;
    points[--j4] = x2;
  }

  return points;
}

function triangulate(
  points: number[],
  vertices: Float32Array,
  verticesStride: number,
  verticesOffset: number,
  indices: Uint16Array,
  indicesOffset: number,
  bounds: BoundingBox
) {
  if (points.length === 0) {
    return;
  }

  // Compute center (average of all points)
  let centerX = 0;
  let centerY = 0;
  let minX: number, minY: number, minZ: number;
  let maxX: number, maxY: number, maxZ: number;

  for (let i = 0; i < points.length; i += 2) {
    centerX += points[i];
    centerY += points[i + 1];
  }
  centerX /= points.length / 2;
  centerY /= points.length / 2;

  // Set center vertex
  let count = verticesOffset;
  vertices[count * verticesStride] = minX = maxX = centerX;
  vertices[count * verticesStride + 1] = minY = maxY = centerY;
  vertices[count * verticesStride + 2] = minZ = maxY = 0;
  const centerIndex = count++;

  // Set edge vertices and indices
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i];
    const y = points[i + 1];
    const z = 0;
    vertices[count * verticesStride] = x;
    vertices[count * verticesStride + 1] = y;
    vertices[count * verticesStride + 2] = z;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    if (i > 0) {
      // Skip first point for indices
      indices[indicesOffset++] = count;
      indices[indicesOffset++] = centerIndex;
      indices[indicesOffset++] = count - 1;
    }
    count++;
  }

  // Connect last point to the first edge point
  indices[indicesOffset++] = centerIndex + 1;
  indices[indicesOffset++] = centerIndex;
  indices[indicesOffset++] = count - 1;
}
