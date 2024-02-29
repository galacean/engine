import { readFileSync, readdirSync } from "fs";
import { basename, join } from "path";

const sourceDir = join(__dirname, "source");
const cmpDir = join(__dirname, "compare");

const files = readdirSync(sourceDir);
const testCaseList: { source: string; compare: string; name: string }[] = [];
for (const f of files) {
  const cmpFilePath = join(cmpDir, f);
  const sourceFilePath = join(sourceDir, f);
  testCaseList.push({
    source: readFileSync(sourceFilePath).toString(),
    compare: readFileSync(cmpFilePath).toString(),
    name: basename(f)
  });
}

export { testCaseList };
