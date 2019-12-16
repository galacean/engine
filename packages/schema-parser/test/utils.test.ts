import { switchElementsIndex } from "../src/utils";

describe("utils", () => {
  it("test switchElementsIndex", () => {
    const elements = [1, 2, 3, 4, 5];
    switchElementsIndex(elements, 0, 4);
    expect(elements).toEqual([5, 2, 3, 4, 1]);
  });
});
