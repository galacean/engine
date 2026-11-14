import { Camera, GLCapabilityType, PrimitiveMesh } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine";
import { Vector2, Vector3 } from "@galacean/engine-math";
import { describe, beforeAll, expect, it } from "vitest";

describe("PrimitiveMesh", () => {
  let engine: WebGLEngine;

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });

    const rootEntity = engine.sceneManager.activeScene.createRootEntity("root");
    const cameraEntity = rootEntity.createChild("root");
    cameraEntity.addComponent(Camera);
    cameraEntity.transform.setPosition(0, 0, -10);
    cameraEntity.transform.lookAt(new Vector3());

    engine.run();
  });

  it("createSphere", () => {
    const radius = 2.333;
    const subdivisionLevel = 3.2;
    const sphereMesh = PrimitiveMesh.createSphere(engine, radius, { keepCPUData: true, subdivisionLevel });

    expect(sphereMesh.vertexCount).equal(417);
    expect(sphereMesh.vertexElements.length).equal(4);
    expect(sphereMesh.bounds.min).to.deep.include({ x: -radius, y: -radius, z: -radius });
    expect(sphereMesh.bounds.max).to.deep.include({ x: radius, y: radius, z: radius });
    expect(sphereMesh.getIndices().length).equal(2304);
    expect(sphereMesh.vertexBufferBindings.length).equal(2);
  });

  it("createCuboid", () => {
    // Test that createCuboid works correctly.
    const width = 2.3;
    const height = 3.2;
    const depth = 4.5;
    const cuboidMesh = PrimitiveMesh.createCuboid(engine, width, height, depth, {
      keepCPUData: true,
      widthSegments: 1,
      heightSegments: 1,
      depthSegments: 1
    });

    expect(cuboidMesh.vertexCount).equal(24);
    expect(cuboidMesh.vertexElements.length).equal(4);
    expect(cuboidMesh.bounds.min).to.deep.include({ x: 0.5 * -width, y: 0.5 * -height, z: 0.5 * -depth });
    expect(cuboidMesh.bounds.max).to.deep.include({ x: 0.5 * width, y: 0.5 * height, z: 0.5 * depth });
    expect(cuboidMesh.getIndices().length).equal(36);
    expect(cuboidMesh.vertexBufferBindings.length).equal(2);
  });

  it("createTruncatedCone", () => {
    // Test that createTruncatedCone works correctly.
    const radiusTop = 2;
    const radiusBottom = 3;
    const height = 2;
    const radialSegments = 20.9999;
    const heightSegments = 1.00001;
    const floorRadialSegments = Math.floor(radialSegments);
    const floorHeightSegments = Math.floor(heightSegments);
    const truncatedConeMesh = PrimitiveMesh.createTruncatedCone(engine, radiusTop, radiusBottom, height, {
      keepCPUData: true,
      radialSegments,
      heightSegments
    });
    const radius = Math.max(radiusTop, radiusBottom);

    expect(truncatedConeMesh.vertexCount).equal(
      (floorRadialSegments + 1) * (floorHeightSegments + 1) + floorRadialSegments * 2 + 2
    );
    expect(truncatedConeMesh.vertexElements.length).equal(4);
    expect(truncatedConeMesh.bounds.min).to.deep.include({ x: -radius, y: 0.5 * -height, z: -radius });
    expect(truncatedConeMesh.bounds.max).to.deep.include({ x: radius, y: 0.5 * height, z: radius });
    expect(truncatedConeMesh.getIndices().length).equal(
      floorRadialSegments * floorHeightSegments * 6 + floorRadialSegments * 2 * 3
    );
    expect(truncatedConeMesh.vertexBufferBindings.length).equal(2);
  });

  it("createTorus", () => {
    // Test that createTorus works correctly.
    const radius = 1;
    const tubeRadius = 0.5;
    const radialSegments = 20.9999;
    const ringSegments = 40.0532;
    const floorRadialSegments = Math.floor(radialSegments);
    const floorRingSegments = Math.floor(ringSegments);
    const arc = 180;
    const torusMesh = PrimitiveMesh.createTorus(engine, radius, tubeRadius, {
      keepCPUData: true,
      ringAngleRange: new Vector2(0, 0 + arc),
      ringSegments,
      radialSegments
    });
    const outerRadius = radius + tubeRadius;

    expect(torusMesh.vertexCount).equal((floorRadialSegments + 1) * (floorRingSegments + 1));
    expect(torusMesh.vertexElements.length).equal(4);
    expect(torusMesh.bounds.min).to.deep.include({ x: -outerRadius, y: -outerRadius, z: -tubeRadius });
    expect(torusMesh.bounds.max).to.deep.include({ x: outerRadius, y: outerRadius, z: tubeRadius });
    expect(torusMesh.getIndices().length).equal(floorRadialSegments * floorRingSegments * 6);
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
    const planeMesh = PrimitiveMesh.createPlane(engine, width, height, {
      keepCPUData: true,
      widthSegments: hSegments,
      depthSegments: vSegments
    });

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
    const coneMesh = PrimitiveMesh.createCone(engine, radius, height, {
      keepCPUData: true,
      radialSegments,
      heightSegments
    });

    expect(coneMesh.vertexCount).equal((floorRadialSegments + 1) * (floorHeightSegments + 1) + floorRadialSegments + 1);
    expect(coneMesh.vertexElements.length).equal(4);
    expect(coneMesh.bounds.min).to.deep.include({ x: -radius, y: 0.5 * -height, z: -radius });
    expect(coneMesh.bounds.max).to.deep.include({ x: radius, y: 0.5 * height, z: radius });
    expect(coneMesh.getIndices().length).equal(floorRadialSegments * floorHeightSegments * 6);
    expect(coneMesh.vertexBufferBindings.length).equal(2);
  });

  it("createCapsule", () => {
    const radius = 2;
    const height = 3;
    const radialSegments = 20.9999;
    const heightSegments = 30.0001;
    const floorRadialSegments = Math.floor(radialSegments);
    const floorHeightSegments = Math.floor(heightSegments);
    const capsuleMesh = PrimitiveMesh.createCapsule(engine, radius, height, {
      keepCPUData: true,
      radialSegments,
      capSegments: radialSegments,
      heightSegments
    });

    expect(capsuleMesh.vertexCount).equal(
      (floorRadialSegments + 1) * (floorHeightSegments + 2 * floorRadialSegments + 1)
    );
    expect(capsuleMesh.vertexElements.length).equal(4);
    expect(capsuleMesh.bounds.min).to.deep.include({ x: -radius, y: 0.5 * -height - radius, z: -radius });
    expect(capsuleMesh.bounds.max).to.deep.include({ x: radius, y: 0.5 * height + radius, z: radius });
    expect(capsuleMesh.getIndices().length).equal(
      floorRadialSegments * (floorHeightSegments + 2 * floorRadialSegments - 1) * 6
    );
  });

  it("test limit vertex count", function () {
    const radius = 1;
    const segments = 256;
    const count = segments + 1;

    if (engine["_hardwareRenderer"].canIUse(GLCapabilityType.elementIndexUint)) {
      const mesh = PrimitiveMesh.createPlane(engine, radius * 2, radius * 2, {
        keepCPUData: true,
        widthSegments: segments,
        depthSegments: segments
      });
      expect(mesh.vertexCount).equal(count * count);
      expect(mesh.vertexElements.length).equal(4);
      expect(mesh.bounds.min).to.deep.include({ x: -radius, y: 0, z: -radius });
      expect(mesh.bounds.max).to.deep.include({ x: radius, y: 0, z: radius });
      expect(mesh.getIndices().length).equal(segments * segments * 6);
      expect(mesh.vertexBufferBindings.length).equal(2);
    } else {
      expect(() =>
        PrimitiveMesh.createPlane(engine, radius * 2, radius * 2, {
          keepCPUData: true,
          widthSegments: segments,
          depthSegments: segments
        })
      ).throw("The vertex count is out of range.");
    }
  });
});
