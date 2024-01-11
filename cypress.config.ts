import { defineConfig } from "cypress";
import { compare } from "odiff-bin";

const path = require("path");
const fs = require("fs-extra");

const downloadDirectory = path.join(__dirname, "e2e/downloads");
let isRunningInCommandLine = false;
export default defineConfig({
  e2e: {
    viewportWidth: 1200,
    viewportHeight: 800,
    baseUrl: "http://localhost:5175",
    defaultCommandTimeout: 60000,
    fileServerFolder: "e2e",
    supportFile: "e2e/support/e2e.ts",
    fixturesFolder: "e2e/fixtures",
    screenshotsFolder: "e2e/screenshots",
    videosFolder: "e2e/videos",
    specPattern: "e2e/tests/*.cy.ts",
    downloadsFolder: "e2e/downloads",
    video: false,
    setupNodeEvents(on, config) {
      // implement node event listeners here
      on("before:browser:launch", (browser, launchOptions) => {
        console.log("launching browser %s is headless? %s", browser.name, browser.isHeadless);
        // supply the absolute path to an unpacked extension's folder
        // NOTE: extensions cannot be loaded in headless Chrome
        if (fs.existsSync("e2e/diff")) {
          fs.rmdirSync("e2e/diff", { recursive: true });
        }
        if (browser.name === "chrome") {
          launchOptions.preferences.default["download"] = {
            default_directory: downloadDirectory
          };
        }
        if (browser.isHeadless) {
          isRunningInCommandLine = true;
        }
        launchOptions.args.push("--force-device-scale-factor=1");
        return launchOptions;
      }),
        on("task", {
          async compare({ fileName, options }) {
            const baseFolder = "e2e/fixtures/originImage/";
            const newFolder = path.join("e2e/downloads");
            const diffFolder = path.join("e2e/diff", options.specFolder);
            if (!fs.existsSync(diffFolder)) {
              fs.mkdirSync(diffFolder, { recursive: true });
            }
            const baseImage = path.join(baseFolder, fileName);
            const newImage = path.join(newFolder, fileName);
            const diffImage = path.join(diffFolder, fileName);
            console.log("comparing base image %s to the new image %s", baseImage, newImage);
            if (options) {
              console.log("odiff options %o", options);
            }
            const started = +new Date();

            const result = await compare(baseImage, newImage, diffImage, options);
            const finished = +new Date();
            const elapsed = finished - started;
            console.log("odiff took %dms", elapsed);

            //@ts-ignore
            if (result.match === false && result.diffPercentage <= 0.1) {
              //@ts-ignore
              result.match = true;
            }

            console.log(result);
            return result;
          }
        });
    }
  },
  chromeWebSecurity: false
});
