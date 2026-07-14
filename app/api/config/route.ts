import '@/lib/legacy-env';
import { NextResponse } from 'next/server';
import { deepseekEnabled, elevenlabsEnabled, geminiEnabled, imageEnabled, dbEnabled, dbPooled, hasConfiguredKey, openrouterEnabled, moonshotEnabled } from '@/src/config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Public runtime config so the client can show a "demo mode" banner when no AI is
// set, and gray out Studio components whose integration/key isn't configured.
export async function GET() {
  const openrouter = hasConfiguredKey(process.env.OPENROUTER_API_KEY);
  return NextResponse.json(
    {
      aiEnabled: !!(openrouterEnabled || geminiEnabled || deepseekEnabled || moonshotEnabled),
      provider: openrouterEnabled ? 'openrouter' : (geminiEnabled ? 'gemini' : (moonshotEnabled ? 'moonshot' : (deepseekEnabled ? 'deepseek' : null))),
      // Directly-selectable text models (a builder dropdown lets the user force one).
      textProviders: [
        openrouterEnabled && { id: 'openrouter', label: 'OpenRouter' },
        geminiEnabled && { id: 'gemini', label: 'Gemini' },
        moonshotEnabled && { id: 'moonshot', label: 'Kimi (Moonshot)' },
        deepseekEnabled && { id: 'deepseek', label: 'DeepSeek' },
      ].filter(Boolean),
      imagesEnabled: !!imageEnabled,
      voiceEnabled: !!elevenlabsEnabled,
      dbEnabled: !!dbEnabled,
      dbPooled: !!dbPooled,
      // Capability flags for the Studio catalog (a component is selectable only
      // when its capability is true). OpenRouter unlocks all model endpoints.
      caps: {
        image: !!imageEnabled,
        wolfram: hasConfiguredKey(process.env.WOLFRAM_APP_ID),
        // These need their own integration wiring — off until built + keyed.
        music: !!elevenlabsEnabled && hasConfiguredKey(process.env.MUSIC_ENABLED),
        news: hasConfiguredKey(process.env.NEWS_API_KEY),
        openrouter,
        providers: {
          grok: openrouter || hasConfiguredKey(process.env.XAI_API_KEY),
          gemini: openrouter || geminiEnabled,
          anthropic: openrouter || hasConfiguredKey(process.env.ANTHROPIC_API_KEY),
          openai: openrouter || hasConfiguredKey(process.env.OPENAI_API_KEY),
          deepseek: openrouter || deepseekEnabled,
          kimi: openrouter || hasConfiguredKey(process.env.MOONSHOT_API_KEY),
        },
      },
    },
    { headers: { 'Cache-Control': 'no-cache' } }
  );
}
