const { askAI } = require("./ai");

async function main() {
  try {
    const answer = await askAI("Halo, apakah JabSewa Agent aktif? Jawab singkat.");
    console.log("AI:", answer);
  } catch (error) {
    console.error("ERROR:", error.message);
  }
}

main();