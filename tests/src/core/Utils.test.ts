import { DisorderedArray, Utils } from "@galacean/engine-core";
import { describe, expect, it } from "vitest";

describe("Utils test", function () {
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

    expect(Utils.resolveAbsoluteUrl("/path/to/dir", "file.html")).to.equal(
      "/path/to/file.html"
    );

    expect(Utils.resolveAbsoluteUrl("/path/to/dir", "../file.html")).to.equal(
      "/path/file.html"
    );

    expect(Utils.resolveAbsoluteUrl("/a/b", "./空 格")).to.equal(
      "/a/空 格"
    );

    expect(Utils.resolveAbsoluteUrl("/a c%/中%20文/test1/test2", "../空 格/测%试.json")).to.equal(
      "/a c%/中%20文/空 格/测%试.json"
    );

    const base64Url = "data:application/octet-stream;base64,AAAAAImICD2JiIg9zczMPYmICD6rqio";
    expect(Utils.resolveAbsoluteUrl("https://www.galacean.com", base64Url)).to.equal(base64Url);
  });

  it("DisorderedArray", () => {
    const arr = new DisorderedArray<{ idx: number; name: string }>();
    arr.add({ idx: 0, name: "J" });
    arr.add({ idx: 1, name: "Q" });
    arr.add({ idx: 2, name: "K" });
    arr.add({ idx: 3, name: "Joker" });
    arr.forEach(
      (item, i) => {
        if (item.idx === 1) {
          arr.forEach(
            (item, i) => {
              if (item.idx == 0) {
                arr.deleteByIndex(i);
              }
            },
            (item, i) => {
              item.idx = i;
            }
          );
          arr.deleteByIndex(1);
        }
      },
      (item, i) => {
        item.idx = i;
      }
    );

    arr.forEach((item, i) => {
      expect(item.idx).to.equal(i);
    });
  });
});
