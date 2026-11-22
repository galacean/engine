import { DisorderedArray, Utils } from "@galacean/engine-core";
import { describe, expect, it } from "vitest";

describe("Utils test", function () {
  it("is absolute", () => {
    expect(Utils.isAbsoluteUrl("/test.png")).to.false;
    expect(Utils.isAbsoluteUrl("https://www.galacean.com/test.png")).to.true;

    const absoluteUrls = [
      "blob:https://www.galacean.com/font",
      "data:font/woff2;base64,AAAA",
      "file:///Assets/Fonts/Hero.woff",
      "galacean-asset:Hero.woff"
    ];
    for (const url of absoluteUrls) {
      expect(Utils.isAbsoluteUrl(url)).to.true;
      expect(Utils.resolveAbsoluteUrl("Assets/Fonts/Hero.font", url)).to.equal(url);
    }
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

    expect(Utils.resolveAbsoluteUrl("/path/to/dir", "file.html")).to.equal("/path/to/file.html");

    expect(Utils.resolveAbsoluteUrl("/path/to/dir", "../file.html")).to.equal("/path/file.html");

    expect(Utils.resolveAbsoluteUrl("/a/b", "./空 格")).to.equal("/a/空 格");

    expect(Utils.resolveAbsoluteUrl("/a c%/中%20文/test1/test2", "../空 格/测%试.json")).to.equal(
      "/a c%/中%20文/空 格/测%试.json"
    );

    expect(Utils.resolveAbsoluteUrl("SpriteAtlas/Art/UI/auto-atlas.atlas", "./auto-atlas_image_0.tex")).to.equal(
      "SpriteAtlas/Art/UI/auto-atlas_image_0.tex"
    );

    expect(Utils.resolveAbsoluteUrl("SpriteAtlas/Art/UI/auto-atlas.atlas", "/Shared/page.tex")).to.equal(
      "/Shared/page.tex"
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

  it("DisorderedArray forEach restores loop state and compacts deletions when callback throws", () => {
    const arr = new DisorderedArray<{ idx: number; name: string }>();
    arr.add({ idx: 0, name: "a" });
    arr.add({ idx: 1, name: "b" });
    arr.add({ idx: 2, name: "c" });

    expect(() => {
      arr.forEach(
        (_item, i) => {
          if (i === 0) {
            arr.deleteByIndex(i);
            throw new Error("boom");
          }
        },
        (item, i) => {
          item.idx = i;
        }
      );
    }).toThrow("boom");

    expect(arr.isLopping).to.equal(false);
    expect(arr.length).to.equal(2);
    arr.forEach((item, i) => {
      expect(item.idx).to.equal(i);
    });

    arr.deleteByIndex(0);
    expect(arr.length).to.equal(1);
  });

  it("DisorderedArray forEachAndClean preserves unvisited and newly added items when callback throws", () => {
    const arr = new DisorderedArray<{ idx: number; name: string }>();
    const a = { idx: 0, name: "a" };
    const b = { idx: 1, name: "b" };
    const c = { idx: 2, name: "c" };
    const d = { idx: 3, name: "d" };
    arr.add(a);
    arr.add(b);
    arr.add(c);

    expect(() => {
      arr.forEachAndClean(
        (item) => {
          if (item === a) {
            arr.add(d);
            throw new Error("boom");
          }
        },
        (item, i) => {
          item.idx = i;
        }
      );
    }).toThrow("boom");

    expect(arr.isLopping).to.equal(false);
    expect(arr.length).to.equal(3);
    expect([arr.get(0), arr.get(1), arr.get(2)]).to.deep.equal([
      { idx: 0, name: "b" },
      { idx: 1, name: "c" },
      { idx: 2, name: "d" }
    ]);
    expect(arr._elements[3]).to.equal(null);
  });

  it("DisorderedArray forEachAndClean clears vacated backing slots after compaction", () => {
    const arr = new DisorderedArray<{ name: string }>();
    const a = { name: "a" };
    const b = { name: "b" };
    const c = { name: "c" };
    const d = { name: "d" };
    arr.add(a);
    arr.add(b);
    arr.add(c);

    arr.forEachAndClean((item) => {
      if (item === a) {
        arr.add(d);
      }
    });

    expect(arr.length).to.equal(1);
    expect(arr.get(0)).to.equal(d);
    expect(arr._elements[1]).to.equal(null);
    expect(arr._elements[2]).to.equal(null);
    expect(arr._elements[3]).to.equal(null);

    const e = { name: "e" };
    const f = { name: "f" };
    arr.add(e);
    arr.add(f);
    arr.forEachAndClean(() => {});

    expect(arr.length).to.equal(0);
    expect(arr._elements[0]).to.equal(null);
    expect(arr._elements[1]).to.equal(null);
  });
});
