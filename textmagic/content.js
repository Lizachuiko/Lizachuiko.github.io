// ─── TextMagic Content Script ───

const LANGS = [
  'English','Russian','Spanish','French','German','Italian',
  'Portuguese','Chinese','Japanese','Korean','Arabic','Dutch',
  'Polish','Turkish','Ukrainian','Hebrew','Swedish','Norwegian'
];

let activeEl     = null;
let tmBtn        = null;
let tmPanel      = null;
let lastResult   = '';
let isOpen       = false;
let panelDragged = false; // once the user drags the panel, stop auto-positioning
let genResults   = [];    // stack of successive generations (for iterative editing)
let genIndex     = -1;    // index of the currently shown generation

// ── Liquid-glass refraction filter (injected once per page) ──────────────────
// Bends the real rendered content behind the button, the Aave/Apple way:
// an SVG feDisplacementMap drives backdrop-filter. Chromium-only — fine, this
// is a Chrome extension.

function makeLensMap(size, strength) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const R = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - R + 0.5, dy = y - R + 0.5;
      const r = Math.sqrt(dx * dx + dy * dy);
      let nx = 0.5, ny = 0.5;
      if (r < R) {
        const nr = r / R;
        const slope = nr / Math.sqrt(Math.max(1 - nr * nr, 1e-3));
        const disp = Math.min(slope * strength, 1);
        const ux = dx / (r || 1), uy = dy / (r || 1);
        nx = 0.5 + ux * disp * 0.5;
        ny = 0.5 + uy * disp * 0.5;
      }
      const i = (y * size + x) * 4;
      img.data[i] = nx * 255;
      img.data[i + 1] = ny * 255;
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

function injectGlassFilter() {
  if (document.getElementById('tm-filters')) return;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('id', 'tm-filters');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';

  const SIZE = 28, SCALE = 16, STRENGTH = 1.0, CHROMA = 3;
  const f = buildLensFilter('tm-glass-btn', SIZE, SCALE, STRENGTH, CHROMA);
  svg.appendChild(f);
  (document.body || document.documentElement).appendChild(svg);
}

// Builds a displacement filter with chromatic aberration: the R/G/B channels
// are displaced by slightly different amounts, then recombined, so the lens
// edge gets a faint rainbow fringe like real glass.
function buildLensFilter(id, size, scale, strength, chroma) {
  const NS = 'http://www.w3.org/2000/svg';
  const f = document.createElementNS(NS, 'filter');
  f.setAttribute('id', id);
  f.setAttribute('x', '-50%');
  f.setAttribute('y', '-50%');
  f.setAttribute('width', '200%');
  f.setAttribute('height', '200%');
  f.setAttribute('color-interpolation-filters', 'sRGB');

  const feImg = document.createElementNS(NS, 'feImage');
  feImg.setAttribute('href', makeLensMap(size, strength));
  feImg.setAttribute('x', '0');
  feImg.setAttribute('y', '0');
  feImg.setAttribute('width', size);
  feImg.setAttribute('height', size);
  feImg.setAttribute('preserveAspectRatio', 'none');
  feImg.setAttribute('result', 'map');
  f.appendChild(feImg);

  const disp = (sc, res) => {
    const dm = document.createElementNS(NS, 'feDisplacementMap');
    dm.setAttribute('in', 'SourceGraphic');
    dm.setAttribute('in2', 'map');
    dm.setAttribute('scale', sc);
    dm.setAttribute('xChannelSelector', 'R');
    dm.setAttribute('yChannelSelector', 'G');
    dm.setAttribute('result', res);
    f.appendChild(dm);
  };
  // red bends most, blue least → classic chromatic split
  disp(scale + chroma, 'rDisp');
  disp(scale,          'gDisp');
  disp(scale - chroma, 'bDisp');

  const pick = (inName, row, res) => {
    const cm = document.createElementNS(NS, 'feColorMatrix');
    cm.setAttribute('in', inName);
    cm.setAttribute('type', 'matrix');
    const m = [
      row === 0 ? '1' : '0', '0', '0', '0', '0',
      '0', row === 1 ? '1' : '0', '0', '0', '0',
      '0', '0', row === 2 ? '1' : '0', '0', '0',
      '0', '0', '0', '1', '0'
    ].join(' ');
    cm.setAttribute('values', m);
    cm.setAttribute('result', res);
    f.appendChild(cm);
  };
  pick('rDisp', 0, 'rOnly');
  pick('gDisp', 1, 'gOnly');
  pick('bDisp', 2, 'bOnly');

  const blend = (a, b, res) => {
    const fb = document.createElementNS(NS, 'feBlend');
    fb.setAttribute('in', a);
    fb.setAttribute('in2', b);
    fb.setAttribute('mode', 'screen');
    if (res) fb.setAttribute('result', res);
    f.appendChild(fb);
  };
  blend('rOnly', 'gOnly', 'rg');
  blend('rg', 'bOnly');

  return f;
}

injectGlassFilter();

// Load Nunito Sans for the panel (best-effort; falls back to system fonts).
function injectFont() {
  if (document.getElementById('tm-font')) return;
  const l = document.createElement('link');
  l.id = 'tm-font';
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Nunito+Sans:opsz,wght@6..12,300;6..12,400;6..12,600;6..12,700&display=swap';
  (document.head || document.documentElement).appendChild(l);
}
injectFont();

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

// Follow the caret as the user types / moves it.
['input', 'keyup', 'click', 'mouseup'].forEach(ev => {
  document.addEventListener(ev, () => {
    if (activeEl && isEditable(activeEl) && tmBtn) positionBtn(activeEl);
  }, true);
});

// ── Long-press Shift to open the panel ───────────────────────────────────────
// Hold Shift ~0.5s with no other key. Pressing any other key (typing a capital,
// Shift+arrows to select, etc.) cancels it, so it never fires by accident.
let shiftTimer = null;
let shiftHeld  = false;
let otherKeyDuringShift = false;

document.addEventListener('keydown', e => {
  if (e.key === 'Shift' && !e.repeat && !shiftHeld) {
    shiftHeld = true;
    otherKeyDuringShift = false;
    shiftTimer = setTimeout(() => {
      if (shiftHeld && !otherKeyDuringShift && activeEl && isEditable(activeEl)) {
        togglePanel(activeEl);
      }
    }, 500);
  } else if (e.key !== 'Shift') {
    otherKeyDuringShift = true;
    clearTimeout(shiftTimer);
  }
}, true);

document.addEventListener('keyup', e => {
  if (e.key === 'Shift') {
    shiftHeld = false;
    clearTimeout(shiftTimer);
  }
}, true);

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

function getFullText() {
  if (!activeEl) return '';
  if (activeEl.isContentEditable) return activeEl.innerText || '';
  return activeEl.value || '';
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

// ── Caret tracking ────────────────────────────────────────────────────────────

function getLineHeight(el) {
  const cs = getComputedStyle(el);
  let lh = parseFloat(cs.lineHeight);
  if (isNaN(lh)) lh = (parseFloat(cs.fontSize) || 14) * 1.2;
  return lh;
}

// Returns the position right after the END of the text, in viewport coords:
// { x, y, lineH }. We anchor to the text end (not the caret) so the button
// never sits on top of what the user is reading/editing.
function getEndRect(el) {
  try {
    if (el.isContentEditable) {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false); // to the very end
      const rects = range.getClientRects();
      let rect = rects[rects.length - 1] || range.getBoundingClientRect();
      if (rect && (rect.top || rect.height || rect.left)) {
        return { x: rect.right || rect.left, y: rect.top, lineH: rect.height || getLineHeight(el) };
      }
      const r = el.getBoundingClientRect();
      return { x: r.left + 4, y: r.top + 4, lineH: getLineHeight(el) };
    }
    return textPosRect(el, (el.value || '').length);
  } catch (e) {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, lineH: getLineHeight(el) };
  }
}

// Mirror-div technique: clone the field's text + styling into a hidden div,
// drop a marker at the given index, and measure its offset.
function textPosRect(el, index) {
  const isInput = el.tagName === 'INPUT';
  const cs = getComputedStyle(el);
  const div = document.createElement('div');
  const s = div.style;
  s.position = 'absolute';
  s.visibility = 'hidden';
  s.whiteSpace = isInput ? 'pre' : 'pre-wrap';
  if (!isInput) s.wordWrap = 'break-word';
  s.overflow = 'hidden';
  s.boxSizing = 'border-box';
  s.width = isInput ? 'auto' : el.clientWidth + 'px';
  s.height = 'auto';
  ['paddingTop','paddingRight','paddingBottom','paddingLeft',
   'fontStyle','fontVariant','fontWeight','fontStretch','fontSize',
   'lineHeight','fontFamily','textAlign','textTransform','textIndent',
   'letterSpacing','wordSpacing','tabSize'].forEach(p => { s[p] = cs[p]; });

  div.textContent = (el.value || '').substring(0, index);
  const span = document.createElement('span');
  span.textContent = '​'; // zero-width marker
  div.appendChild(span);
  document.body.appendChild(div);
  const offLeft = span.offsetLeft;
  const offTop  = span.offsetTop;
  document.body.removeChild(div);

  const r = el.getBoundingClientRect();
  const bl = parseFloat(cs.borderLeftWidth) || 0;
  const bt = parseFloat(cs.borderTopWidth) || 0;
  return {
    x: r.left + bl + offLeft - el.scrollLeft,
    y: r.top  + bt + offTop  - el.scrollTop,
    lineH: getLineHeight(el)
  };
}

// ── Button ───────────────────────────────────────────────────────────────────

function showBtn(el) {
  removeBtn();

  tmBtn = document.createElement('button');
  tmBtn.className = 'tm-btn';
  tmBtn.innerHTML = '';
  tmBtn.title = 'Pearl AI';

  document.body.appendChild(tmBtn);
  positionBtn(el);

  tmBtn.addEventListener('mousedown', e => {
    e.preventDefault();
    e.stopPropagation();
    togglePanel(el);
  });
}

const BTN_SIZE = 28;

function positionBtn(el) {
  if (!tmBtn || !el) return;
  const r = el.getBoundingClientRect();
  const sx = window.scrollX || window.pageXOffset;
  const sy = window.scrollY || window.pageYOffset;

  // Sit just after the END of the text, inside the field — never over the text.
  const c = getEndRect(el);
  const GAP = 14;
  let left = c.x + sx + GAP;
  let top  = c.y + sy + (c.lineH - BTN_SIZE) / 2;

  // Clamp inside the field so the button never escapes its box.
  const minLeft = r.left + sx + 2;
  const maxLeft = r.right + sx - BTN_SIZE - 2;
  const minTop  = r.top + sy + 2;
  const maxTop  = r.bottom + sy - BTN_SIZE - 2;
  left = Math.max(minLeft, Math.min(maxLeft, left));
  top  = Math.max(minTop,  Math.min(maxTop,  top));

  tmBtn.style.top  = `${top}px`;
  tmBtn.style.left = `${left}px`;
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
  panelDragged = false;
  genResults = [];
  genIndex = -1;

  tmPanel = createPanel();
  document.body.appendChild(tmPanel);
  positionPanel(el);
  makeDraggable(tmPanel);

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('mousedown', outsideClick);
  }, 50);
}

function closePanel() {
  if (tmPanel) { tmPanel.remove(); tmPanel = null; }
  isOpen = false;
  panelDragged = false;
  document.removeEventListener('mousedown', outsideClick);
}

// Drag the panel anywhere on screen by grabbing an empty part of it
// (anything that isn't a control).
function makeDraggable(panel) {
  panel.addEventListener('mousedown', e => {
    if (e.target.closest('button, input, textarea, select, a, option')) return;
    e.preventDefault();
    const rect = panel.getBoundingClientRect();
    const sx = window.scrollX || 0, sy = window.scrollY || 0;
    const startLeft = rect.left + sx;
    const startTop  = rect.top + sy;
    const px = e.clientX, py = e.clientY;
    panel.classList.add('tm-dragging');

    const move = ev => {
      panelDragged = true;
      panel.style.left = (startLeft + ev.clientX - px) + 'px';
      panel.style.top  = (startTop + ev.clientY - py) + 'px';
    };
    const up = () => {
      panel.classList.remove('tm-dragging');
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });
}

function outsideClick(e) {
  if (tmPanel && !tmPanel.contains(e.target) && e.target !== tmBtn) {
    closePanel();
  }
}

function positionPanel(el) {
  if (!tmPanel || !el || panelDragged) return;
  const r = el.getBoundingClientRect();
  const end = getEndRect(el); // last line of text, not the field's bottom
  const sx = window.scrollX || window.pageXOffset;
  const sy = window.scrollY || window.pageYOffset;
  const panelW = 320;
  const panelH = tmPanel.offsetHeight || 360;

  // Just under the last line of text in the field.
  let top  = end.y + sy + end.lineH + 6;
  let left = r.left + sx;

  // Keep on screen horizontally.
  if (left + panelW > sx + window.innerWidth) left = sx + window.innerWidth - panelW - 8;
  if (left < sx + 8) left = sx + 8;

  // If there's no room below the line, flip above it.
  if (end.y + end.lineH + panelH + 8 > window.innerHeight) {
    top = end.y + sy - panelH - 6;
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

const ICONS = {
  pencil:  '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  globe:   '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z"/></svg>',
  sparkle: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/></svg>',
  expand:  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>',
  close:   '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  undo:    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a6 6 0 0 1 0 12h-2"/></svg>'
};

function createPanel() {
  const panel = document.createElement('div');
  panel.className = 'tm-panel';

  panel.innerHTML = `
    <div class="tm-toprow">
      <div class="tm-tabs">
        <button class="tm-tab tm-tab-active" data-tab="edit"><span class="tm-tab-ico">${ICONS.pencil}</span>Edit</button>
        <button class="tm-tab" data-tab="generate"><span class="tm-tab-ico">${ICONS.sparkle}</span>Generate</button>
      </div>
      <div class="tm-header-actions">
        <button class="tm-icon-btn tm-expand" title="History">${ICONS.expand}</button>
        <button class="tm-icon-btn tm-close" title="Close">${ICONS.close}</button>
      </div>
    </div>

    <div class="tm-body">

      <!-- EDIT TAB: every action on existing text -->
      <div class="tm-tab-content tm-active" data-content="edit">
        <div class="tm-quick">
          <button class="tm-quick-btn" data-action="polish">Format &amp; edit</button>
          <button class="tm-quick-btn" data-action="fix">Fix grammar</button>
          <button class="tm-quick-btn" data-action="translate">Translate</button>
          <button class="tm-quick-btn" data-action="formal">Formal</button>
          <button class="tm-quick-btn" data-action="rewrite">Rewrite</button>
          <button class="tm-quick-btn" data-action="structure">Structure</button>
        </div>
        <div class="tm-lang-row" id="tm-lang-row">
          <div class="tm-flags">
            <button class="tm-flag" data-lang="Spanish" title="Spanish">🇪🇸</button>
            <button class="tm-flag" data-lang="French"  title="French">🇫🇷</button>
            <button class="tm-flag" data-lang="German"  title="German">🇩🇪</button>
            <button class="tm-flag" data-lang="Russian" title="Russian">🇷🇺</button>
            <button class="tm-flag tm-flag-more" id="tm-more-langs" title="More languages">⋯</button>
          </div>
          <select class="tm-select" id="tm-lang-select" style="display:none">
            ${LANGS.map(l => `<option value="${l}"${l==='English'?' selected':''}>${l}</option>`).join('')}
          </select>
        </div>
      </div>

      <!-- GENERATE TAB: prompt box (prefilled with the field's text) -->
      <div class="tm-tab-content" data-content="generate">
        <textarea class="tm-input tm-grow" id="tm-gen-input" rows="3" placeholder="Write a friendly follow-up email about our meeting…"></textarea>
        <button class="tm-submit" data-mode="generate">Generate →</button>
      </div>

    </div>

    <div class="tm-loading-skeleton" id="tm-skeleton">
      <span></span><span></span><span></span>
    </div>

    <div class="tm-result" id="tm-result">
      <div class="tm-result-label">Result</div>
      <div class="tm-result-text" id="tm-result-text"></div>
      <div class="tm-result-actions">
        <button class="tm-result-btn tm-revert-btn" id="tm-revert" title="Previous generation" style="display:none">${ICONS.undo}</button>
        <button class="tm-result-btn tm-replace-btn" id="tm-replace">Apply this text</button>
        <button class="tm-result-btn tm-copy-btn" id="tm-copy">Copy</button>
      </div>
    </div>

    <div class="tm-error" id="tm-error"></div>

    <div class="tm-footer">Pearl v0.1 — powered by Claude</div>
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
      if (action === 'translate') {
        // just reveal the flag picker; translation runs when a language is chosen
        panel.querySelector('#tm-lang-row').classList.add('tm-visible');
        return;
      }
      runRequest(panel, action, null);
    });
  });

  // Flag chips → translate into that language
  panel.querySelectorAll('.tm-flag[data-lang]').forEach(flag => {
    flag.addEventListener('mousedown', e => {
      e.preventDefault();
      panel.querySelector('#tm-lang-select').value = flag.dataset.lang;
      runRequest(panel, 'translate', null);
    });
  });

  // "More" → reveal the full language dropdown
  panel.querySelector('#tm-more-langs').addEventListener('mousedown', e => {
    e.preventDefault();
    panel.querySelector('#tm-lang-select').style.display = 'block';
  });

  // Re-run translation when the dropdown language changes
  panel.querySelector('#tm-lang-select').addEventListener('change', () => {
    runRequest(panel, 'translate', null);
  });

  // ── Submit buttons ──
  panel.querySelectorAll('.tm-submit').forEach(btn => {
    btn.addEventListener('mousedown', e => {
      e.preventDefault();
      const mode = btn.dataset.mode;
      let instruction = '';
      if (mode === 'edit')     instruction = panel.querySelector('#tm-edit-input')?.value.trim() || '';
      if (mode === 'generate') instruction = panel.querySelector('#tm-gen-input')?.value.trim() || '';
      runRequest(panel, mode, instruction);
    });
  });

  // ── Revert to previous generation ──
  panel.querySelector('#tm-revert').addEventListener('mousedown', e => {
    e.preventDefault();
    if (genIndex >= 1) {
      genIndex--;
      lastResult = genResults[genIndex];
      showResult(panel, lastResult);
      updateRevert(panel);
    }
  });

  // ── Apply (replace field text with the current generation) ──
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

  // ── Expand → open history window ──
  panel.querySelector('.tm-expand').addEventListener('mousedown', e => {
    e.preventDefault();
    if (chrome.runtime?.getURL) {
      window.open(chrome.runtime.getURL('history.html'), '_blank');
    }
  });

  // Prefill the Generate prompt with whatever the user already typed in the
  // field — they may have started prompting there and want to continue (or
  // just hit Run).
  const genInput = panel.querySelector('#tm-gen-input');
  if (genInput) {
    genInput.value = getFullText();
    genInput.addEventListener('input', () => autoGrow(genInput));
    // grow to fit the prefilled text once the panel is in the DOM
    requestAnimationFrame(() => autoGrow(genInput));
  }

  return panel;
}

// ── Run request ───────────────────────────────────────────────────────────────

async function runRequest(panel, mode, instruction) {
  // After the first generation, keep iterating on the latest result instead of
  // the original field text — so repeated clicks upgrade the same draft.
  const chaining = genIndex >= 0 && mode !== 'generate';
  const text = chaining ? genResults[genIndex] : (getSelectedText() || getText());
  hideResult(panel);
  hideError(panel);

  const submitBtns = panel.querySelectorAll('.tm-submit, .tm-quick-btn');
  submitBtns.forEach(b => b.disabled = true);
  if (tmBtn) { tmBtn.classList.add('tm-loading'); }
  panel.querySelector('#tm-skeleton')?.classList.add('tm-visible');

  const targetLang = panel.querySelector('#tm-lang-select')?.value;

  const { result, error } = await chrome.runtime.sendMessage({
    type: 'AI_REQUEST',
    payload: { mode, text, instruction, targetLang }
  });

  submitBtns.forEach(b => b.disabled = false);
  if (tmBtn) { tmBtn.classList.remove('tm-loading'); }
  panel.querySelector('#tm-skeleton')?.classList.remove('tm-visible');

  if (error) {
    if (error === 'NO_API_KEY') {
      showError(panel, '⚠ No API key. Click the Pearl icon in your toolbar to add it.');
    } else {
      showError(panel, `Error: ${error}`);
    }
    return;
  }

  // Push onto the generation stack (dropping any reverted-forward entries).
  genResults = genResults.slice(0, genIndex + 1);
  genResults.push(result);
  genIndex = genResults.length - 1;

  lastResult = result;
  showResult(panel, result);
  updateRevert(panel);
}

function updateRevert(panel) {
  const btn = panel.querySelector('#tm-revert');
  if (btn) btn.style.display = genIndex >= 1 ? 'flex' : 'none';
}

// Grow a textarea to fit its content; CSS max-height (10 lines) caps it and
// turns on scrolling beyond that.
function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
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
