// ─── TextMagic Background Service Worker ───

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'AI_REQUEST') {
    handleAIRequest(msg.payload).then(sendResponse).catch(err => {
      sendResponse({ error: err.message });
    });
    return true; // keep channel open for async
  }
});

async function handleAIRequest({ mode, text, instruction, targetLang }) {
  const { apiKey, userStyle } = await chrome.storage.sync.get(['apiKey', 'userStyle']);

  if (!apiKey) {
    return { error: 'NO_API_KEY' };
  }

  const systemPrompt = buildSystemPrompt(mode, userStyle);
  const userMessage  = buildUserMessage(mode, text, instruction, targetLang);

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      // allow calling the API from a browser/extension context
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userMessage }
      ]
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error ${res.status}`);
  }

  const data = await res.json();
  return { result: (data.content?.[0]?.text || '').trim() };
}

function buildSystemPrompt(mode, userStyle) {
  const styleNote = userStyle
    ? `\n\nUser's writing style preference: ${userStyle}`
    : '';

  switch (mode) {
    case 'edit':
      return `You are a precise text editor. When given text and an editing instruction, return ONLY the edited text — no explanations, no quotes, no extra formatting. Apply the instruction faithfully.${styleNote}`;

    case 'translate':
      return `You are a professional translator. Return ONLY the translated text — no explanations, no notes, no original text. Preserve formatting and tone.${styleNote}`;

    case 'generate':
      return `You are a smart writing assistant. Generate text based on the user's instruction. Return ONLY the generated text — no explanations, no meta-commentary.${styleNote}`;

    case 'polish':
      return `You are a careful copy editor. Lightly format and edit the text for clarity, flow, and readability while preserving its meaning and the author's voice. Return ONLY the polished text — no explanations.${styleNote}`;

    case 'fix':
      return `You are a grammar editor. Fix ONLY grammar, spelling, and punctuation. Do not change wording, tone, or style beyond what's needed for correctness. Return ONLY the corrected text — no explanations.${styleNote}`;

    case 'formal':
      return `Make the text more formal and professional while keeping its meaning. Return ONLY the rewritten text.${styleNote}`;

    case 'rewrite':
      return `Rewrite the text so it expresses the same meaning in a clearly different way (different wording and sentence structure). Return ONLY the rewritten text.${styleNote}`;

    case 'structure':
      return `Restructure the text into a clear, well-organized form — logical paragraphs, and bullet points or numbered lists where they help. Keep all the information. Return ONLY the structured text.${styleNote}`;

    default:
      return `You are a helpful writing assistant. Return ONLY the processed text.${styleNote}`;
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
