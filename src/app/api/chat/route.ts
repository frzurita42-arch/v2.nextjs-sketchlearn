import { aiText, extractJson } from "@/lib/ai";
import { userFromRequest } from "@/lib/auth";
import { chargeTokens } from "@/lib/economy";
import { getSettings } from "@/lib/settings";
import { listDocs } from "@/lib/store";
import type { ChatAction, ChatMessage, Repo, SlideTool } from "@/lib/types";

// The Coach chat: helps a user decide what to make, then hands off — it can
// open the Lesson Path composer prefilled, or open an existing repo/tool.

const SYSTEM = `You are the SketchLearn Coach — a warm, concise guide on an AI platform that turns any lesson plan, menu, catalog or portfolio into a repository of nested cards plus AI-generated slide presentations.

You help the user decide what to build, then hand off with actions. Reply as STRICT JSON:
{"reply":"your short conversational reply (2-5 sentences, no markdown headers)","actions":[{"type":"lessonPath","label":"Build this path","value":"<a one-paragraph description to prefill the composer>","flavor":"course|menu|catalog|portfolio"}]}

Rules:
- When the user describes ANYTHING they want to learn, teach, or display (a course, a cuisine, a shop's products, a portfolio), include ONE lessonPath action with a well-written prefill description and the right flavor.
- If they are only greeting or asking questions, actions may be [].
- To point at existing content the user mentions, you may use {"type":"openRepo","label":"...","value":"<slug>"} or {"type":"openTool","label":"...","value":"<slug>"} from the catalog provided.
- Never invent slugs.`;

function fallbackReply(text: string): { reply: string; actions: ChatAction[] } {
  const lower = text.toLowerCase();
  const flavor = /menu|restaurant|dish|food|breakfast|lunch|dinner/.test(lower)
    ? "menu"
    : /catalog|product|shop|store|service|handyman/.test(lower)
      ? "catalog"
      : /portfolio|showcase|my work|projects/.test(lower)
        ? "portfolio"
        : "course";
  if (text.trim().length < 12) {
    return {
      reply:
        "Hi! I'm your SketchLearn coach. Tell me what you'd like to learn — or what you'd like to display, like a restaurant menu, a product catalog or a portfolio — and I'll turn it into a full path of playable slide presentations.",
      actions: [],
    };
  }
  return {
    reply: `Great starting point. I can turn that into a ${flavor === "course" ? "structured course" : `${flavor} experience`} — a repository of units and ${flavor === "course" ? "lessons" : "items"}, each with its own AI-generated slide presentation that builds on the ones before it. Ready when you are.`,
    actions: [
      {
        type: "lessonPath",
        label: "Build this path now",
        value: text.trim(),
        flavor,
      },
    ],
  };
}

export async function POST(req: Request) {
  const settings = await getSettings();
  const user = await userFromRequest(req);
  const body = await req.json().catch(() => null);
  const messages: ChatMessage[] = Array.isArray(body?.messages)
    ? (body.messages as ChatMessage[]).slice(-12)
    : [];
  const last = messages.filter((m) => m.role === "user").pop();
  if (!last) return Response.json({ error: "No message provided." }, { status: 400 });

  const repos = (await listDocs<Repo>("repos")).slice(0, 20);
  const tools = (await listDocs<SlideTool>("tools")).slice(0, 20);
  const catalog = `EXISTING REPOSITORIES: ${repos.map((r) => `"${r.title}" (slug ${r.slug})`).join(", ") || "none"}
EXISTING SLIDE TOOLS: ${tools.map((t) => `"${t.title}" (slug ${t.slug})`).join(", ") || "none"}`;

  const transcript = messages
    .map((m) => `${m.role === "user" ? "USER" : "COACH"}: ${m.content}`)
    .join("\n");

  let reply: string | null = null;
  let actions: ChatAction[] = [];
  const raw = await aiText(`${catalog}\n\nCONVERSATION SO FAR:\n${transcript}\n\nRespond as the Coach (strict JSON).`, {
    system: SYSTEM,
    maxTokens: 900,
    temperature: 0.7,
  });
  if (raw) {
    const parsed = extractJson(raw) as { reply?: string; actions?: ChatAction[] } | null;
    if (parsed?.reply) {
      reply = parsed.reply;
      const valid = new Set(["lessonPath", "openRepo", "openTool"]);
      actions = (Array.isArray(parsed.actions) ? parsed.actions : []).filter(
        (a) => a && valid.has(a.type) && typeof a.label === "string" && typeof a.value === "string"
      );
    }
  }
  if (!reply) {
    const fb = fallbackReply(last.content);
    reply = fb.reply;
    actions = fb.actions;
  }
  if (user && settings.chatCost > 0) await chargeTokens(user, settings.chatCost);
  return Response.json({ reply, actions, tokensLeft: user?.tokens ?? null });
}
