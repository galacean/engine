import { Mesh } from '../src/Mesh';

describe("Mesh", () => {
  it("It worked!", () => {
    let mesh = new Mesh();
    expect(mesh).to.be.an("object");
  });
});
