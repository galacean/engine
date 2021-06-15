import { GLTFUtil } from "../../src/gltf/GLTFUtil";
describe("utils test", () => {
  it("test base64", () => {
    const base64 = "data:image/png;base64,iVBORw0";
    expect(GLTFUtil.parseRelativeUrl("any", base64)).toEqual(base64);
  });

  it("test http and https", () => {
    const http = "http://123.com";
    const https = "https://123.com";
    expect(GLTFUtil.parseRelativeUrl("any", http)).toEqual(http);
    expect(GLTFUtil.parseRelativeUrl("any", https)).toEqual(https);
  });

  it("test relative", () => {
    const gltf = "/static/model/DamangedHelmet/DamagedHelmet.gltf";
    const bin = "DamagedHelmet.bin";
    expect(GLTFUtil.parseRelativeUrl(gltf, bin)).toEqual("/static/model/DamangedHelmet/DamagedHelmet.bin");
  });
});
