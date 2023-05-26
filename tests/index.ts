import fs from "fs";
import path from "path";

function searchTests(root: string) {
  fs.readdirSync(root).forEach((file) => {
    const filePath = path.join(root, file);
    const stat = fs.statSync(filePath);
    if (stat.isFile() && filePath.endsWith(".test.ts")) {
      require(filePath);
    } else if (stat.isDirectory()) {
      describe(file, () => {
        searchTests(filePath);
      });
    }
  });
}

searchTests(path.join(__dirname, "src"));
