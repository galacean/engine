import { recurse } from "cypress-recurse";

describe("Animator", () => {
  // it("Animation CustomAnimationClip", () => {
  //   cy.intercept("GET", "https://gw.alipayobjects.com/os/OasisHub/315000159/9722/Sponza.bin").as("initialRequest");
  //   cy.visit(`/mpa/animation-customAnimationClip.html`);
  //   cy.window().then((win) => {
  //     win.Math.random = () => 0.5;
  //     //@ts-ignore
  //     const { cypressEnv } = win;
  //     cypressEnv.engine._vSyncCount = Infinity;
  //     cy.wait("@initialRequest", { timeout: 60000 }).then(() => {
  //       cy.get("#canvas").then(() => {
  //         return new Promise((resolve) => {
  //           for (let i = 0; i < 10; ++i) {
  //             cypressEnv.engine._time._deltaTime = 100;
  //             cypressEnv.engine.update();
  //           }
  //           cy.wait(12000);
  //           const imageName = `Animation_animation-customAnimationClip`;
  //           resolve(
  //             recurse(
  //               () => {
  //                 cypressEnv.engine._time._deltaTime = 0;
  //                 cypressEnv.engine.update();
  //                 return cy
  //                   .get("#canvas")
  //                   .screenshot(imageName, { overwrite: true })
  //                   .then(() => {
  //                     return cy.task("compare", {
  //                       fileName: imageName,
  //                       options: {
  //                         specFolder: Cypress.spec.name
  //                       }
  //                     });
  //                   });
  //               },
  //               ({ match }) => match,
  //               {
  //                 limit: 3
  //               }
  //             )
  //           );
  //         });
  //       });
  //     });
  //   });
  // });

  it("Animator Play", () => {
    cy.screenshotWithThreshold("Animator", "animator-play", 0.3);
  });

  it("Animator Crossfade", () => {
    cy.screenshotWithThreshold("Animator", "animator-crossfade", 0.3);
  });

  it("Animation Additive", () => {
    cy.screenshotWithThreshold("Animator", "animator-additive", 0.3);
  });

  it("Animator Reuse", () => {
    cy.screenshotWithThreshold("Animator", "animator-reuse", 0.3);
  });

  it("Animation BlendShape", () => {
    cy.screenshotWithThreshold("Animator", "animator-blendShape", 0.3);
  });

  it("Animator CustomBlendShape", () => {
    cy.screenshotWithThreshold("Animator", "animator-customBlendShape", 0.3);
  });

  it.only("Animator stateMachineScript", () => {
    cy.screenshotWithThreshold("Animator", "animator-stateMachineScript", 0.3);
  });

  it.only("Animator event", () => {
    cy.screenshotWithThreshold("Animator", "animator-event", 0.3);
  });

  it("Animator CustomAnimationClip", () => {
    cy.screenshotWithThreshold("Animator", "animator-customAnimationClip", 0.3);
  });
});
