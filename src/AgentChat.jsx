import { useState } from "react";

export default function AgentChat() {
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  async function editWithAgent() {
    if (!prompt.trim()) return;

    setLoading(true);
    setResult("");

    try {
      const response = await fetch("http://localhost:3001/api/agent-edit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          instruction: prompt,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Agent error");
      }

      setResult(`✅ ${data.message}`);
    } catch (error) {
      setResult(`❌ ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      maxWidth: "700px",
      margin: "40px auto",
      padding: "24px",
      border: "1px solid #ddd",
      borderRadius: "16px",
    }}>
      <h2>JabSewa Coding Agent</h2>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Contoh: Hero homepage terlalu kosong, bikin lebih premium."
        rows={6}
        style={{
          display: "block",
          width: "100%",
          marginTop: "16px",
          padding: "12px",
          boxSizing: "border-box",
        }}
      />

      <button
        onClick={editWithAgent}
        disabled={loading}
        style={{ marginTop: "12px" }}
      >
        {loading ? "🤖 Agent sedang bekerja..." : "✨ Edit dengan Agent"}
      </button>

      {result && (
        <p style={{ marginTop: "16px" }}>
          {result}
        </p>
      )}
    </div>
  );
}