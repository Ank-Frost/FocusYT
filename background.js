// ═══════════════════════════════════════════════════
//  FocusYT — Background Service Worker
// ═══════════════════════════════════════════════════

const DEFAULTS = {
  pin: '1234',
  dailyCapMinutes: 60,
  studyChannels: [],          // [{ id, name }]
  studyModeOn: false,
  dailyUsedSeconds: 0,
  sessionEndTime: null,       // ms timestamp
  lastResetDate: todayStr(),
  setupComplete: false,
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Init ────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(null);
  const patch = {};
  for (const [k, v] of Object.entries(DEFAULTS)) {
    if (!(k in existing)) patch[k] = v;
  }
  if (Object.keys(patch).length) await chrome.storage.local.set(patch);
  setupAlarms();
});

chrome.runtime.onStartup.addListener(() => {
  setupAlarms();
  checkDailyReset();
});

// ─── Alarms ─────────────────────────────────────
function setupAlarms() {
  chrome.alarms.clearAll(() => {
    // Track leisure usage every minute
    chrome.alarms.create('trackUsage', { periodInMinutes: 1 });
    // Midnight reset
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    chrome.alarms.create('dailyReset', {
      when: midnight.getTime(),
      periodInMinutes: 24 * 60,
    });
  });
}

async function checkDailyReset() {
  const { lastResetDate } = await chrome.storage.local.get('lastResetDate');
  if (lastResetDate !== todayStr()) {
    await chrome.storage.local.set({
      dailyUsedSeconds: 0,
      sessionEndTime: null,
      lastResetDate: todayStr(),
    });
    notifyYT({ type: 'DAILY_RESET' });
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'dailyReset') {
    await chrome.storage.local.set({
      dailyUsedSeconds: 0,
      sessionEndTime: null,
      lastResetDate: todayStr(),
    });
    notifyYT({ type: 'DAILY_RESET' });
    return;
  }

  if (alarm.name === 'trackUsage') {
    await checkDailyReset();
    const data = await chrome.storage.local.get([
      'sessionEndTime', 'dailyUsedSeconds', 'dailyCapMinutes', 'studyModeOn',
    ]);
    const now = Date.now();

    // If session is expired, clean it up
    if (data.sessionEndTime && now >= data.sessionEndTime) {
      await chrome.storage.local.set({ sessionEndTime: null });
      notifyYT({ type: 'SESSION_EXPIRED' });
      return;
    }

    // Active leisure session → accrue usage
    if (data.sessionEndTime && now < data.sessionEndTime && !data.studyModeOn) {
      const newUsed = (data.dailyUsedSeconds || 0) + 60;
      const capSec = (data.dailyCapMinutes || 60) * 60;
      if (newUsed >= capSec) {
        await chrome.storage.local.set({ dailyUsedSeconds: capSec, sessionEndTime: null });
        notifyYT({ type: 'CAP_REACHED' });
      } else {
        await chrome.storage.local.set({ dailyUsedSeconds: newUsed });
      }
    }
  }
});

// ─── Notify YouTube tabs ─────────────────────────
async function notifyYT(msg) {
  try {
    const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
    for (const t of tabs) chrome.tabs.sendMessage(t.id, msg).catch(() => {});
  } catch (_) {}
}

// ─── Message handler ─────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handle(msg).then(sendResponse).catch(e => sendResponse({ error: e.message }));
  return true;
});

async function handle(msg) {
  const data = await chrome.storage.local.get(null);

  switch (msg.type) {

    case 'GET_STATE':
      return buildState(data);

    case 'START_SESSION': {
      const endTime = Date.now() + msg.minutes * 60 * 1000;
      await chrome.storage.local.set({ sessionEndTime: endTime });
      return { ok: true, sessionEndTime: endTime };
    }

    case 'END_SESSION':
      await chrome.storage.local.set({ sessionEndTime: null });
      return { ok: true };

    case 'CHECK_CHANNEL': {
      const ch = (data.studyChannels || []).find(c => c.id === msg.channelId);
      return { isStudy: !!ch, channel: ch || null };
    }

    case 'ADD_STUDY_CHANNEL': {
      const list = [...(data.studyChannels || [])];
      if (!list.some(c => c.id === msg.channel.id)) {
        list.push(msg.channel);
        await chrome.storage.local.set({ studyChannels: list });
      }
      return { ok: true };
    }

    case 'REMOVE_STUDY_CHANNEL': {
      const list = (data.studyChannels || []).filter(c => c.id !== msg.channelId);
      await chrome.storage.local.set({ studyChannels: list });
      return { ok: true };
    }

    case 'VERIFY_PIN':
      return { valid: (data.pin || '1234') === String(msg.pin) };

    case 'SET_SETTINGS':
      await chrome.storage.local.set(msg.settings);
      return { ok: true };

    case 'TOGGLE_STUDY_MODE':
      await chrome.storage.local.set({
        studyModeOn: msg.on,
        ...(msg.on ? { sessionEndTime: null } : {}),
      });
      return { ok: true };

    case 'RESET_DAILY':
      await chrome.storage.local.set({ dailyUsedSeconds: 0, sessionEndTime: null });
      return { ok: true };

    default:
      return { error: 'Unknown: ' + msg.type };
  }
}

// ─── State builder ───────────────────────────────
function buildState(data) {
  const now = Date.now();
  const sessionEndTime = data.sessionEndTime || null;
  const sessionActive = !!(sessionEndTime && now < sessionEndTime);
  const sessionRemainingMs = sessionActive ? sessionEndTime - now : 0;
  const dailyCapSec = (data.dailyCapMinutes || 60) * 60;
  const dailyUsedSec = data.dailyUsedSeconds || 0;
  const capReached = dailyUsedSec >= dailyCapSec;

  return {
    studyModeOn: data.studyModeOn || false,
    studyChannels: data.studyChannels || [],
    dailyCapMinutes: data.dailyCapMinutes || 60,
    dailyCapSeconds: dailyCapSec,
    dailyUsedSeconds: dailyUsedSec,
    dailyRemainingSeconds: Math.max(0, dailyCapSec - dailyUsedSec),
    capReached,
    sessionActive,
    sessionRemainingMs,
    sessionEndTime,
    setupComplete: data.setupComplete || false,
    pin: data.pin || '1234',
  };
}
