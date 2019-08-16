import { Material } from '../src/Material';

describe("Material", () => {
  it("It worked!", () => {
    let material = new Material();
    expect(material).to.be.an("object");
  });
});
