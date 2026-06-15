# 🎯 FocusYT — Chrome Extension

**Block YouTube distractions. Study channels only in Focus Mode. Daily leisure cap. PIN-protected.**

Inspired by Regain for Android — this is your desktop version.

---

## ⚡ Installation (Takes 2 minutes)

1. **Open Chrome** and go to: `chrome://extensions`
2. Toggle **"Developer mode"** ON (top-right corner)
3. Click **"Load unpacked"**
4. Select the `focusyt` folder you downloaded
5. Done! The 🎯 icon appears in your toolbar.

---

## 🚀 How to use

### First time setup
- Click the 🎯 icon → go to **⚙ Settings**
- Default PIN is **`1234`** — change it immediately
- Set your **daily leisure cap** (e.g. 60 minutes)

### Adding study channels
1. Visit any YouTube channel (e.g. `youtube.com/@3blue1brown`)
2. FocusYT will show a popup — click **"Add to Study Channels"**
3. That channel now has zero restrictions forever

### Study Mode
- Click 🎯 → toggle **Study Mode ON** (red)
- Only study channels are accessible — everything else is blocked
- Turning it OFF requires your PIN

### Leisure sessions
- When you visit a non-study video/channel, FocusYT asks: **5 / 10 / 15 / 20 / 30 min?**
- A countdown timer shows in the bottom-right corner
- When time's up → video pauses, session picker reappears

### Daily cap
- After your daily limit is used up → YouTube goes study-only until midnight
- Resets automatically every day at midnight

### Settings (PIN protected)
- Change daily cap
- Manage study channels (add/remove)
- Change PIN
- Reset today's usage counter

---

## 🔒 Security note
The PIN prevents casual bypass. For strongest focus, also:
- Remove the extension from the extensions shortcut list
- Use Chrome's "Guest Mode" profile for deep work sessions

---

## 📋 Features

| Feature | Details |
|---|---|
| Channel whitelist | Add channels as "study" — no restrictions apply |
| Homepage clean | Recommendations hidden, only search works |
| Session picker | Choose 5/10/15/20/30 min for leisure viewing |
| Live countdown | Timer widget while leisure session is active |
| Daily cap | Configurable, resets at midnight |
| Study Mode | Hard lock — only study channels accessible |
| PIN protection | Required to turn off Study Mode or change settings |
| Auto-lock | Cap reached → auto study-only rest of day |

---

## 🛠 Troubleshooting

**Extension not working on YouTube?**
→ Reload the extension at `chrome://extensions` and refresh YouTube

**Forgot PIN?**
→ Go to `chrome://extensions` → FocusYT → click **"Service Worker"** → in console run:
```js
chrome.storage.local.set({ pin: '1234' })
```

**Channel not being detected?**
→ Wait 3–4 seconds after the video loads, or try refreshing. YouTube is a SPA and channel info loads asynchronously.
