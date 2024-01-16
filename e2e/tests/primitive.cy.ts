describe("Primitive", () => {
  it("Primitive Sphere", () => {
    cy.screenshotWithThreshold("Primitive", "primitive-sphere", 0.1);
  });
  it("Primitive Cuboid", () => {
    cy.screenshotWithThreshold("Primitive", "primitive-cuboid", 0.1);
  });
  it("Primitive Plane", () => {
    cy.screenshotWithThreshold("Primitive", "primitive-plane", 0.1);
  });
  it("Primitive Cylinder", () => {
    cy.screenshotWithThreshold("Primitive", "primitive-cylinder", 0.1);
  });
  it("Primitive Torus", () => {
    cy.screenshotWithThreshold("Primitive", "primitive-torus", 0.1);
  });
  it("Primitive Cone", () => {
    cy.screenshotWithThreshold("Primitive", "primitive-cone", 0.1);
  });
  it("Primitive Capsule", () => {
    cy.screenshotWithThreshold("Primitive", "primitive-capsule", 0.1);
  });
});
