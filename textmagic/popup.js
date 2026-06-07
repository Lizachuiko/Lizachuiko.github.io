// ─── Pearl Popup ───
// No API key here — that lives on the proxy. Only the writing-style preference.

const userStyleInput = document.getElementById('user-style');
const saveBtn        = document.getElementById('save');
const statusEl       = document.getElementById('status');

// Load saved value
chrome.storage.sync.get(['userStyle'], ({ userStyle }) => {
  if (userStyle) userStyleInput.value = userStyle;
});

// Save
saveBtn.addEventListener('click', () => {
  const userStyle = userStyleInput.value.trim();
  chrome.storage.sync.set({ userStyle }, () => {
    showStatus('Saved!');
  });
});

function showStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.style.color = isError ? '#e0200f' : '#22c55e';
  setTimeout(() => { statusEl.textContent = ''; }, 2500);
}
