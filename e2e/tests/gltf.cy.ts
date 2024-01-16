import { E2E_CONFIG } from "../config";

describe("glTF", () => {
  it("meshopt", () => {
    const { category, caseFileName } = E2E_CONFIG["meshopt"];
    cy.screenshotWithThreshold(category, caseFileName, 0.3);
  });
});
