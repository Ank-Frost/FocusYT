// ═══════════════════════════════════════════════════
//  FocusYT — Content Script  (fixed v2)
// ═══════════════════════════════════════════════════

let gState = null;
let lastUrl = '';
let currentChannelId = null;
let currentChannelName = null;
let timerInterval = null;
let videoPauseGuard = null;

// ─── Boot ────────────────────────────────────────
document.addEventListener('yt-navigate-finish', onNavigate);
setTimeout(onNavigate, 800);

// Background messages
chrome.runtime.onMessage.addListener((m) => {
  if (m.type === 'SESSION_EXPIRED') onSessionExpired();
  else if (m.type === 'CAP_REACHED') onCapReached();
  else if (m.type === 'DAILY_RESET') clearUI();
});

// ─── SINGLE event-delegation listener ────────────
// FIX: Content scripts run in an isolated world — inline onclick="window.__fyt()"
// does NOT work because the page window and content-script window are separate.
// Solution: all buttons use data-fyt-action attributes + one delegated listener here.
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-fyt-action]');
  if (!btn) return;
  e.stopPropagation();
  const action = btn.dataset.fytAction;
  const val    = btn.dataset.fytVal;
  switch (action) {
    case 'start-session': await doStartSession(parseInt(val, 10)); break;
    case 'go-home':       doGoHome();                               break;
    case 'add-channel':   await doAddChannel();                     break;
    case 'end-session':   await doEndSession();                     break;
  }
}, true); // capture phase so overlay gets click before YouTube's own handlers

// ─── Navigation handler ──────────────────────────
async function onNavigate() {
  const url = location.href;
  if (url === lastUrl) return;
  lastUrl = url;

  clearOverlay();
  clearStudyBadge();
  currentChannelId   = null;
  currentChannelName = null;

  gState = await bgMsg('GET_STATE');
  if (!gState) return;

  if (isHome(url))   { doHomePage(); hideTimer(); return; }
  if (isSearch(url)) { if (gState.sessionActive && !gState.studyModeOn) showTimer(); return; }
  if (isVideo(url) || isShorts(url) || isChannel(url)) await doContentPage(url);
}

// ─── Page type helpers ───────────────────────────
const isHome    = u => /^https:\/\/www\.youtube\.com\/?(\?.*)?$/.test(u)
  && !u.includes('/watch') && !u.includes('/results')
  && !u.includes('/shorts') && !u.includes('/@') && !u.includes('/channel/');
const isSearch  = u => u.includes('/results');
const isVideo   = u => u.includes('/watch?');
const isShorts  = u => u.includes('/shorts/');
const isChannel = u => /youtube\.com\/@[\w.-]+/.test(u) || /youtube\.com\/channel\/[\w-]+/.test(u);

// ─── Content page logic ──────────────────────────
async function doContentPage(url) {
  // 1. Detect channel
  if (isChannel(url)) {
    const m = url.match(/youtube\.com(\/@[\w.-]+|\/channel\/[\w-]+)/);
    if (m) {
      currentChannelId = m[1].split('?')[0];
      await waitFor(
        'ytd-channel-name yt-formatted-string, #channel-header ytd-channel-name',
        el => { currentChannelName = el.textContent.trim(); },
        6000
      );
    }
  } else {
    const selectors = isVideo(url)
      ? ['#upload-info ytd-channel-name a', 'ytd-video-owner-renderer ytd-channel-name a',
         '#channel-name a[href*="/@"]', '#channel-name a[href*="/channel/"]']
      : ['ytd-reel-player-overlay-renderer ytd-channel-name a',
         'ytd-reel-player-header-renderer a[href*="/@"]'];

    for (const sel of selectors) {
      await waitFor(sel, el => {
        const href = el.getAttribute('href');
        if (href) {
          currentChannelId   = href.split('?')[0];
          currentChannelName = el.textContent.trim() || el.querySelector('span')?.textContent?.trim() || '';
        }
      }, 350);
      if (currentChannelId) break;
    }

    if (!currentChannelId) {
      await waitFor(
        '#upload-info ytd-channel-name a, ytd-video-owner-renderer #channel-name a',
        el => {
          const href = el.getAttribute('href');
          if (href) { currentChannelId = href.split('?')[0]; currentChannelName = el.textContent.trim(); }
        },
        8000
      );
    }
  }

  // 2. Fresh state
  gState = await bgMsg('GET_STATE');

  // 3. Unknown channel
  if (!currentChannelId) { applyLeisureRules(); return; }

  // 4. Study channel → free pass
  const { isStudy } = await bgMsg({ type: 'CHECK_CHANNEL', channelId: currentChannelId });
  if (isStudy) { hideTimer(); showStudyBadge(); return; }

  // 5. Blocked
  if (gState.studyModeOn || gState.capReached) {
    pauseVideo(true);
    showBlockOverlay();
    return;
  }

  applyLeisureRules();
}

function applyLeisureRules() {
  if (gState.sessionActive) showTimer();
  else { pauseVideo(true); showSessionPicker(); }
}

// ─── Homepage ────────────────────────────────────
function doHomePage() {
  injectHomeCSS();
  renderHomeBanner();
}

function injectHomeCSS() {
  if (document.getElementById('fyt-home-css')) return;
  const s = document.createElement('style');
  s.id = 'fyt-home-css';
  s.textContent = `
    ytd-browse[page-subtype="home"] ytd-rich-grid-renderer,
    ytd-browse[page-subtype="home"] #contents.ytd-rich-grid-renderer {
      visibility: hidden !important;
      pointer-events: none !important;
    }
  `;
  document.head.appendChild(s);
}

function renderHomeBanner() {
  if (document.getElementById('fyt-home-banner')) { refreshHomeBanner(); return; }
  const tryPlace = () => {
    const browse = document.querySelector('ytd-browse[page-subtype="home"]');
    if (!browse) { setTimeout(tryPlace, 500); return; }
    const div = document.createElement('div');
    div.id = 'fyt-home-banner';
    div.innerHTML = `
      <div class="fyt-home-inner">
        <div class="fyt-home-hero">🎯</div>
        <h1 class="fyt-home-title">FocusYT</h1>
        <p class="fyt-home-sub">Recommendations hidden. Search or visit a study channel.</p>
        <div class="fyt-home-stats" id="fyt-stats">…</div>
        <div class="fyt-home-channels" id="fyt-channels">…</div>
      </div>`;
    browse.prepend(div);
    refreshHomeBanner();
  };
  tryPlace();
}

async function refreshHomeBanner() {
  const s = await bgMsg('GET_STATE');
  if (!s) return;
  const statsEl = document.getElementById('fyt-stats');
  if (statsEl) {
    const pct = Math.min(100, Math.round((s.dailyUsedSeconds / s.dailyCapSeconds) * 100));
    const modeTag = s.studyModeOn
      ? '<span class="fyt-tag fyt-tag-study">🔴 Study Mode</span>'
      : s.capReached
        ? '<span class="fyt-tag fyt-tag-capped">⛔ Daily cap reached</span>'
        : '<span class="fyt-tag fyt-tag-leisure">🟢 Leisure Mode</span>';
    statsEl.innerHTML = `
      ${modeTag}
      <span class="fyt-tag">⏱ ${fmt(s.dailyUsedSeconds)} / ${fmt(s.dailyCapSeconds)} used today</span>
      <div class="fyt-home-bar"><div class="fyt-home-bar-fill"
        style="width:${pct}%;background:${pct>=100?'#ff4444':pct>75?'#ffaa00':'#00c853'}"></div></div>`;
  }
  const chEl = document.getElementById('fyt-channels');
  if (!chEl) return;
  if (s.studyChannels.length === 0) {
    chEl.innerHTML = `<p class="fyt-hint">No study channels yet — visit any YouTube channel and tap "Add as Study Channel".</p>`;
  } else {
    chEl.innerHTML = `
      <p class="fyt-hint" style="margin-bottom:10px">📚 Study Channels</p>
      <div class="fyt-pills">${s.studyChannels.map(c =>
        `<a href="https://www.youtube.com${c.id}" class="fyt-pill">${esc(c.name)}</a>`
      ).join('')}</div>`;
  }
}

// ─── Block overlay ───────────────────────────────
// FIX: Always shows "Add as Study Channel" button even in study-mode / cap-reached state.
// This solves the chicken-and-egg problem where you need to visit a channel to whitelist it.
function showBlockOverlay() {
  const name = esc(currentChannelName || currentChannelId || 'This channel');
  const isCapReached = gState.capReached;
  const icon  = isCapReached ? '⏰' : '🔒';
  const title = isCapReached ? '⏰ Daily Limit Reached!' : '🔒 Study Mode Active';
  const body  = isCapReached
    ? `You've used all your leisure time today.<br>Only <strong>study channels</strong> are accessible now.`
    : `<strong>${name}</strong> is not in your study channel list.`;

  // Always show Add button — even when cap reached — so user can whitelist new channels
  const addBtn = currentChannelId
    ? `<button class="fyt-btn fyt-btn-green" data-fyt-action="add-channel">➕ Add as Study Channel</button>`
    : '';

  const wrap = document.createElement('div');
  wrap.id = 'fyt-overlay';
  wrap.innerHTML = `
    <div class="fyt-modal">
      <div class="fyt-modal-icon">${icon}</div>
      <h2>${title}</h2>
      <p>${body}</p>
      <div class="fyt-btns">
        ${addBtn}
        <button class="fyt-btn fyt-btn-ghost" data-fyt-action="go-home">🏠 Go to Home</button>
      </div>
    </div>`;
  document.getElementById('fyt-overlay')?.remove();
  document.body.appendChild(wrap);
  startVideoPauseGuard();
}

// ─── Session expired ──────────────────────────────
function onSessionExpired() {
  hideTimer();
  if (gState) gState.sessionActive = false;
  if (isHome(location.href) || isSearch(location.href)) return;
  pauseVideo(true);
  showOverlay(buildSessionPickerEl("⌛ Session Time's Up!", 'Your leisure session ended. Start another?', true));
}

function onCapReached() {
  hideTimer();
  if (gState) { gState.capReached = true; gState.sessionActive = false; }
  pauseVideo(true);
  const el = document.createElement('div');
  el.innerHTML = `
    <div class="fyt-modal">
      <div class="fyt-modal-icon">⏰</div>
      <h2>Daily Limit Reached!</h2>
      <p>You've used all your leisure time for today.<br>Only <strong>study channels</strong> are available now.</p>
      <div class="fyt-btns">
        <button class="fyt-btn fyt-btn-ghost" data-fyt-action="go-home">🏠 Go to Home</button>
      </div>
    </div>`;
  showOverlay(el);
}

// ─── Session picker ──────────────────────────────
function showSessionPicker() {
  showOverlay(buildSessionPickerEl('🎬 How long will you watch?', "This isn't a study channel. Set a time limit to stay focused.", false));
}

function buildSessionPickerEl(title, subtitle, isExpiry) {
  const remaining = gState ? fmt(gState.dailyRemainingSeconds) : '—';
  const remSec    = gState ? gState.dailyRemainingSeconds : 9999;
  const times     = [5, 10, 15, 20, 30];
  const available = times.filter(m => m * 60 <= remSec + 60);

  const el = document.createElement('div');

  if (!available.length && !isExpiry) {
    el.innerHTML = `
      <div class="fyt-modal">
        <div class="fyt-modal-icon">⏰</div>
        <h2>Almost Out of Time</h2>
        <p>Only <strong>${remaining}</strong> left today.</p>
        <div class="fyt-btns">
          <button class="fyt-btn fyt-btn-ghost" data-fyt-action="go-home">🏠 Go to Home</button>
        </div>
      </div>`;
    return el;
  }

  const showTimes = isExpiry ? times : (available.length ? available : times);
  const timeBtns  = showTimes
    .map(m => `<button class="fyt-time-btn" data-fyt-action="start-session" data-fyt-val="${m}">${m} min</button>`)
    .join('');

  el.innerHTML = `
    <div class="fyt-modal">
      <div class="fyt-modal-icon">${isExpiry ? '⌛' : '🎬'}</div>
      <h2>${title}</h2>
      <p>${subtitle}</p>
      ${!isExpiry ? `<p class="fyt-remaining-hint">Daily time left: <strong>${remaining}</strong></p>` : ''}
      <div class="fyt-time-grid">${timeBtns}</div>
      <div class="fyt-btns" style="margin-top:16px">
        <button class="fyt-btn fyt-btn-ghost" data-fyt-action="go-home">🏠 Go Home Instead</button>
      </div>
    </div>`;
  return el;
}

// ─── Action implementations ───────────────────────
async function doStartSession(minutes) {
  const res = await bgMsg({ type: 'START_SESSION', minutes });
  if (res && res.ok) {
    gState = await bgMsg('GET_STATE');
    clearOverlay();
    stopVideoPauseGuard();
    showTimer();
  }
}

function doGoHome() {
  clearOverlay();
  location.href = 'https://www.youtube.com/';
}

async function doAddChannel() {
  if (!currentChannelId) return;
  await bgMsg({ type: 'ADD_STUDY_CHANNEL', channel: { id: currentChannelId, name: currentChannelName || currentChannelId } });
  gState = await bgMsg('GET_STATE');
  clearOverlay();
  stopVideoPauseGuard();
  showStudyBadge();
}

async function doEndSession() {
  await bgMsg({ type: 'END_SESSION' });
  hideTimer();
  gState = await bgMsg('GET_STATE');
  pauseVideo(true);
  showOverlay(buildSessionPickerEl('⌛ Session Ended', 'Session manually ended. Start another?', true));
}

// ─── Timer widget ────────────────────────────────
function showTimer() {
  if (!gState || !gState.sessionActive) return;
  hideTimer();
  const el = document.createElement('div');
  el.id = 'fyt-timer';
  el.innerHTML = `
    <div class="fyt-timer-inner">
      <span class="fyt-timer-label">⏱ Leisure</span>
      <span class="fyt-timer-val" id="fyt-timer-val">--:--</span>
      <button class="fyt-timer-x" data-fyt-action="end-session" title="End session">✕</button>
    </div>`;
  document.body.appendChild(el);
  tickTimer();
  timerInterval = setInterval(() => {
    if (!gState || !gState.sessionEndTime || Date.now() >= gState.sessionEndTime) { hideTimer(); return; }
    gState.sessionRemainingMs = gState.sessionEndTime - Date.now();
    tickTimer();
  }, 1000);
}

function tickTimer() {
  const el = document.getElementById('fyt-timer-val');
  if (!el || !gState) return;
  const secs = Math.max(0, Math.round((gState.sessionRemainingMs || 0) / 1000));
  const m = Math.floor(secs / 60), s = secs % 60;
  el.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  el.style.color  = secs <= 60 ? '#ff4444' : '#ffffff';
}

function hideTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  document.getElementById('fyt-timer')?.remove();
}

// ─── Study badge ─────────────────────────────────
function showStudyBadge() {
  clearStudyBadge();
  const b = document.createElement('div');
  b.id = 'fyt-badge';
  b.textContent = '📚 Study Channel';
  document.body.appendChild(b);
  setTimeout(() => b.remove(), 3000);
}
function clearStudyBadge() { document.getElementById('fyt-badge')?.remove(); }

// ─── Video pause guard ───────────────────────────
function pauseVideo(startGuard = false) {
  const v = document.querySelector('video');
  if (v && !v.paused) v.pause();
  if (startGuard) startVideoPauseGuard();
}

function startVideoPauseGuard() {
  stopVideoPauseGuard();
  videoPauseGuard = setInterval(() => {
    if (!document.getElementById('fyt-overlay')) { stopVideoPauseGuard(); return; }
    const v = document.querySelector('video');
    if (v && !v.paused) v.pause();
  }, 500);
}

function stopVideoPauseGuard() {
  if (videoPauseGuard) { clearInterval(videoPauseGuard); videoPauseGuard = null; }
}

// ─── Overlay helper ───────────────────────────────
function showOverlay(content) {
  clearOverlay();
  const wrap = document.createElement('div');
  wrap.id = 'fyt-overlay';
  if (typeof content === 'string') wrap.innerHTML = content;
  else wrap.appendChild(content);
  document.body.appendChild(wrap);
}

function clearOverlay() {
  document.getElementById('fyt-overlay')?.remove();
  stopVideoPauseGuard();
}

function clearUI() { clearOverlay(); hideTimer(); }

// ─── Tiny helpers ─────────────────────────────────
function fmt(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function esc(str) {
  return String(str || '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function bgMsg(payload) {
  const data = typeof payload === 'string' ? { type: payload } : payload;
  return new Promise(res => {
    chrome.runtime.sendMessage(data, resp => {
      if (chrome.runtime.lastError) { res(null); return; }
      res(resp);
    });
  });
}

function waitFor(selector, cb, timeout = 5000) {
  return new Promise(resolve => {
    const deadline = Date.now() + timeout;
    const check = () => {
      const el = document.querySelector(selector);
      if (el) { cb(el); resolve(el); return; }
      if (Date.now() >= deadline) { resolve(null); return; }
      setTimeout(check, 300);
    };
    check();
  });
}
