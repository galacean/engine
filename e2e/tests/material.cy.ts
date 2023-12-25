describe.only("Material", () => {
  it("PBR", () => {
    cy.screenshotWithThreshold("Material", "material-pbr", 0.4);
  });

  it("PBR Clearcoat", () => {
    cy.screenshotWithThreshold("Material", "material-pbr-clearcoat", 0.4);
  });

  it.only("Unlit", () => {
    cy.screenshotWithThreshold("Sprite", "sprite-size", 0);
  });

  it("Blinn Phong", () => {
    cy.screenshotWithThreshold("Material", "material-blinn-phong", 0.4);
  });

  it("Blend Mode", () => {
    cy.screenshotWithThreshold("Material", "material-blendMode", 0.4);
  });

  it("ShaderLab", () => {
    cy.screenshotWithThreshold("Material", "material-shaderLab", 0.4);
  });

  it("Shader Replacement", () => {
    cy.screenshotWithThreshold("Material", "material-shaderReplacement", 0.4);
  });
});
