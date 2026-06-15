// ═══════════════════════════════════════════════════
//  FocusYT — Popup Script
// ═══════════════════════════════════════════════════

let gState = null;
let pollTimer = null;
let pinBuffer = '';
let pinCallback = null;

// ─── Init ────────────────────────────────────────
async function init() {
  document.getElementById('dateStr').textContent = new Date().toLocaleDateString('en-IN', { weekday:'short', month:'short', day:'numeric' });
  gState = await bgMsg('GET_STATE');
  render();
  pollTimer = setInterval(async () => {
    gState = await bgMsg('GET_STATE');
    render();
  }, 1000);
}

// ─── Render ──────────────────────────────────────
function render() {
  if (!gState) return;
  renderModeCard();
  renderUsage();
  renderSession();
  renderChannelRow();
}

function renderModeCard() {
  const sw = document.getElementById('studySwitch');
  const title = document.getElementById('modeTitle');
  const desc = document.getElementById('modeDesc');
  const card = document.getElementById('modeCard');

  if (gState.studyModeOn) {
    sw.checked = true;
    title.textContent = '🔴 Study Mode ON';
    desc.textContent = 'Only study channels accessible';
    card.className = 'mode-card mode-study';
  } else if (gState.capReached) {
    sw.checked = false;
    title.textContent = '⛔ Daily Cap Reached';
    desc.textContent = 'Auto study-only until midnight';
    card.className = 'mode-card mode-capped';
  } else {
    sw.checked = false;
    title.textContent = '🟢 Leisure Mode';
    desc.textContent = 'Time limits apply to non-study channels';
    card.className = 'mode-card mode-leisure';
  }
}

function renderUsage() {
  const pct = gState.dailyCapSeconds > 0
    ? Math.min(100, (gState.dailyUsedSeconds / gState.dailyCapSeconds) * 100)
    : 0;
  const fill = document.getElementById('barFill');
  fill.style.width = pct + '%';
  fill.style.background = pct >= 100 ? '#ff4444' : pct > 70 ? '#ffaa00' : '#00c853';
  document.getElementById('usageTxt').textContent =
    `${fmtTime(gState.dailyUsedSeconds)} / ${fmtTime(gState.dailyCapSeconds)}`;
}

function renderSession() {
  const card = document.getElementById('sessionCard');
  if (gState.sessionActive && !gState.studyModeOn) {
    card.style.display = 'block';
    const secs = Math.max(0, Math.round(gState.sessionRemainingMs / 1000));
    const m = Math.floor(secs / 60), s = secs % 60;
    document.getElementById('sessionTime').textContent =
      `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  } else {
    card.style.display = 'none';
  }
}

function renderChannelRow() {
  const el = document.getElementById('chRow');
  const n = gState.studyChannels.length;
  el.textContent = n === 0
    ? '📚 No study channels yet — visit a YouTube channel to add one'
    : `📚 ${n} study channel${n !== 1 ? 's' : ''} saved`;
}

// ─── Study mode toggle ───────────────────────────
document.getElementById('studySwitch').addEventListener('change', async (e) => {
  const wantOn = e.target.checked;
  e.target.checked = gState.studyModeOn; // revert until confirmed

  if (wantOn && !gState.studyModeOn) {
    // Turning ON — no PIN needed
    await bgMsg({ type: 'TOGGLE_STUDY_MODE', on: true });
    gState = await bgMsg('GET_STATE');
    render();
  } else if (!wantOn && gState.studyModeOn) {
    // Turning OFF — need PIN
    requestPin('Enter PIN to disable Study Mode', async () => {
      await bgMsg({ type: 'TOGGLE_STUDY_MODE', on: false });
      gState = await bgMsg('GET_STATE');
      render();
    });
  }
});

// ─── End session ─────────────────────────────────
document.getElementById('btnEnd').addEventListener('click', async () => {
  await bgMsg({ type: 'END_SESSION' });
  gState = await bgMsg('GET_STATE');
  render();
});

// ─── Settings ────────────────────────────────────
document.getElementById('btnSettings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// ─── PIN pad ─────────────────────────────────────
function requestPin(titleText, onSuccess) {
  pinBuffer = '';
  pinCallback = onSuccess;
  document.getElementById('pinTitle').textContent = titleText;
  document.getElementById('pinErr').textContent = '';
  updatePinDots();
  document.getElementById('pinBackdrop').style.display = 'flex';
}

function updatePinDots() {
  const dots = document.querySelectorAll('#pinDots span');
  dots.forEach((d, i) => {
    d.className = i < pinBuffer.length ? 'filled' : '';
  });
}

document.querySelectorAll('.pin-key[data-v]').forEach(btn => {
  btn.addEventListener('click', async () => {
    if (pinBuffer.length >= 8) return;
    pinBuffer += btn.dataset.v;
    updatePinDots();
    document.getElementById('pinErr').textContent = '';

    // Auto-submit after 4 chars (or user keeps entering up to 8)
    if (pinBuffer.length >= 4) {
      const { valid } = await bgMsg({ type: 'VERIFY_PIN', pin: pinBuffer });
      if (valid) {
        document.getElementById('pinBackdrop').style.display = 'none';
        pinCallback && pinCallback();
      } else if (pinBuffer.length >= 4) {
        // Give brief moment before showing error (to handle longer PINs)
        setTimeout(async () => {
          if (pinBuffer.length === 0) return; // already cleared
          document.getElementById('pinErr').textContent = 'Incorrect PIN';
          pinBuffer = '';
          updatePinDots();
        }, 200);
      }
    }
  });
});

document.getElementById('pinDel').addEventListener('click', () => {
  if (pinBuffer.length > 0) {
    pinBuffer = pinBuffer.slice(0, -1);
    updatePinDots();
    document.getElementById('pinErr').textContent = '';
  }
});

document.getElementById('pinCancel').addEventListener('click', () => {
  pinBuffer = '';
  document.getElementById('pinBackdrop').style.display = 'none';
});

// ─── Helpers ─────────────────────────────────────
function bgMsg(payload) {
  const data = typeof payload === 'string' ? { type: payload } : payload;
  return new Promise(res => {
    chrome.runtime.sendMessage(data, resp => {
      if (chrome.runtime.lastError) { res(null); return; }
      res(resp);
    });
  });
}

function fmtTime(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

// ─── Boot ────────────────────────────────────────
window.addEventListener('unload', () => clearInterval(pollTimer));
init();
