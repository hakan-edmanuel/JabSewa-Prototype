const readline = require("readline");

const {
  listFiles,
  readFile,
  writeFile,
  editFile
} = require("./tools/files");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log(`
🤖 JabSewa Agent v0.4

Commands:
  files              → lihat struktur project
  read <file>        → baca file
  create <file>      → buat file kosong
  write <file>       → tulis isi file
  edit <file>        → ganti teks dalam file
  help               → lihat commands
  exit               → keluar
`);

function ask() {
  rl.question("\nJabSewa Agent > ", (input) => {
    const trimmed = input.trim();

    if (!trimmed) {
      ask();
      return;
    }

    const parts = trimmed.split(" ");
    const command = parts[0].toLowerCase();
    const file = parts.slice(1).join(" ");

    try {

      // FILES
      if (command === "files") {
        console.log(listFiles());
        ask();
      }

      // READ
      else if (command === "read") {
        if (!file) {
          console.log("❌ Masukkan nama file.");
          ask();
          return;
        }

        console.log(readFile(file));
        ask();
      }

      // CREATE
      else if (command === "create") {
        if (!file) {
          console.log("❌ Masukkan nama file.");
          ask();
          return;
        }

        writeFile(
          file,
          "// File dibuat oleh JabSewa Agent\n"
        );

        console.log(`✅ ${file} berhasil dibuat.`);
        ask();
      }

      // WRITE
      else if (command === "write") {
        if (!file) {
          console.log("❌ Masukkan nama file.");
          ask();
          return;
        }

        console.log(`
📝 Mode WRITE
Tulis isi file.
Ketik END pada baris baru untuk selesai.
`);

        let content = "";

        function collectLine() {
          rl.question("", (line) => {

            if (line === "END") {
              writeFile(file, content);

              console.log(`✅ ${file} berhasil ditulis.`);
              ask();

            } else {
              content += line + "\n";
              collectLine();
            }

          });
        }

        collectLine();
      }

      // EDIT
      else if (command === "edit") {
        if (!file) {
          console.log("❌ Masukkan nama file.");
          ask();
          return;
        }

        console.log("✏️ Teks yang mau diganti:");

        rl.question("", (oldText) => {

          console.log("🆕 Teks pengganti:");

          rl.question("", (newText) => {

            try {
              console.log(
                editFile(file, oldText, newText)
              );
            } catch (error) {
              console.log("❌ Error:", error.message);
            }

            ask();
          });

        });
      }

      // HELP
      else if (command === "help") {
        console.log(`
Commands:

files
read <file>
create <file>
write <file>
edit <file>
help
exit
`);
        ask();
      }

      // EXIT
      else if (command === "exit") {
        console.log("👋 JabSewa Agent berhenti.");
        rl.close();
      }

      // UNKNOWN
      else {
        console.log(
          "❌ Command tidak dikenal. Ketik 'help'."
        );

        ask();
      }

    } catch (error) {
      console.log("❌ Error:", error.message);
      ask();
    }
  });
}

ask();