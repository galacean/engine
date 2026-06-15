import { server } from "@vitest/browser/context";

const readBrowserFile = server.commands.readFile;
const shaderCompilerPathPrefix = "./";
const packagesPathPrefix = "../../../packages/";

export function readFile(path: string): Promise<string> {
  if (path.startsWith(shaderCompilerPathPrefix)) {
    return readBrowserFile(`src/shader-compiler/${path.slice(shaderCompilerPathPrefix.length)}`);
  }

  if (path.startsWith(packagesPathPrefix)) {
    return readBrowserFile(`../packages/${path.slice(packagesPathPrefix.length)}`);
  }

  return readBrowserFile(path);
}
