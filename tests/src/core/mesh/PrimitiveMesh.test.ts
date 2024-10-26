import { Camera, GLCapabilityType, PrimitiveMesh } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { Vector3 } from "@galacean/engine-math";
import { expect } from "chai";

describe("PrimitiveMesh", () => {
  let engine: WebGLEngine;

  before(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    engine.canvas.resizeByClientSize();

    const rootEntity = engine.sceneManager.activeScene.createRootEntity("root");
    const cameraEntity = rootEntity.createChild("root");
    cameraEntity.addComponent(Camera);
    cameraEntity.transform.setPosition(0, 0, -10);
    cameraEntity.transform.lookAt(new Vector3());

    engine.run();
  });

  it("createSphere", () => {
    // Test that createSphere works correctly.
    const radius = 1.333;
    const segments = 20.555556;
    const floorSegments = Math.floor(segments);
    const sphereMesh = PrimitiveMesh.createSphere(engine, radius, segments, false);

    const count = floorSegments + 1;
    expect(sphereMesh.vertexCount).equal(count * count);
    expect(sphereMesh.vertexElements.length).equal(4);
    expect(sphereMesh.bounds.min).to.deep.include({ x: -radius, y: -radius, z: -radius });
    expect(sphereMesh.bounds.max).to.deep.include({ x: radius, y: radius, z: radius });
    expect(sphereMesh.getIndices().length).equal(floorSegments * floorSegments * 6);
    expect(sphereMesh.vertexBufferBindings.length).equal(2);
  });

  it("createSubdivisionSurfaceSphere", () => {
    // Test that createSphere works correctly.
    const radius = 2.333;
    const steps = 3.2;
    const sphereMesh = PrimitiveMesh.createSubdivisionSurfaceSphere(engine, radius, steps, false);

    expect(sphereMesh.vertexCount).equal(417);
    expect(sphereMesh.bounds.min).to.deep.include({ x: -radius, y: -radius, z: -radius });
    expect(sphereMesh.bounds.max).to.deep.include({ x: radius, y: radius, z: radius });
    expect(sphereMesh.getIndices().length).equal(2304);
  });

  it("createCuboid", () => {
    // Test that createCuboid works correctly.
    const width = 2.3;
    const height = 3.2;
    const depth = 4.5;
    const cuboidMesh = PrimitiveMesh.createCuboid(engine, width, height, depth, false);

    expect(cuboidMesh.vertexCount).equal(24);
    expect(cuboidMesh.vertexElements.length).equal(4);
    expect(cuboidMesh.bounds.min).to.deep.include({ x: 0.5 * -width, y: 0.5 * -height, z: 0.5 * -depth });
    expect(cuboidMesh.bounds.max).to.deep.include({ x: 0.5 * width, y: 0.5 * height, z: 0.5 * depth });
    expect(cuboidMesh.getIndices().length).equal(36);
    expect(cuboidMesh.vertexBufferBindings.length).equal(2);
  });

  it("createCylinder", () => {
    // Test that createCylinder works correctly.
    const radiusTop = 2;
    const radiusBottom = 3;
    const height = 2;
    const radialSegments = 20.9999;
    const heightSegments = 1.00001;
    const floorRadialSegments = Math.floor(radialSegments);
    const floorHeightSegments = Math.floor(heightSegments);
    const cylinderMesh = PrimitiveMesh.createCylinder(
      engine,
      radiusTop,
      radiusBottom,
      height,
      radialSegments,
      heightSegments,
      false
    );
    const radius = Math.max(radiusTop, radiusBottom);

    expect(cylinderMesh.vertexCount).equal(
      (floorRadialSegments + 1) * (floorHeightSegments + 1) + floorRadialSegments * 2 + 2
    );
    expect(cylinderMesh.vertexElements.length).equal(4);
    expect(cylinderMesh.bounds.min).to.deep.include({ x: -radius, y: 0.5 * -height, z: -radius });
    expect(cylinderMesh.bounds.max).to.deep.include({ x: radius, y: 0.5 * height, z: radius });
    expect(cylinderMesh.getIndices().length).equal(
      floorRadialSegments * floorHeightSegments * 6 + floorRadialSegments * 2 * 3
    );
    expect(cylinderMesh.vertexBufferBindings.length).equal(2);
  });

  it("createTorus", () => {
    // Test that createTorus works correctly.
    const radius = 1;
    const tubeRadius = 0.5;
    const radialSegments = 20.9999;
    const tubularSegments = 40.0532;
    const floorRadialSegments = Math.floor(radialSegments);
    const floorTubularSegments = Math.floor(tubularSegments);
    const arc = 180;
    const torusMesh = PrimitiveMesh.createTorus(
      engine,
      radius,
      tubeRadius,
      radialSegments,
      tubularSegments,
      arc,
      false
    );
    const outerRadius = radius + tubeRadius;

    expect(torusMesh.vertexCount).equal((floorRadialSegments + 1) * (floorTubularSegments + 1));
    expect(torusMesh.vertexElements.length).equal(4);
    expect(torusMesh.bounds.min).to.deep.include({ x: -outerRadius, y: -outerRadius, z: -tubeRadius });
    expect(torusMesh.bounds.max).to.deep.include({ x: outerRadius, y: outerRadius, z: tubeRadius });
    expect(torusMesh.getIndices().length).equal(floorRadialSegments * floorTubularSegments * 6);
    expect(torusMesh.vertexBufferBindings.length).equal(2);
  });

  it("createPlane", () => {
    // Test that createPlane works correctly.
    const width = 2;
    const height = 1.5;
    const hSegments = 10.9999;
    const vSegments = 9.0001;
    const floorHSegments = Math.floor(hSegments);
    const floorVSegments = Math.floor(vSegments);
    const planeMesh = PrimitiveMesh.createPlane(engine, width, height, hSegments, vSegments, false);

    expect(planeMesh.vertexCount).equal((floorHSegments + 1) * (floorVSegments + 1));
    expect(planeMesh.vertexElements.length).equal(4);
    expect(planeMesh.bounds.min).deep.include({ x: -0.5 * width, y: 0, z: -0.5 * height });
    expect(planeMesh.bounds.max).deep.include({ x: 0.5 * width, y: 0, z: 0.5 * height });
    expect(planeMesh.getIndices().length).equal(floorHSegments * floorVSegments * 6);
    expect(planeMesh.vertexBufferBindings.length).equal(2);
  });

  it("createCone", () => {
    // Test that createCone works correctly.
    const radius = 2;
    const height = 3;
    const radialSegments = 20.9999;
    const heightSegments = 1.00001;
    const floorRadialSegments = Math.floor(radialSegments);
    const floorHeightSegments = Math.floor(heightSegments);
    const coneMesh = PrimitiveMesh.createCone(engine, radius, height, radialSegments, heightSegments, false);

    expect(coneMesh.vertexCount).equal((floorRadialSegments + 1) * (floorHeightSegments + 1) + floorRadialSegments + 1);
    expect(coneMesh.vertexElements.length).equal(4);
    expect(coneMesh.bounds.min).to.deep.include({ x: -radius, y: 0.5 * -height, z: -radius });
    expect(coneMesh.bounds.max).to.deep.include({ x: radius, y: 0.5 * height, z: radius });
    expect(coneMesh.getIndices().length).equal(floorRadialSegments * floorHeightSegments * 6 + floorRadialSegments * 3);
    expect(coneMesh.vertexBufferBindings.length).equal(2);
  });

  it("createCapsule", () => {
    const radius = 2;
    const height = 3;
    const radialSegments = 20.9999;
    const heightSegments = 30.0001;
    const floorRadialSegments = Math.floor(radialSegments);
    const floorHeightSegments = Math.floor(heightSegments);
    const capsuleMesh = PrimitiveMesh.createCapsule(engine, radius, height, radialSegments, heightSegments, false);

    expect(capsuleMesh.vertexCount).equal(
      (floorRadialSegments + 1) * (floorHeightSegments + 1) + 2 * Math.pow(floorRadialSegments + 1, 2)
    );
    expect(capsuleMesh.vertexElements.length).equal(4);
    expect(capsuleMesh.bounds.min).to.deep.include({ x: -radius, y: 0.5 * -height - radius, z: -radius });
    expect(capsuleMesh.bounds.max).to.deep.include({ x: radius, y: 0.5 * height + radius, z: radius });
    expect(capsuleMesh.getIndices().length).equal(
      (floorRadialSegments * floorHeightSegments + 2 * floorRadialSegments * floorRadialSegments) * 6
    );
  });

  it("test limit vertex count", function () {
    this.timeout(5000);
    const radius = 1;
    const segments = 256;
    const floorSegments = Math.floor(segments);
    const count = segments + 1;

    if (engine["_hardwareRenderer"].canIUse(GLCapabilityType.elementIndexUint)) {
      const sphereMesh = PrimitiveMesh.createSphere(engine, radius, segments, false);
      expect(sphereMesh.vertexCount).equal(count * count);
      expect(sphereMesh.vertexElements.length).equal(4);
      expect(sphereMesh.bounds.min).to.deep.include({ x: -radius, y: -radius, z: -radius });
      expect(sphereMesh.bounds.max).to.deep.include({ x: radius, y: radius, z: radius });
      expect(sphereMesh.getIndices().length).equal(floorSegments * floorSegments * 6);
      expect(sphereMesh.vertexBufferBindings.length).equal(2);
    } else {
      expect(() => {
        try {
          PrimitiveMesh.createSphere(engine, radius, segments, false);
        } catch (e) {}
      }).throw("The vertex count is out of range.");
    }
  });
});
