import fs from "node:fs";
import path from "node:path";
import { JsonReporter } from "vitest/reporters";
/** Preserve completed files if a later synchronous test exhausts its worker. */
export default class IncrementalReporter extends JsonReporter {
  constructor() {
    super({});
  }
  async onTestModuleEnd(module) {
    await this.logTasks([module.task]);
  }
  async onFinished() {}
  async writeReport(report) {
    const data = JSON.parse(report),
      file = path.basename(data.testResults[0].name);
    fs.writeFileSync(
      path.resolve(
        import.meta.dirname,
        "../../.acceptance/terrain",
        `${process.env.TEST_VARIANT || "migrated"}-${file}.json`
      ),
      report
    );
  }
}
