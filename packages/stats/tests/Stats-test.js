import { Stats } from "../src/Stats";

describe("Stats", () => {
  it("It worked!", () => {
    let stats = new Stats();
    expect(stats).to.be.an("object");
  });
});
