import fs from "fs";
import path from "path";

function searchTests(root: string) {
  fs.readdirSync(root).forEach((file) => {
    const filePath = path.join(root, file);
    const stat = fs.statSync(filePath);
    if (stat.isFile() && filePath.endsWith(".test.ts")) {
      require(filePath);
    } else if (stat.isDirectory()) {
      describe(file, function () {
        searchTests(filePath);
      }).timeout(5000);
    }
  });
}

searchTests(path.join(__dirname, "src"));
