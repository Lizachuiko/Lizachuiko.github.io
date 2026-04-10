// ─── TextMagic Background Service Worker ───

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'AI_REQUEST') {
    handleAIRequest(msg.payload).then(sendResponse).catch(err => {
      sendResponse({ error: err.message });
    });
    return true; // keep channel open for async
  }
});

async function handleAIRequest({ mode, text, instruction, targetLang, userStyle }) {
  const { apiKey } = await chrome.storage.sync.get('apiKey');

  if (!apiKey) {
    return { error: 'NO_API_KEY' };
  }

  const systemPrompt = buildSystemPrompt(mode, userStyle);
  const userMessage  = buildUserMessage(mode, text, instruction, targetLang);

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage  }
      ],
      temperature: 0.7,
      max_tokens: 2000
    })
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || `API error ${res.status}`);
  }

  const data = await res.json();
  return { result: data.choices[0].message.content.trim() };
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

    case 'fix':
      return `You are a grammar and clarity editor. Fix grammar, spelling, and awkward phrasing. Return ONLY the corrected text — no explanations.${styleNote}`;

    case 'formal':
      return `Make the text more formal and professional. Return ONLY the rewritten text.${styleNote}`;

    case 'casual':
      return `Make the text more casual, friendly, and conversational. Return ONLY the rewritten text.${styleNote}`;

    case 'shorter':
      return `Make the text more concise without losing key meaning. Return ONLY the shortened text.${styleNote}`;

    case 'longer':
      return `Expand the text with more detail and depth. Return ONLY the expanded text.${styleNote}`;

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
