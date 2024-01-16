import { E2E_CONFIG } from "../config";

describe("Material", () => {
  it("PBR Clearcoat", () => {
    const { category, caseFileName } = E2E_CONFIG["material-pbr-clearcoat"];
    cy.screenshotWithThreshold(category, caseFileName, 0.2);
  });

  it("PBR", () => {
    const { category, caseFileName } = E2E_CONFIG["material-pbr"];
    cy.screenshotWithThreshold("category", caseFileName, 0.2);
  });

  it("Unlit", () => {
    const { category, caseFileName } = E2E_CONFIG["material-unlit"];
    cy.screenshotWithThreshold(category, caseFileName, 0.2);
  });

  it("Blinn Phong", () => {
    const { category, caseFileName } = E2E_CONFIG["material-blinn-phong"];
    cy.screenshotWithThreshold(category, caseFileName, 0.2);
  });

  it("Blend Mode", () => {
    const { category, caseFileName } = E2E_CONFIG["material-blendMode"];
    cy.screenshotWithThreshold(category, caseFileName, 0.2);
  });

  it("ShaderLab", () => {
    const { category, caseFileName } = E2E_CONFIG["material-shaderLab"];
    cy.screenshotWithThreshold(category, caseFileName, 0.2);
  });

  it("Shader Replacement", () => {
    const { category, caseFileName } = E2E_CONFIG["material-shaderReplacement"];
    cy.screenshotWithThreshold(category, caseFileName, 0.2);
  });
});
