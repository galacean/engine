describe("Material", () => {
  it("PBR", () => {
    cy.screenshotWithThreshold("Material", "material-pbr", 0.2);
  });

  it("PBR Clearcoat", () => {
    cy.screenshotWithThreshold("Material", "material-pbr-clearcoat", 0.3);
  });

  it.only("Unlit", () => {
    cy.screenshotWithThreshold("Material", "material-unlit", 0);
  });

  it("Blinn Phong", () => {
    cy.screenshotWithThreshold("Material", "material-blinn-phong", 0.2);
  });

  it("Blend Mode", () => {
    cy.screenshotWithThreshold("Material", "material-blendMode", 0.3);
  });

  it("ShaderLab", () => {
    cy.screenshotWithThreshold("Material", "material-shaderLab", 0.3);
  });

  it("Shader Replacement", () => {
    cy.screenshotWithThreshold("Material", "material-shaderReplacement", 0.3);
  });
});
