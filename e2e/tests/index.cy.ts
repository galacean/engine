import { E2E_CONFIG } from "../config";

for (let category in E2E_CONFIG) {
  const config = E2E_CONFIG[category];

  describe(category, () => {
    for (const caseName in config) {
      it(caseName, () => {
        const { category, caseFileName, threshold } = config[caseName];
        cy.screenshotWithThreshold(category, caseFileName, threshold);
      });
    }
  });
}
