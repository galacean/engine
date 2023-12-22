describe("Material", () => {
  it("PBR", () => {
    cy.screenshotWithThreshold("Material", "material-pbr", 0.1);
  });

  it("PBR Clearcoat", () => {
    cy.screenshotWithThreshold("Material", "material-pbr-clearcoat", 0.1);
  });

  it("Unlit", () => {
    cy.screenshotWithThreshold("Material", "material-unlit", 0.1);
  });

  it("Blinn Phong", () => {
    cy.screenshotWithThreshold("Material", "material-blinn-phong", 0.1);
  });

  it("Blend Mode", () => {
    cy.screenshotWithThreshold("Material", "material-blendMode", 0.1);
  });

  it("ShaderLab", () => {
    cy.screenshotWithThreshold("Material", "material-shaderLab", 0.1);
  });

  it("Shader Replacement", () => {
    cy.screenshotWithThreshold("Material", "material-shaderReplacement", 0.1);
  });
});
