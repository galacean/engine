import { recurse } from "cypress-recurse";
/// <reference types="cypress" />
// ***********************************************
// This example commands.ts shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// Cypress.Commands.add('login', (email, password) => { ... })
//
//
// -- This is a child command --
// Cypress.Commands.add('drag', { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add('dismiss', { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This will overwrite an existing command --
// Cypress.Commands.overwrite('visit', (originalFn, url, options) => { ... })
//
declare global {
  namespace Cypress {
    interface Chainable {
      // screenShotOnly(
      //   category: string,
      //   name: string,
      //   deltaTime?: number,
      //   threshold?: number,
      //   delay?: number
      // ): Chainable<Element>;
      // screenShotWithoutPause(category: string, name: string, threshold?: number, delay?: number): Chainable<Element>;
      screenshotWithThreshold(category: string, name: string, threshold?: number): Chainable<Element>;
      // screenShotPauseAfterRequest(
      //   category: string,
      //   name: string,
      //   request: string,
      //   deltaTime?: number,
      //   delay?: number
      // ): Chainable<Element>;
      // slide(offsetX: number): Chainable<Element>;
    }
  }
}

// Cypress.Commands.add("screenShotOnly", (category, name, deltaTime = 100, threshold = 0, delay = 1000) => {
//   cy.visit(`/mpa/${name}.html`);
//   cy.window().then((win) => {
//     win.Math.random = () => 0.5;
//     //@ts-ignore
//     const { cypressEnv } = win;
//     cypressEnv.engine._vSyncCount = Infinity;
//     cy.get("#canvas").then(() => {
//       return new Promise((resolve) => {
//         setTimeout(() => {
//           for (let i = 0; i < 10; ++i) {
//             cypressEnv.engine._time._deltaTime = deltaTime;
//             cypressEnv.engine.update();
//           }
//           const imageName = `${category}_${name}`;
//           resolve(
//             recurse(
//               () => {
//                 return cy
//                   .get("#canvas")
//                   .screenshot(imageName, { overwrite: true })
//                   .then(() => {
//                     return cy.task("compare", {
//                       fileName: imageName,
//                       options: {
//                         specFolder: Cypress.spec.name,
//                         threshold
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
//         }, delay);
//       });
//     });
//   });
// });

// Cypress.Commands.add("screenShotWithoutPause", (category, name, threshold = 0, delay = 1000) => {
//   cy.visit(`/mpa/${name}.html`);
//   cy.window().then((win) => {
//     win.Math.random = () => 0.5;
//     cy.get("#canvas").then(() => {
//       return new Promise((resolve) => {
//         setTimeout(() => {
//           const imageName = `${category}_${name}`;
//           resolve(
//             recurse(
//               () => {
//                 return cy
//                   .get("#canvas")
//                   .screenshot(imageName, { overwrite: true })
//                   .then(() => {
//                     return cy.task("compare", {
//                       fileName: imageName,
//                       options: {
//                         specFolder: Cypress.spec.name,
//                         threshold
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
//         }, delay);
//       });
//     });
//   });
// });

Cypress.Commands.add("screenshotWithThreshold", (category, name, threshold = 0) => {
  cy.visit(`/mpa/${name}.html`);

  cy.get(".cypressReady").then(() => {
    return new Promise((resolve) => {
      const imageName = `${category}_${name}`;
      resolve(
        recurse(
          () => {
            return cy
              .get("#canvas")
              .screenshot(imageName, { overwrite: true, capture: "viewport" })
              .then(() => {
                return cy.task("compare", {
                  fileName: imageName,
                  options: {
                    specFolder: Cypress.spec.name,
                    threshold
                  }
                });
              });
          },
          ({ match }) => match,
          {
            limit: 3
          }
        )
      );
    });
  });
});

// Cypress.Commands.add("screenShotPauseAfterRequest", (category, name, delay = 1000) => {
//   cy.intercept("GET", request).as("initialRequest");
//   cy.visit(`/mpa/${name}.html`);
//   cy.window().then((win) => {
//     win.Math.random = () => 0.5;
//     //@ts-ignore
//     const { cypressEnv } = win;
//     cypressEnv.engine._vSyncCount = Infinity;
//     cy.wait("@initialRequest", { timeout: 60000 }).then(() => {
//       cy.get("#canvas").then(() => {
//         return new Promise((resolve) => {
//           setTimeout(() => {
//             const imageName = `${category}_${name}`;
//             resolve(
//               recurse(
//                 () => {
//                   return cy
//                     .get("#canvas")
//                     .screenshot(imageName, { overwrite: true })
//                     .then(() => {
//                       return cy.task("compare", {
//                         fileName: imageName,
//                         options: {
//                           specFolder: Cypress.spec.name
//                         }
//                       });
//                     });
//                 },
//                 ({ match }) => match,
//                 {
//                   limit: 3
//                 }
//               )
//             );
//           }, delay);
//         });
//       });
//     });
//   });
// });

// Cypress.Commands.add("slide", { prevSubject: "element" }, (sourceSelector, offsetX = 20) => {
//   const { left, top, width, height } = sourceSelector[0].getBoundingClientRect();

//   cy.wrap(sourceSelector.get(0))
//     .trigger("mousedown", {
//       which: "1",
//       clientX: left + width / 2,
//       clientY: top + height / 2
//     })
//     .trigger("mousemove", {
//       which: "1",
//       clientX: left + width / 2 + offsetX,
//       clientY: top + height / 2
//     })
//     .trigger("mouseup", {
//       which: "1",
//       clientX: left + width / 2 + offsetX,
//       clientY: top + height / 2
//     });
// });
