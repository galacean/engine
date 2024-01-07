describe("glTF", () => {
  it("meshopt", () => {
    cy.screenshotWithThreshold("GLTF", "gltf-meshopt", 0.3);
  });
});
