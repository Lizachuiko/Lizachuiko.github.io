// ─── TextMagic Popup ───

const apiKeyInput  = document.getElementById('api-key');
const userStyleInput = document.getElementById('user-style');
const saveBtn      = document.getElementById('save');
const statusEl     = document.getElementById('status');
const keyDot       = document.getElementById('key-dot');
const keyLabel     = document.getElementById('key-label');

// Load saved values
chrome.storage.sync.get(['apiKey', 'userStyle'], ({ apiKey, userStyle }) => {
  if (apiKey) {
    apiKeyInput.value = apiKey;
    keyDot.classList.add('active');
    keyLabel.textContent = 'Key saved ✓';
  }
  if (userStyle) {
    userStyleInput.value = userStyle;
  }
});

// Save
saveBtn.addEventListener('click', () => {
  const apiKey    = apiKeyInput.value.trim();
  const userStyle = userStyleInput.value.trim();

  if (!apiKey) {
    showStatus('⚠ Please enter your API key', true);
    return;
  }

  if (!apiKey.startsWith('sk-')) {
    showStatus('⚠ Key should start with sk-', true);
    return;
  }

  chrome.storage.sync.set({ apiKey, userStyle }, () => {
    keyDot.classList.add('active');
    keyLabel.textContent = 'Key saved ✓';
    showStatus('Saved!');
  });
});

function showStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.style.color = isError ? '#e0200f' : '#22c55e';
  setTimeout(() => { statusEl.textContent = ''; }, 2500);
}
