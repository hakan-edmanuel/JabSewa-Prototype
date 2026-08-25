const fs = require("fs");
const path = require("path");

const PROJECT_PATH = path.resolve(__dirname, "../..");

function safePath(filePath) {
  const fullPath = path.resolve(PROJECT_PATH, filePath);

  if (
    fullPath !== PROJECT_PATH &&
    !fullPath.startsWith(PROJECT_PATH + path.sep)
  ) {
    throw new Error("Akses file di luar project ditolak");
  }

  return fullPath;
}

function listFiles(dir = PROJECT_PATH) {
  const fullDir = safePath(dir);
  const items = fs.readdirSync(fullDir);

  let result = "";

  for (const item of items) {
    if (
      item === "node_modules" ||
      item === "dist" ||
      item === ".git"
    ) {
      continue;
    }

    const fullPath = path.join(fullDir, item);
    const relativePath = path.relative(PROJECT_PATH, fullPath);
    const stats = fs.statSync(fullPath);

    if (stats.isDirectory()) {
      result += `📁 ${relativePath}/\n`;
      result += listFiles(fullPath);
    } else {
      result += `📄 ${relativePath}\n`;
    }
  }

  return result;
}

function readFile(filePath) {
  const fullPath = safePath(filePath);

  if (!fs.existsSync(fullPath)) {
    throw new Error(`File tidak ditemukan: ${filePath}`);
  }

  return fs.readFileSync(fullPath, "utf8");
}

function writeFile(filePath, content) {
  const fullPath = safePath(filePath);

  fs.mkdirSync(path.dirname(fullPath), {
    recursive: true
  });

  fs.writeFileSync(fullPath, content, "utf8");

  return `File berhasil ditulis: ${filePath}`;
}

function editFile(filePath, oldText, newText) {
  const fullPath = safePath(filePath);

  if (!fs.existsSync(fullPath)) {
    throw new Error(`File tidak ditemukan: ${filePath}`);
  }

  const content = fs.readFileSync(fullPath, "utf8");

  if (!content.includes(oldText)) {
    throw new Error("Teks yang mau diganti tidak ditemukan.");
  }

  const updatedContent = content.replace(oldText, newText);

  fs.writeFileSync(fullPath, updatedContent, "utf8");

  return `File berhasil diedit: ${filePath}`;
}

function listProjectFiles(dir = "") {
  const fullDir = safePath(dir);
  const results = [];

  for (const item of fs.readdirSync(fullDir, {
    withFileTypes: true,
  })) {
    if (
      item.name === "node_modules" ||
      item.name === ".git" ||
      item.name === "dist" ||
      item.name === "build"
    ) {
      continue;
    }

    const relativePath = path.join(dir, item.name);

    if (item.isDirectory()) {
      results.push(...listProjectFiles(relativePath));
    } else {
      results.push(relativePath);
    }
  }

  return results;
}

module.exports = {
  safePath,
  listFiles,
  listProjectFiles,
  readFile,
  writeFile,
  editFile
};