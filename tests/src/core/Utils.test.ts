import { Utils } from "@galacean/engine-core";
import { expect } from "chai";

describe.only("Transform test", function () {
  it("is absolute", () => {
    expect(Utils.isAbsoluteUrl("/test.png")).to.false;
    expect(Utils.isAbsoluteUrl("https://www.galacean.com/test.png")).to.true;
  });

  it("resolve base url", () => {
    expect(Utils.resolveAbsoluteUrl("https://www.galacean.com", "test.png")).to.equal(
      "https://www.galacean.com/test.png"
    );

    expect(Utils.resolveAbsoluteUrl("https://www.galacean.com/", "/test.png")).to.equal(
      "https://www.galacean.com/test.png"
    );

    expect(Utils.resolveAbsoluteUrl("https://www.galacean.com", "/test.png")).to.equal(
      "https://www.galacean.com/test.png"
    );

    expect(Utils.resolveAbsoluteUrl("https://www.galacean.com/space/basic.gltf", "texture.png")).to.equal(
      "https://www.galacean.com/space/texture.png"
    );

    expect(Utils.resolveAbsoluteUrl("https://www.galacean.com/space/basic.gltf", "/texture.png")).to.equal(
      "https://www.galacean.com/texture.png"
    );

    const base64Url = "data:application/octet-stream;base64,AAAAAImICD2JiIg9zczMPYmICD6rqio";
    expect(Utils.resolveAbsoluteUrl("https://www.galacean.com", base64Url)).to.equal(base64Url);
  });
});
