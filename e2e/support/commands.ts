import { recurse } from "cypress-recurse";
import * as path from "path";

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
  const downloadsFolder = Cypress.config("downloadsFolder");

  cy.visit(`/mpa/${name}.html`);
  const imageName = `${category}_${name}.jpg`;
  const filePath = path.join(downloadsFolder, imageName);
  const startTime = performance.now();
  cy.log(`start time !!:${startTime}`);
  cy.get("#screenshot")
    .click({ force: true })
    .then(() => {
      const timeout = performance.now() - startTime;
      cy.log(`cy.get timeout !!:${timeout}`);
      if (timeout > 30000) {
        throw `1 timeout!!!${timeout}`;
      }
      return new Promise((resolve) => {
        cy.log(`Reading file ${filePath}`);
        resolve(
          recurse(
            () => {
              const timeout = performance.now() - startTime;
              cy.log(`recurse timeout!!:${timeout}`);
              if (timeout > 30000) {
                throw `2 timeout!!!${timeout}`;
              }
              return cy.readFile(filePath).then(() => {
                cy.log(`Comparing ${imageName} with threshold ${threshold}`);
                return cy.task("compare", {
                  fileName: imageName,
                  options: {
                    specFolder: Cypress.spec.name,
                    threshold,
                    antialiasing: true
                  }
                });
              });
            },
            ({ match }) => match,
            {
              limit: 2
            }
          )
        );
      });
    });
});
