// ─── Pearl proxy — Cloudflare Worker ───
// Holds the Anthropic API key server-side. The extension never sees it.
// Builds the prompts here so clients can't send arbitrary (expensive) requests,
// and rate-limits by IP to cap abuse.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 2000;

// Hard caps on what a single request may contain, so nobody can blow up your
// bill with a giant payload.
const MAX_TEXT_LEN = 12000;
const MAX_INSTRUCTION_LEN = 2000;

export default {
  async fetch(request, env) {
    // ── CORS preflight ──
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    // ── Rate limit by client IP ──
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const { success } = await env.RATE_LIMITER.limit({ key: ip });
    if (!success) {
      return json({ error: 'Too many requests — slow down a moment.' }, 429);
    }

    // ── Parse + validate input ──
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    let { mode, text = '', instruction = '', targetLang, userStyle = '' } = body || {};
    if (typeof mode !== 'string') {
      return json({ error: 'Missing mode' }, 400);
    }
    text = String(text).slice(0, MAX_TEXT_LEN);
    instruction = String(instruction).slice(0, MAX_INSTRUCTION_LEN);
    userStyle = String(userStyle).slice(0, 500);

    // ── Build prompts server-side ──
    const systemPrompt = buildSystemPrompt(mode, userStyle);
    const userMessage = buildUserMessage(mode, text, instruction, targetLang);

    // ── Call Anthropic with the secret key ──
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return json({ error: err.error?.message || `API error ${res.status}` }, 502);
    }

    const data = await res.json();
    return json({ result: (data.content?.[0]?.text || '').trim() });
  }
};

// ── CORS ──
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type'
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders() }
  });
}

// ── Prompt building (moved off the client) ──
function buildSystemPrompt(mode, userStyle) {
  const styleNote = userStyle
    ? `\n\nUser's writing style preference: ${userStyle}`
    : '';
  return basePrompt(mode) + styleNote;
}

function basePrompt(mode) {
  switch (mode) {
    case 'edit':
      return `You are a precise text editor. When given text and an editing instruction, return ONLY the edited text — no explanations, no quotes, no extra formatting. Apply the instruction faithfully.`;
    case 'translate':
      return `You are a professional translator. Return ONLY the translated text — no explanations, no notes, no original text. Preserve formatting and tone.`;
    case 'generate':
      return `You are a smart writing assistant. Generate text based on the user's instruction. Return ONLY the generated text — no explanations, no meta-commentary.`;
    case 'polish':
      return `You are a careful copy editor. Lightly format and edit the text for clarity, flow, and readability while preserving its meaning and the author's voice. Return ONLY the polished text — no explanations.`;
    case 'fix':
      return `You are a grammar editor. Fix ONLY grammar, spelling, and punctuation. Do not change wording, tone, or style beyond what's needed for correctness. Return ONLY the corrected text — no explanations.`;
    case 'formal':
      return `Make the text more formal and professional while keeping its meaning. Return ONLY the rewritten text.`;
    case 'rewrite':
      return `Rewrite the text so it expresses the same meaning in a clearly different way (different wording and sentence structure). Return ONLY the rewritten text.`;
    case 'structure':
      return `Restructure the text into a clear, well-organized form — logical paragraphs, and bullet points or numbered lists where they help. Keep all the information. Return ONLY the structured text.`;
    default:
      return `You are a helpful writing assistant. Return ONLY the processed text.`;
  }
}

function buildUserMessage(mode, text, instruction, targetLang) {
  switch (mode) {
    case 'translate':
      return `Translate to ${targetLang || 'English'}:\n\n${text}`;
    case 'generate':
      return instruction || text;
    case 'edit':
      return `Text: ${text}\n\nInstruction: ${instruction}`;
    default:
      return text;
  }
}
