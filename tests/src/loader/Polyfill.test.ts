import { expect } from "chai";

describe("Polyfill", () => {
  it("String.prototype.matchAll", async () => {
    const regex = /#include\s+"([./][^\\"]+)"/gm;
    const content = `#include "./f1.glsl"
    #include "./f2.glsl"
    xxx
    #include "/f3.glsl"
    ooo`;
    const originMatchResult = content.matchAll(regex);
    const originResultArray = Array.from(originMatchResult);

    String.prototype.matchAll = null;
    import("@galacean/engine-loader").then(() => {
      const regexTest = /noGlobal/;
      const contentTest = "test";
      expect(
        String.prototype.matchAll.bind(contentTest, regexTest),
        "Should throw error caused by absence of g flag"
      ).to.throw(TypeError);

      const matchResult = content.matchAll(regex);
      debugger;
      expect(!!matchResult.next, "result should be iterable").to.be.true;
      const resultArray = Array.from(matchResult);
      expect(resultArray.length).to.equal(3).to.equal(originResultArray.length);

      expect(resultArray[0][0]).to.equal(originResultArray[0][0]).to.equal('#include "./f1.glsl"');
      expect(resultArray[0][1]).to.equal(originResultArray[0][1]).to.equal("./f1.glsl");

      expect(resultArray[1][0]).to.equal(originResultArray[1][0]).to.equal('#include "./f2.glsl"');
      expect(resultArray[1][1]).to.equal(originResultArray[1][1]).to.equal("./f2.glsl");

      expect(resultArray[2][0]).to.equal(originResultArray[2][0]).to.equal('#include "/f3.glsl"');
      expect(resultArray[2][1]).to.equal(originResultArray[2][1]).to.equal("/f3.glsl");
    });
  });
});
