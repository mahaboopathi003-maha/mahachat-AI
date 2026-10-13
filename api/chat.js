export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const messages = (req.body || {}).messages;
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 20) {
    return res.status(400).json({ error: "Please send between 1 and 20 messages." });
  }

  const contents = [];
  for (const m of messages) {
    if (!m || !["user", "assistant"].includes(m.role) ||
        typeof m.content !== "string" || m.content.length > 4000) {
      return res.status(400).json({ error: "Invalid message format." });
    }
    contents.push({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Maha AI is not configured yet. Add GEMINI_API_KEY in Vercel Environment Variables." });
  }

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: "You are Maha AI, a friendly and helpful assistant. Explain things clearly and safely. For programming questions, give beginner-friendly step-by-step help." }]
          },
          contents,
          generationConfig: { maxOutputTokens: 1000 }
        })
      }
    );

    const result = await upstream.json();
    if (!upstream.ok) {
      console.error("Gemini API failed:", upstream.status, result?.error?.message);
      return res.status(502).json({ error: "The AI service could not answer. Check your API key and model name." });
    }

    const reply = (result.candidates?.[0]?.content?.parts || [])
      .map(p => p.text || "").join("\n").trim();

    if (!reply) return res.status(502).json({ error: "Empty reply. Please try again." });
    return res.status(200).json({ reply });
  } catch (e) {
    console.error("Server error:", e?.message);
    return res.status(500).json({ error: "A server error occurred. Please try again." });
  }
}