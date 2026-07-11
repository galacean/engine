import { ProbeBrickProbeCount, ProbeVolume } from "@galacean/engine-core";
import { SphericalHarmonics3, Vector3 } from "@galacean/engine-math";
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
    sphericalHarmonics: Array.from({ length: probeCount }, () => createProbeSH())
  };
}

describe("ProbeVolume", () => {
  it("validates brick size and probe count", () => {
    expect(() => new ProbeVolume(0)).to.throw("minBrickSize");
    expect(() => new ProbeVolume(1, [createBrick(ProbeBrickProbeCount - 1)])).to.throw(
      `${ProbeBrickProbeCount} SH probes`
    );
    expect(() => new ProbeVolume(1, [{ ...createBrick(), subdivisionLevel: -1 }])).to.throw("subdivisionLevel");
  });

  it("owns a copy of brick data", () => {
    const brick = createBrick();
    const volume = new ProbeVolume(2, [brick]);

    brick.position.x = 10;
    brick.sphericalHarmonics[0].coefficients[0] = 8;

    expect(volume.bricks[0].position.x).to.equal(0);
    expect(volume.bricks[0].sphericalHarmonics[0].coefficients[0]).to.equal(1);
  });

  it("loads serialized adaptive bricks", () => {
    const coefficients = Array.from(createProbeSH(2).coefficients);
    const volume = ProbeVolume.fromJSON({
      minBrickSize: 3,
      normalBias: 0.2,
      viewBias: 0.1,
      bricks: [
        {
          position: [3, 6, 9],
          subdivisionLevel: 1,
          sphericalHarmonics: Array.from({ length: ProbeBrickProbeCount }, () => coefficients)
        }
      ]
    });

    expect(volume.minBrickSize).to.equal(3);
    expect(volume.normalBias).to.equal(0.2);
    expect(volume.viewBias).to.equal(0.1);
    expect(volume.bricks[0].position).to.deep.equal(new Vector3(3, 6, 9));
    expect(volume.bricks[0].sphericalHarmonics[0].coefficients[0]).to.equal(2);
  });
});
