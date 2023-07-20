import { defineConfig } from "cypress";
import { compare } from "odiff-bin";

const path = require("path");
const fs = require("fs-extra");

const downloadDirectory = path.join(__dirname, "cypress/downloads");
let isRunningInCommandLine = false;
export default defineConfig({
  e2e: {
    viewportWidth: 1200,
    viewportHeight: 800,
    baseUrl: "http://localhost:3000",
    defaultCommandTimeout: 60000,
    setupNodeEvents(on, config) {
      // implement node event listeners here
      on("before:browser:launch", (browser, launchOptions) => {
        console.log("launching browser %s is headless? %s", browser.name, browser.isHeadless);
        // supply the absolute path to an unpacked extension's folder
        // NOTE: extensions cannot be loaded in headless Chrome
        if (fs.existsSync("cypress/diff")) {
          fs.rmdirSync("cypress/diff", { recursive: true });
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
            fileName += ".png";
            const baseFolder = "cypress/fixtures/originImage/";
            const newFolder = path.join("cypress/screenshots", isRunningInCommandLine ? options.specFolder : "");
            const diffFolder = path.join("cypress/diff", options.specFolder);
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

            console.log(result);
            return result;
          }
        });
    }
  },
  chromeWebSecurity: false
});
