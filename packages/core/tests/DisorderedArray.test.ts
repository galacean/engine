import { DisorderedArray } from "../src/DisorderedArray";

describe("DisorderedArray", () => {
  it("add", () => {
    const array = new DisorderedArray<string>();
    array.add("test1");
    array.add("test2");
    expect(array.length).toEqual(2);
  });

  it("add&delete", () => {
    const array = new DisorderedArray<string>();
    array.add("test1");
    array.delete("test1");
    array.add("test2");
    expect(array.length).toEqual(1);
  });

  it("delete", () => {
    const array = new DisorderedArray<string>();
    array.add("test1");
    array.add("test2");
    array.delete("test1");
    expect(array.length).toEqual(1);
  });

  it("deleteByIndex", () => {
    const array = new DisorderedArray<string>();
    array.add("test1");
    array.add("test2");
    array.deleteByIndex(0);
    expect(array.length).toEqual(1);
  });

  it("garbageCollection", () => {
    const array = new DisorderedArray<string>();
    array.add("test1");
    array.add("test2");
    array.deleteByIndex(0);
    expect(array._elements.length).toEqual(2);
    array.garbageCollection();
    expect(array._elements.length).toEqual(1);
  });
});
