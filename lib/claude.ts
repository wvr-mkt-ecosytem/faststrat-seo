import { query } from "@anthropic-ai/claude-agent-sdk";

// Wrapper sobre el Agent SDK. Usa la auth de tu suscripción vía
// CLAUDE_CODE_OAUTH_TOKEN (generado con `claude setup-token`), NO una API key.
// Si ANTHROPIC_API_KEY estuviera seteada, ganaría sobre la suscripción.

type Model = "sonnet" | "opus" | "haiku";

interface RunOptions {
  system: string;
  prompt: string;
  model?: Model;
  allowedTools?: string[];
}

/** Devuelve el texto final del asistente. */
export async function runClaude({
  system,
  prompt,
  model = "sonnet",
  allowedTools = [],
}: RunOptions): Promise<string> {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;

  for await (const message of query({
    prompt,
    options: {
      model,
      systemPrompt: system,
      allowedTools,
      permissionMode: allowedTools.length > 0 ? "acceptEdits" : "default",
      env,
    },
  })) {
    if (message.type === "result") {
      const m = message as { result?: string; subtype?: string; is_error?: boolean };
      if (m.is_error || (m.subtype && m.subtype !== "success")) {
        throw new Error(m.result || m.subtype || "error del Agent SDK");
      }
      return m.result ?? "";
    }
  }
  throw new Error("Claude no devolvió un resultado");
}
