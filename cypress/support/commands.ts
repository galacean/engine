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
      screenshotWithThreshold(category: string, name: string, threshold?: number): Chainable<Element>;
    }
  }
}

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
