// ─── TextMagic Content Script ───

const LANGS = [
  'English','Russian','Spanish','French','German','Italian',
  'Portuguese','Chinese','Japanese','Korean','Arabic','Dutch',
  'Polish','Turkish','Ukrainian','Hebrew','Swedish','Norwegian'
];

let activeEl    = null;
let tmBtn       = null;
let tmPanel     = null;
let lastResult  = '';
let isOpen      = false;

// ── Inject button on focus ──────────────────────────────────────────────────

document.addEventListener('focusin', e => {
  const el = e.target;
  if (!isEditable(el)) return;
  activeEl = el;
  showBtn(el);
}, true);

document.addEventListener('focusout', e => {
  // Small delay so click on btn/panel doesn't remove it
  setTimeout(() => {
    if (!isOpen) removeBtn();
  }, 200);
}, true);

window.addEventListener('scroll', repositionAll, true);
window.addEventListener('resize', repositionAll);

// ── Helpers ─────────────────────────────────────────────────────────────────

function isEditable(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT') {
    const t = (el.type || '').toLowerCase();
    return ['text','search','email','url','password','tel',''].includes(t);
  }
  return tag === 'TEXTAREA' || el.isContentEditable;
}

function getText() {
  if (!activeEl) return '';
  if (activeEl.isContentEditable) return activeEl.innerText || '';
  const { selectionStart: s, selectionEnd: e, value: v } = activeEl;
  if (s !== e) return v.slice(s, e); // return selection if any
  return v || '';
}

function getSelectedText() {
  if (!activeEl) return '';
  if (activeEl.isContentEditable) {
    const sel = window.getSelection();
    return sel ? sel.toString() : '';
  }
  const { selectionStart: s, selectionEnd: e, value: v } = activeEl;
  return s !== e ? v.slice(s, e) : '';
}

function replaceText(newText) {
  if (!activeEl) return;
  activeEl.focus();

  if (activeEl.isContentEditable) {
    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
      sel.deleteFromDocument();
      sel.getRangeAt(0).insertNode(document.createTextNode(newText));
    } else {
      activeEl.innerText = newText;
    }
    activeEl.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }

  const { selectionStart: s, selectionEnd: e, value: v } = activeEl;
  if (s !== e) {
    const before = v.slice(0, s);
    const after  = v.slice(e);
    activeEl.value = before + newText + after;
    activeEl.setSelectionRange(s, s + newText.length);
  } else {
    activeEl.value = newText;
  }
  activeEl.dispatchEvent(new Event('input', { bubbles: true }));
}

// ── Button ───────────────────────────────────────────────────────────────────

function showBtn(el) {
  removeBtn();

  tmBtn = document.createElement('button');
  tmBtn.className = 'tm-btn';
  tmBtn.innerHTML = '✦';
  tmBtn.title = 'TextMagic AI';

  document.body.appendChild(tmBtn);
  positionBtn(el);

  tmBtn.addEventListener('mousedown', e => {
    e.preventDefault();
    e.stopPropagation();
    togglePanel(el);
  });
}

function positionBtn(el) {
  if (!tmBtn || !el) return;
  const r = el.getBoundingClientRect();
  const scrollX = window.scrollX || window.pageXOffset;
  const scrollY = window.scrollY || window.pageYOffset;

  tmBtn.style.top  = `${r.bottom + scrollY - 30}px`;
  tmBtn.style.left = `${r.right  + scrollX - 34}px`;
}

function removeBtn() {
  if (tmBtn) { tmBtn.remove(); tmBtn = null; }
  closePanel();
}

// ── Panel ────────────────────────────────────────────────────────────────────

function togglePanel(el) {
  if (isOpen) { closePanel(); return; }
  openPanel(el);
}

function openPanel(el) {
  closePanel();
  isOpen = true;

  tmPanel = createPanel();
  document.body.appendChild(tmPanel);
  positionPanel(el);

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('mousedown', outsideClick);
  }, 50);
}

function closePanel() {
  if (tmPanel) { tmPanel.remove(); tmPanel = null; }
  isOpen = false;
  document.removeEventListener('mousedown', outsideClick);
}

function outsideClick(e) {
  if (tmPanel && !tmPanel.contains(e.target) && e.target !== tmBtn) {
    closePanel();
  }
}

function positionPanel(el) {
  if (!tmPanel || !el) return;
  const r = el.getBoundingClientRect();
  const scrollX = window.scrollX || window.pageXOffset;
  const scrollY = window.scrollY || window.pageYOffset;

  let top  = r.bottom + scrollY + 6;
  let left = r.right  + scrollX - 320;

  // Don't go off-screen left
  if (left < 8 + scrollX) left = 8 + scrollX;

  // If panel would go off bottom, show above
  const panelH = 380;
  if (r.bottom + panelH > window.innerHeight) {
    top = r.top + scrollY - panelH - 6;
  }

  tmPanel.style.top  = `${top}px`;
  tmPanel.style.left = `${left}px`;
}

function repositionAll() {
  if (!activeEl) return;
  if (tmBtn)   positionBtn(activeEl);
  if (tmPanel) positionPanel(activeEl);
}

// ── Panel HTML ────────────────────────────────────────────────────────────────

function createPanel() {
  const panel = document.createElement('div');
  panel.className = 'tm-panel';

  panel.innerHTML = `
    <div class="tm-panel-header">
      <span class="tm-logo">Text<span>Magic</span></span>
      <button class="tm-close" title="Close">×</button>
    </div>

    <div class="tm-tabs">
      <button class="tm-tab tm-tab-active" data-tab="edit">✏️ Edit</button>
      <button class="tm-tab" data-tab="translate">🌐 Translate</button>
      <button class="tm-tab" data-tab="generate">✨ Generate</button>
    </div>

    <div class="tm-body">

      <!-- EDIT TAB -->
      <div class="tm-tab-content tm-active" data-content="edit">
        <div class="tm-quick">
          <button class="tm-quick-btn" data-action="fix">Fix grammar</button>
          <button class="tm-quick-btn" data-action="formal">Formal</button>
          <button class="tm-quick-btn" data-action="casual">Casual</button>
          <button class="tm-quick-btn" data-action="shorter">Shorter</button>
          <button class="tm-quick-btn" data-action="longer">Longer</button>
        </div>
        <textarea class="tm-input" id="tm-edit-input" rows="2" placeholder="Custom instruction: make it punchier, add emoji, etc."></textarea>
        <button class="tm-submit" data-mode="edit">Run →</button>
      </div>

      <!-- TRANSLATE TAB -->
      <div class="tm-tab-content" data-content="translate">
        <select class="tm-select" id="tm-lang-select">
          ${LANGS.map(l => `<option value="${l}"${l==='English'?' selected':''}>${l}</option>`).join('')}
        </select>
        <button class="tm-submit" data-mode="translate">Translate →</button>
      </div>

      <!-- GENERATE TAB -->
      <div class="tm-tab-content" data-content="generate">
        <textarea class="tm-input" id="tm-gen-input" rows="3" placeholder="Write a friendly follow-up email about our meeting…"></textarea>
        <button class="tm-submit" data-mode="generate">Generate →</button>
      </div>

    </div>

    <div class="tm-result" id="tm-result">
      <div class="tm-result-text" id="tm-result-text"></div>
      <div class="tm-result-actions">
        <button class="tm-result-btn tm-replace-btn" id="tm-replace">↩ Replace</button>
        <button class="tm-result-btn tm-copy-btn" id="tm-copy">Copy</button>
      </div>
    </div>

    <div class="tm-error" id="tm-error"></div>

    <div class="tm-footer">TextMagic v0.1 — powered by GPT-4o</div>
  `;

  // ── Tab switching ──
  panel.querySelectorAll('.tm-tab').forEach(tab => {
    tab.addEventListener('mousedown', e => {
      e.preventDefault();
      const name = tab.dataset.tab;
      panel.querySelectorAll('.tm-tab').forEach(t => t.classList.remove('tm-tab-active'));
      panel.querySelectorAll('.tm-tab-content').forEach(c => c.classList.remove('tm-active'));
      tab.classList.add('tm-tab-active');
      panel.querySelector(`[data-content="${name}"]`).classList.add('tm-active');
      hideResult(panel); hideError(panel);
    });
  });

  // ── Quick action buttons ──
  panel.querySelectorAll('.tm-quick-btn').forEach(btn => {
    btn.addEventListener('mousedown', e => {
      e.preventDefault();
      const action = btn.dataset.action;
      runRequest(panel, action, null);
    });
  });

  // ── Submit buttons ──
  panel.querySelectorAll('.tm-submit').forEach(btn => {
    btn.addEventListener('mousedown', e => {
      e.preventDefault();
      const mode = btn.dataset.mode;
      let instruction = '';
      if (mode === 'edit')     instruction = panel.querySelector('#tm-edit-input').value.trim();
      if (mode === 'generate') instruction = panel.querySelector('#tm-gen-input').value.trim();
      runRequest(panel, mode, instruction);
    });
  });

  // ── Replace ──
  panel.querySelector('#tm-replace').addEventListener('mousedown', e => {
    e.preventDefault();
    if (lastResult) replaceText(lastResult);
    closePanel();
  });

  // ── Copy ──
  panel.querySelector('#tm-copy').addEventListener('mousedown', e => {
    e.preventDefault();
    if (lastResult) navigator.clipboard.writeText(lastResult);
    const btn = panel.querySelector('#tm-copy');
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy', 1500);
  });

  // ── Close ──
  panel.querySelector('.tm-close').addEventListener('mousedown', e => {
    e.preventDefault();
    closePanel();
  });

  return panel;
}

// ── Run request ───────────────────────────────────────────────────────────────

async function runRequest(panel, mode, instruction) {
  const text = getText() || getSelectedText();
  hideResult(panel);
  hideError(panel);

  const submitBtns = panel.querySelectorAll('.tm-submit, .tm-quick-btn');
  submitBtns.forEach(b => b.disabled = true);
  if (tmBtn) { tmBtn.innerHTML = '⏳'; }

  const targetLang = panel.querySelector('#tm-lang-select')?.value;

  const { result, error } = await chrome.runtime.sendMessage({
    type: 'AI_REQUEST',
    payload: { mode, text, instruction, targetLang }
  });

  submitBtns.forEach(b => b.disabled = false);
  if (tmBtn) tmBtn.innerHTML = '✦';

  if (error) {
    if (error === 'NO_API_KEY') {
      showError(panel, '⚠ No API key. Click the TextMagic icon in your toolbar to add it.');
    } else {
      showError(panel, `Error: ${error}`);
    }
    return;
  }

  lastResult = result;
  showResult(panel, result);
}

function showResult(panel, text) {
  const r = panel.querySelector('#tm-result');
  const t = panel.querySelector('#tm-result-text');
  t.textContent = text;
  r.classList.add('tm-visible');
}

function hideResult(panel) {
  panel.querySelector('#tm-result').classList.remove('tm-visible');
}

function showError(panel, msg) {
  const e = panel.querySelector('#tm-error');
  e.textContent = msg;
  e.classList.add('tm-visible');
}

function hideError(panel) {
  panel.querySelector('#tm-error').classList.remove('tm-visible');
}
