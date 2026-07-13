import { ProbeBrickProbeCount, ProbeVolume } from "@galacean/engine-core";
import { Matrix, SphericalHarmonics3, Vector3 } from "@galacean/engine-math";
import { describe, expect, it } from "vitest";

function createProbeSH(value = 1): SphericalHarmonics3 {
  const sh = new SphericalHarmonics3();
  sh.coefficients[0] = value;
  sh.coefficients[1] = value * 2;
  sh.coefficients[2] = value * 3;
  return sh;
}

function createBrick(probeCount = ProbeBrickProbeCount) {
  return {
    position: new Vector3(0, 0, 0),
    subdivisionLevel: 0,
    sphericalHarmonics: Array.from({ length: probeCount }, () => createProbeSH()),
    visibility: Array.from({ length: probeCount }, () => new Float32Array(64).fill(5)),
    validity: new Float32Array(probeCount).fill(1)
  };
}

describe("ProbeVolume", () => {
  it("validates brick size and probe count", () => {
    expect(() => new ProbeVolume(0)).to.throw("minBrickSize");
    expect(() => new ProbeVolume(1, [createBrick(ProbeBrickProbeCount - 1)])).to.throw(
      `${ProbeBrickProbeCount} SH probes`
    );
    expect(() => new ProbeVolume(1, [{ ...createBrick(), subdivisionLevel: -1 }])).to.throw("subdivisionLevel");
    expect(() => new ProbeVolume(1, [{ ...createBrick(), visibility: [] }])).to.throw("visibility probes");
    expect(() => new ProbeVolume(1, [{ ...createBrick(), validity: new Float32Array(1) }])).to.throw("validity values");
    const invalidValidity = new Float32Array(ProbeBrickProbeCount).fill(1);
    invalidValidity[0] = 2;
    expect(() => new ProbeVolume(1, [{ ...createBrick(), validity: invalidValidity }])).to.throw("range [0, 1]");
    expect(() => new ProbeVolume(1, [], new Matrix(0, 0, 0, 0))).to.throw("invertible");
  });

  it("owns a copy of brick data", () => {
    const brick = createBrick();
    const volume = new ProbeVolume(2, [brick]);

    brick.position.x = 10;
    brick.sphericalHarmonics[0].coefficients[0] = 8;
    brick.visibility[0][0] = 9;
    brick.validity[0] = 0;

    expect(volume.bricks[0].position.x).to.equal(0);
    expect(volume.bricks[0].sphericalHarmonics[0].coefficients[0]).to.equal(1);
    expect(volume.bricks[0].visibility![0][0]).to.equal(5);
    expect(volume.bricks[0].validity![0]).to.equal(1);
  });

  it("owns a copy of its local-to-world transform", () => {
    const transform = new Matrix();
    transform.elements[12] = 4;
    const volume = new ProbeVolume(2, [createBrick()], transform);

    transform.elements[12] = 8;

    expect(volume.localToWorldMatrix.elements[12]).to.equal(4);
  });

  it("loads serialized probe bricks", () => {
    const coefficients = Array.from(createProbeSH(2).coefficients);
    const volume = ProbeVolume.fromJSON({
      minBrickSize: 3,
      localToWorldMatrix: [1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 3, 0, 4, 5, 6, 1],
      normalBias: 0.2,
      viewBias: 0.1,
      visibilityBias: 0.3,
      bricks: [
        {
          position: [3, 6, 9],
          subdivisionLevel: 1,
          sphericalHarmonics: Array.from({ length: ProbeBrickProbeCount }, () => coefficients),
          visibility: Array.from({ length: ProbeBrickProbeCount }, () => Array(64).fill(7)),
          validity: Array(ProbeBrickProbeCount).fill(0.75)
        }
      ]
    });

    expect(volume.minBrickSize).to.equal(3);
    expect(volume.normalBias).to.equal(0.2);
    expect(volume.viewBias).to.equal(0.1);
    expect(volume.visibilityBias).to.equal(0.3);
    expect(Array.from(volume.localToWorldMatrix.elements)).to.deep.equal([
      1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 3, 0, 4, 5, 6, 1
    ]);
    expect(volume.bricks[0].position).to.deep.equal(new Vector3(3, 6, 9));
    expect(volume.bricks[0].sphericalHarmonics[0].coefficients[0]).to.equal(2);
    expect(volume.bricks[0].visibility![0][0]).to.equal(7);
    expect(volume.bricks[0].validity![0]).to.equal(0.75);
  });
});
