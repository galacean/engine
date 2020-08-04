import { parseRelativeUrl } from "../../src/gltf/Util";
describe("utils test", () => {
  it("test base64", () => {
    const base64 = "data:image/png;base64,iVBORw0";
    expect(parseRelativeUrl("any", base64)).toEqual(base64);
  });

  it("test http and https", () => {
    const http = "http://123.com";
    const https = "https://123.com";
    expect(parseRelativeUrl("any", http)).toEqual(http);
    expect(parseRelativeUrl("any", https)).toEqual(https);
  });

  it("test relative", () => {
    const gltf = "/static/model/DamangedHelmet/DamagedHelmet.gltf";
    const bin = "DamagedHelmet.bin";
    expect(parseRelativeUrl(gltf, bin)).toEqual("/static/model/DamangedHelmet/DamagedHelmet.bin");
  });
});
