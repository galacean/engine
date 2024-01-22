describe("ShaderLab", () => {
  it("PBR", () => {
    cy.screenshotWithThreshold("ShaderLab", "shaderLab-pbr", 0.2);
  });
});
