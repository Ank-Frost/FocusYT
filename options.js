// ═══════════════════════════════════════════════════
//  FocusYT — Options Script
// ═══════════════════════════════════════════════════

let gState = null;

// ─── PIN Gate ────────────────────────────────────
document.getElementById('gateBtn').addEventListener('click', tryUnlock);
document.getElementById('gatePin').addEventListener('keydown', e => {
  if (e.key === 'Enter') tryUnlock();
});

async function tryUnlock() {
  const pin = document.getElementById('gatePin').value.trim();
  if (!pin) return;
  const { valid } = await bgMsg({ type: 'VERIFY_PIN', pin });
  if (valid) {
    document.getElementById('pinGate').style.display = 'none';
    document.getElementById('settingsPage').style.display = 'block';
    initSettings();
  } else {
    const err = document.getElementById('gateErr');
    err.textContent = 'Incorrect PIN. Try again.';
    document.getElementById('gatePin').value = '';
    setTimeout(() => { err.textContent = ''; }, 2500);
  }
}

// ─── Settings init ───────────────────────────────
async function initSettings() {
  gState = await bgMsg('GET_STATE');
  if (!gState) return;

  document.getElementById('capInput').value = gState.dailyCapMinutes || 60;
  renderChannelList(gState.studyChannels || []);
}

// ─── Daily Cap ───────────────────────────────────
document.getElementById('btnSaveCap').addEventListener('click', saveCap);
document.getElementById('capInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') saveCap();
});

async function saveCap() {
  const val = parseInt(document.getElementById('capInput').value);
  if (isNaN(val) || val < 5 || val > 480) {
    showMsg('capMsg', '⚠ Enter a value between 5 and 480 minutes.', 'err');
    return;
  }
  await bgMsg({ type: 'SET_SETTINGS', settings: { dailyCapMinutes: val } });
  showMsg('capMsg', '✓ Daily cap saved!', 'ok');
}

window.setCap = function(min) {
  document.getElementById('capInput').value = min;
  saveCap();
};

// ─── Study Channels ──────────────────────────────
function renderChannelList(channels) {
  const el = document.getElementById('channelList');
  if (!channels || channels.length === 0) {
    el.innerHTML = '<p class="empty-list">No study channels yet. Visit a YouTube channel while FocusYT is active.</p>';
    return;
  }
  el.innerHTML = channels.map(ch => `
    <div class="channel-item" id="chi-${safeId(ch.id)}">
      <div class="channel-info">
        <span class="channel-icon">📺</span>
        <div>
          <div class="channel-name">${esc(ch.name)}</div>
          <div class="channel-id">${esc(ch.id)}</div>
        </div>
      </div>
      <button class="btn-remove" onclick="removeChannel('${esc(ch.id)}')">✕</button>
    </div>`).join('');
}

window.removeChannel = async function(channelId) {
  if (!confirm(`Remove "${channelId}" from study channels?`)) return;
  await bgMsg({ type: 'REMOVE_STUDY_CHANNEL', channelId });
  gState = await bgMsg('GET_STATE');
  renderChannelList(gState.studyChannels);
  showMsg('addMsg', '✓ Channel removed.', 'ok');
};

// Manual add
document.getElementById('btnAddManual').addEventListener('click', async () => {
  const raw = document.getElementById('manualUrl').value.trim();
  if (!raw) { showMsg('addMsg', '⚠ Enter a channel URL or handle.', 'err'); return; }

  // Extract ID from URL like https://youtube.com/@channelname or /@name or /channel/xxx
  let channelId = null;
  let channelName = null;

  const match = raw.match(/(@[\w.-]+|\/channel\/[\w-]+)/);
  if (match) {
    channelId = match[0].startsWith('/') ? match[0] : '/' + match[0];
    channelName = channelId.replace('/channel/', '').replace('/@', '@');
  } else if (raw.startsWith('@')) {
    channelId = '/' + raw;
    channelName = raw;
  }

  if (!channelId) {
    showMsg('addMsg', '⚠ Invalid URL. Use youtube.com/@channelname format.', 'err');
    return;
  }

  await bgMsg({ type: 'ADD_STUDY_CHANNEL', channel: { id: channelId, name: channelName } });
  document.getElementById('manualUrl').value = '';
  gState = await bgMsg('GET_STATE');
  renderChannelList(gState.studyChannels);
  showMsg('addMsg', `✓ Added ${channelName} to study channels!`, 'ok');
});

// ─── Change PIN ──────────────────────────────────
document.getElementById('btnChangePin').addEventListener('click', async () => {
  const p1 = document.getElementById('newPin1').value;
  const p2 = document.getElementById('newPin2').value;

  if (!/^\d{4,8}$/.test(p1)) {
    showMsg('pinMsg', '⚠ PIN must be 4–8 digits.', 'err'); return;
  }
  if (p1 !== p2) {
    showMsg('pinMsg', '⚠ PINs do not match.', 'err'); return;
  }

  await bgMsg({ type: 'SET_SETTINGS', settings: { pin: p1 } });
  document.getElementById('newPin1').value = '';
  document.getElementById('newPin2').value = '';
  showMsg('pinMsg', '✓ PIN changed successfully!', 'ok');
});

// ─── Reset daily usage ───────────────────────────
document.getElementById('btnReset').addEventListener('click', async () => {
  if (!confirm('Reset today\'s leisure usage counter to zero?')) return;
  await bgMsg({ type: 'RESET_DAILY' });
  gState = await bgMsg('GET_STATE');
  showMsg('resetMsg', '✓ Daily usage reset.', 'ok');
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

function showMsg(id, text, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = 'save-msg ' + (type === 'err' ? 'msg-err' : 'msg-ok');
  setTimeout(() => { el.textContent = ''; el.className = 'save-msg'; }, 3000);
}

function esc(str) {
  return String(str || '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function safeId(str) {
  return String(str).replace(/[^a-zA-Z0-9]/g, '_');
}
