import { getSettings } from "./settings";

// Pluggable AI provider layer. Keys come from the admin dashboard (stored
// settings) with Vercel env vars as the base layer — see settings.ts.

export interface AiTextOptions {
  system?: string;
  maxTokens?: number;
  temperature?: number;
}

interface ResolvedProvider {
  provider: "anthropic" | "openai";
  key: string;
  model: string;
}

async function resolveProvider(): Promise<ResolvedProvider | null> {
  const s = await getSettings();
  const anthropic: ResolvedProvider | null = s.anthropicApiKey
    ? { provider: "anthropic", key: s.anthropicApiKey, model: s.anthropicModel }
    : null;
  const openai: ResolvedProvider | null = s.openaiApiKey
    ? { provider: "openai", key: s.openaiApiKey, model: s.openaiModel }
    : null;
  if (s.aiProvider === "anthropic") return anthropic;
  if (s.aiProvider === "openai") return openai;
  return anthropic ?? openai;
}

export async function aiAvailable(): Promise<boolean> {
  return (await resolveProvider()) !== null;
}

/**
 * Run a text completion against the configured provider.
 * Returns null when no provider is configured or the call fails — callers
 * fall back to the deterministic template engine so the site always works.
 */
export async function aiText(prompt: string, opts: AiTextOptions = {}): Promise<string | null> {
  const resolved = await resolveProvider();
  if (!resolved) return null;
  const maxTokens = opts.maxTokens ?? 4000;
  try {
    if (resolved.provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": resolved.key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: resolved.model,
          max_tokens: maxTokens,
          temperature: opts.temperature ?? 0.7,
          system: opts.system,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) {
        console.error("Anthropic error", res.status, await res.text());
        return null;
      }
      const data = await res.json();
      const text = (data.content ?? [])
        .filter((b: { type: string }) => b.type === "text")
        .map((b: { text: string }) => b.text)
        .join("");
      return text || null;
    }
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${resolved.key}`,
      },
      body: JSON.stringify({
        model: resolved.model,
        max_tokens: maxTokens,
        temperature: opts.temperature ?? 0.7,
        messages: [
          ...(opts.system ? [{ role: "system", content: opts.system }] : []),
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) {
      console.error("OpenAI error", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? null;
  } catch (err) {
    console.error("AI provider call failed", err);
    return null;
  }
}

/** Generate an image, returning a data URL, or null when unavailable. */
export async function aiImage(prompt: string): Promise<string | null> {
  const s = await getSettings();
  if (!s.imageGeneration || !s.openaiApiKey) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${s.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt,
        size: "1024x1024",
        n: 1,
      }),
    });
    if (!res.ok) {
      console.error("Image generation error", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const b64 = data.data?.[0]?.b64_json;
    return b64 ? `data:image/png;base64,${b64}` : null;
  } catch (err) {
    console.error("Image generation failed", err);
    return null;
  }
}

/** Extract the first balanced JSON object or array from model output. */
export function extractJson(text: string): unknown | null {
  const start = text.search(/[[{]/);
  if (start === -1) return null;
  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
