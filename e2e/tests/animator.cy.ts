describe("Animator", () => {
  it("Animator Play", () => {
    cy.screenshotWithThreshold("Animator", "animator-play", 0.1);
  });
  it("Animator Crossfade", () => {
    cy.screenshotWithThreshold("Animator", "animator-crossfade", 0.1);
  });
  it("Animation Additive", () => {
    cy.screenshotWithThreshold("Animator", "animator-additive", 0.1);
  });
  it("Animator Reuse", () => {
    cy.screenshotWithThreshold("Animator", "animator-reuse", 0.1);
  });
  it("Animation BlendShape", () => {
    cy.screenshotWithThreshold("Animator", "animator-blendShape", 0.1);
  });
  it("Animator CustomBlendShape", () => {
    cy.screenshotWithThreshold("Animator", "animator-customBlendShape", 0.1);
  });
  it("Animator stateMachineScript", () => {
    cy.screenshotWithThreshold("Animator", "animator-stateMachineScript", 0.1);
  });
  it("Animator event", () => {
    cy.screenshotWithThreshold("Animator", "animator-event", 0.1);
  });
  it("Animator CustomAnimationClip", () => {
    cy.screenshotWithThreshold("Animator", "animator-customAnimationClip", 0.1);
  });
});
