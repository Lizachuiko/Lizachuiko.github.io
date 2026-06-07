// ─── Pearl Background Service Worker ───
// No API key here. Requests go to the Pearl proxy (Cloudflare Worker), which
// holds the key, builds the prompts, and rate-limits. See proxy/README.md.

// ⬇️ Set this to your deployed worker URL (from `npx wrangler deploy`).
const PROXY_URL = 'https://pearl-proxy.liza-pearl2.workers.dev';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'AI_REQUEST') {
    handleAIRequest(msg.payload).then(sendResponse).catch(err => {
      sendResponse({ error: err.message });
    });
    return true; // keep channel open for async
  }
});

async function handleAIRequest({ mode, text, instruction, targetLang }) {
  const { userStyle } = await chrome.storage.sync.get(['userStyle']);

  let res;
  try {
    res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode, text, instruction, targetLang, userStyle })
    });
  } catch (e) {
    return { error: 'Network error — could not reach the Pearl service.' };
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    return { error: data.error || `Service error ${res.status}` };
  }
  return { result: data.result || '' };
}
