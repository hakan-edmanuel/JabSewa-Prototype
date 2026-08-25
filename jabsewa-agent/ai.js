const OLLAMA_URL = "http://localhost:11434/api/generate";
const MODEL = "qwen2.5-coder:7b";

async function askAI(prompt) {
  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      prompt: prompt,
      stream: false
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status}`);
  }

  const data = await response.json();

  return data.response;
}

module.exports = {
  askAI
};