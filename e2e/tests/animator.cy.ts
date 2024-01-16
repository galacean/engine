import { E2E_CONFIG } from "../config";

describe("Animator", () => {
  it("Animator Play", () => {
    const { category, caseFileName } = E2E_CONFIG["animator-play"];
    cy.screenshotWithThreshold(category, caseFileName, 0.1);
  });
  it("Animator Crossfade", () => {
    const { category, caseFileName } = E2E_CONFIG["animator-crossfade"];
    cy.screenshotWithThreshold(category, caseFileName, 0.1);
  });
  it("Animation Additive", () => {
    const { category, caseFileName } = E2E_CONFIG["animator-additive"];
    cy.screenshotWithThreshold(category, caseFileName, 0.1);
  });
  it("Animator Reuse", () => {
    const { category, caseFileName } = E2E_CONFIG["animator-reuse"];
    cy.screenshotWithThreshold(category, caseFileName, 0.1);
  });
  it("Animation BlendShape", () => {
    const { category, caseFileName } = E2E_CONFIG["animator-blendShape"];
    cy.screenshotWithThreshold(category, caseFileName, 0.1);
  });
  it("Animator CustomBlendShape", () => {
    const { category, caseFileName } = E2E_CONFIG["animator-customBlendShape"];
    cy.screenshotWithThreshold(category, caseFileName, 0.1);
  });
  it("Animator stateMachineScript", () => {
    const { category, caseFileName } = E2E_CONFIG["animator-stateMachineScript"];
    cy.screenshotWithThreshold(category, caseFileName, 0.1);
  });
  it("Animator event", () => {
    const { category, caseFileName } = E2E_CONFIG["animator-event"];
    cy.screenshotWithThreshold(category, caseFileName, 0.1);
  });
  it("Animator CustomAnimationClip", () => {
    const { category, caseFileName } = E2E_CONFIG["animator-customAnimationClip"];
    cy.screenshotWithThreshold(category, caseFileName, 0.1);
  });
});
