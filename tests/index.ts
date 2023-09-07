import fs from "fs";
import path from "path";

const { IS_COV } = process.env;

function searchTests(root: string) {
  fs.readdirSync(root).forEach((file) => {
    const filePath = path.join(root, file);
    const stat = fs.statSync(filePath);
    if (stat.isFile() && filePath.endsWith(".test.ts")) {
      if (IS_COV && path.basename(filePath) === "KTX2Loader.test.ts") {
        return;
      }
      describe(file, function () {
        require(filePath);
      }).timeout(5000);
    } else if (stat.isDirectory()) {
      searchTests(filePath);
    }
  });
}

searchTests(path.join(__dirname, "src"));
