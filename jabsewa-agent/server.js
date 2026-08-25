const http = require("http");
const fs = require("fs");
const path = require("path");
const { askAI } = require("./ai");
const {
  safePath,
  readFile: readProjectFile,
  writeFile: writeProjectFile,
  listProjectFiles,
} = require("./tools/files");

const PORT = 3001;

function cleanAIResponse(text) {
  return String(text)
    .replace(/^```[a-zA-Z0-9_-]*\s*/, "")
    .replace(/\s*```$/, "")
    .trim();
}

function normalizePath(filePath) {
  return String(filePath)
    .trim()
    .replace(/\\/g, "/")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^\.\/+/, "");
}

function findMatchingFiles(aiText, availableFiles) {
  const answer = normalizePath(aiText);
  const answerLower = answer.toLowerCase();

  const matches = [];

  // 1. Exact path match
  for (const file of availableFiles) {
    const normalizedFile = normalizePath(file);

    if (answerLower.includes(normalizedFile.toLowerCase())) {
      if (!matches.includes(file)) {
        matches.push(file);
      }
    }
  }

  // 2. Filename match
  if (!matches.length) {
    for (const file of availableFiles) {
      const fileName = path.basename(file).toLowerCase();

      if (
        fileName.length > 3 &&
        answerLower.includes(fileName)
      ) {
        if (!matches.includes(file)) {
          matches.push(file);
        }
      }
    }
  }

  // Maksimal 5 file
  return matches.slice(0, 5);
}

async function runAgentEdit(instruction) {
  if (!instruction) {
    throw new Error("Instruction wajib diisi");
  }

  const files = listProjectFiles().filter((file) =>
    /\.(jsx|js|tsx|ts|css|scss|html)$/i.test(file)
  );

  if (!files.length) {
    throw new Error("Tidak menemukan file source.");
  }

  // ========================================
  // STEP 1 — PILIH FILE
  // ========================================

  const fileList = files.join("\n");

  const selectionPrompt = `
You are the file-selection system for a React coding agent.

User request:
${instruction}

Available project files:
${fileList}

Choose up to 5 files that are actually relevant.

Rules:
- Prefer the smallest number of files necessary.
- For UI changes, consider both React components and CSS files.
- Do not choose unrelated files.
- Use paths exactly as they appear in the list.

Return ONLY the file paths.
Return ONE file path per line.
Do NOT use JSON.
Do NOT use markdown.
Do NOT explain anything.

Example:
src/components/Navbar.jsx
src/App.css
`;

  const rawSelection = cleanAIResponse(
    await askAI(selectionPrompt)
  );

  console.log(
    "\nAI file selection:\n",
    rawSelection
  );

  const matchedFiles = findMatchingFiles(
    rawSelection,
    files
  );

  if (!matchedFiles.length) {
    throw new Error(
      `Agent tidak menemukan file yang valid.\n\nJawaban AI:\n${rawSelection}`
    );
  }

  console.log(
    "Agent selected files:",
    matchedFiles
  );

  // ========================================
  // STEP 2 — BACA FILE
  // ========================================

  const fileContext = matchedFiles
    .map((file) => {
      const code = readProjectFile(file);

      return `
===== FILE: ${file} =====

${code}

===== END FILE =====
`;
    })
    .join("\n");

  // ========================================
  // STEP 3 — EDIT FILE
  // ========================================

  const editPrompt = `
You are an expert coding agent working on the JabSewa React project.

User request:
${instruction}

Relevant project files:

${fileContext}

Modify these files to satisfy the user's request.

Rules:
- Preserve existing functionality.
- Do not remove unrelated features.
- Do not change text/content unless requested.
- For UI requests, consider React structure and CSS together.
- Keep the existing JabSewa design language.
- Make only necessary changes.
- Return ONLY a JSON array.
- Every item must contain:
  "file"
  "content"

Example:
[
  {
    "file": "src/components/Navbar.jsx",
    "content": "COMPLETE FILE CONTENT"
  },
  {
    "file": "src/App.css",
    "content": "COMPLETE FILE CONTENT"
  }
]

The "file" value MUST be one of these:
${matchedFiles.join("\n")}

Do not use markdown fences.
Do not explain anything.
`;

  const rawChanges = cleanAIResponse(
    await askAI(editPrompt)
  );

  console.log(
    "\nAI changes received.\n"
  );

  let changes;

  try {
    changes = JSON.parse(rawChanges);
  } catch {
    throw new Error(
      `Agent menghasilkan format perubahan yang tidak valid.\n\nJawaban AI:\n${rawChanges}`
    );
  }

  if (!Array.isArray(changes)) {
    throw new Error(
      "Format perubahan agent tidak valid."
    );
  }

  // ========================================
  // STEP 4 — VALIDATE + SAVE
  // ========================================

  const changedFiles = [];

  for (const change of changes) {
    if (
      !change ||
      !change.file ||
      typeof change.content !== "string"
    ) {
      continue;
    }

    const requestedFile = normalizePath(
      change.file
    );

    const matched = matchedFiles.find(
      (file) =>
        normalizePath(file).toLowerCase() ===
        requestedFile.toLowerCase()
    );

    if (!matched) {
      console.log(
        "Skipping unauthorized file:",
        change.file
      );

      continue;
    }

    writeProjectFile(
      matched,
      change.content.trim()
    );

    changedFiles.push(matched);
  }

  if (!changedFiles.length) {
    throw new Error(
      "Agent tidak menghasilkan perubahan file yang valid."
    );
  }

  console.log(
    "Agent edited files:",
    changedFiles
  );

  return changedFiles;
}

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
  });

  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // ==========================================
  // GET PROJECT FILES
  // ==========================================

  if (req.method === "GET" && req.url === "/api/files") {
    try {
      const files = listProjectFiles();

      sendJSON(res, 200, { files });
    } catch (error) {
      sendJSON(res, 500, {
        error: error.message,
      });
    }

    return;
  }

  let body = "";
  let bodyLength = 0;
  const MAX_BODY_SIZE = 10 * 1024 * 1024;

  req.on("data", (chunk) => {
    bodyLength += chunk.length;

    if (bodyLength > MAX_BODY_SIZE) {
      sendJSON(res, 413, {
        error: "Payload too large",
      });
      req.destroy();
      return;
    }

    body += chunk;
  });

  req.on("end", async () => {
    try {
      const data = body ? JSON.parse(body) : {};

      // ==========================================
      // CHAT
      // ==========================================

      if (req.method === "POST" && req.url === "/api/chat") {
        if (!data.prompt) {
          throw new Error("Prompt kosong");
        }

        const answer = await askAI(data.prompt);

        sendJSON(res, 200, {
          answer,
        });

        return;
      }

      // ==========================================
      // MANUAL EDIT
      // ==========================================

      if (req.method === "POST" && req.url === "/api/edit") {
        const { file, instruction } = data;

        if (!file || !instruction) {
          throw new Error(
            "File dan instruction wajib diisi"
          );
        }

        const currentCode = readProjectFile(file);

        const prompt = `
You are a coding agent for the JabSewa React project.

File:
${file}

Current code:
---START CODE---
${currentCode}
---END CODE---

User instruction:
${instruction}

Modify the file according to the instruction.

Rules:
- Preserve existing functionality.
- Do not remove unrelated code.
- Return ONLY the complete new file content.
- Do not use markdown fences.
- Do not explain anything.
`;

        const newCode = cleanAIResponse(
          await askAI(prompt)
        );

        writeProjectFile(file, newCode);

        sendJSON(res, 200, {
          success: true,
          file,
          message: "File berhasil diubah.",
        });

        return;
      }

      // ==========================================
      // MULTI-FILE AGENT
      // ==========================================

      if (
        req.method === "POST" &&
        req.url === "/api/agent-edit"
      ) {
        const { instruction } = data;
        const changedFiles = await runAgentEdit(instruction);

        sendJSON(res, 200, {
          success: true,
          files: changedFiles,
          message:
            `Agent berhasil mengubah ${changedFiles.length} file.`,
        });

        return;
      }

      res.writeHead(404);
      res.end("Not found");

    } catch (error) {
      console.error("\nAgent error:", error);

      sendJSON(res, 500, {
        error: error.message,
      });
    }
  });
});

server.listen(PORT, () => {
  console.log(
    `JabSewa Agent running at http://localhost:${PORT}`
  );
});