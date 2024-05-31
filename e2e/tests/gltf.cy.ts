describe("Primitive", () => {
  it("gltf blendshape", () => {
    cy.screenshotWithThreshold("GLTF", "gltf-blendshape", 0.1);
  });
});
