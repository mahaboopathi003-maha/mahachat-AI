// Vercel serverless function. Keep OPENAI_API_KEY in Vercel Environment Variables.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  // Simple request-size and message-count guardrails.
  const body = req.body || {};
  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 20) {
    return res.status(400).json({ error: "Please send between 1 and 20 messages." });
  }

  const cleanMessages = [];
  for (const item of messages) {
    if (!item || !["user", "assistant"].includes(item.role) ||
        typeof item.content !== "string" || item.content.length > 4000) {
      return res.status(400).json({ error: "Invalid message format." });
    }
    cleanMessages.push({ role: item.role, content: item.content });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "Maha AI is not configured yet. Add OPENAI_API_KEY in Vercel Project Settings → Environment Variables."
    });
  }

  try {
    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        instructions: "You are Maha AI, a friendly and helpful assistant. Explain things clearly and safely. For programming questions, give beginner-friendly step-by-step help.",
        input: cleanMessages.map(m => ({
          role: m.role,
          content: [{ type: "input_text", text: m.content }]
        })),
        max_output_tokens: 700
      })
    });

    const result = await upstream.json();
    if (!upstream.ok) {
      // Avoid exposing provider response details that may include sensitive diagnostics.
      console.error("OpenAI API request failed:", upstream.status);
      return res.status(502).json({ error: "The AI service could not answer. Check your API account, model access, and billing settings." });
    }

    const reply = (result.output || [])
      .flatMap(item => item.content || [])
      .filter(item => item.type === "output_text")
      .map(item => item.text)
      .join("\n")
      .trim();

    if (!reply) return res.status(502).json({ error: "The AI service returned an empty reply. Please try again." });
    return res.status(200).json({ reply });
  } catch (error) {
    console.error("Maha AI server error:", error?.message || "unknown error");
    return res.status(500).json({ error: "A server error occurred. Please try again." });
  }
}
