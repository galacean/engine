import { EditPreparationError } from "@galacean/engine-project/edit-transaction";

/** Script-asset diagnostic crossing the editor preparation boundary. */
export class RuntimeScriptPreparationError extends EditPreparationError {
  constructor(phase: "check" | "build", message: string) {
    super(phase === "check" ? "ASSET_SCRIPT_CHECK_FAILED" : "ASSET_SCRIPT_BUILD_FAILED", phase, message);
    this.name = "RuntimeScriptPreparationError";
  }
}
