import { server } from "@vitest/browser/context";
const { readFile } = server.commands;

const sourceDir = "test-case/source/";
const cmpDir = "test-case/compare/";

const files = ["frag.txt", "frag2.txt"];
const testCaseList: { source: string; compare: string; name: string }[] = [];
for (const f in files) {
  const cmpFilePath = `${cmpDir}${f}`;
  const sourceFilePath = `${sourceDir}${f}`;
  testCaseList.push({
    source: await readFile(sourceFilePath),
    compare: await readFile(cmpFilePath),
    name: f
  });
}

export { testCaseList };
