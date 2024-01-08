import { Utils } from "@galacean/engine-core";

describe("Transform test", function () {
  it("is absolute", () => {
    expect(Utils.isAbsoluteUrl("/test.png")).to.false;
    expect(Utils.isAbsoluteUrl("https://www.galacean.com/test.png")).to.true;
  });

  it("resolve base url", () => {
    expect(Utils.resolveAbsoluteUrl("https://www.galacean.com", "test.png")).to.equal(
      "https://www.galacean.com/test.png"
    );
  });
});
