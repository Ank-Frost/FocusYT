# 🎯 FocusYT

**A Chrome extension that turns YouTube into a focused study tool.**

Block distractions, whitelist study channels, cap your daily leisure time, and lock yourself out when you've had enough — like Regain, but for YouTube on desktop.

---

## ✨ Features

- **📚 Channel-based study whitelist** — Mark channels as "study channels". They load freely with zero restrictions, forever.
- **🚫 Smart blocking** — Any non-study channel triggers a block overlay. You can add it to the study list right there, or go home.
- **⏱ Leisure session timer** — For non-study viewing, you must commit to a session length upfront (5 / 10 / 15 / 20 / 30 min). A live countdown shows in the corner.
- **📅 Daily leisure cap** — Set a daily limit yourself. Once it's used up, YouTube goes study-only until midnight auto-reset.
- **🏠 Clean homepage** — Recommendations and the feed are hidden. Only search works.
- **🔴 Study Mode toggle** — One-click hard lock in the popup. Only study channels are accessible. Turning it off requires your PIN.
- **🔐 PIN protection** — Settings and disabling Study Mode are PIN-gated so you can't cheat in a weak moment.
- **🌙 Auto-reset at midnight** — Daily usage resets automatically every night.

---

## 📸 How it looks

| Homepage | Block overlay | Session picker |
|---|---|---|
| Recommendations hidden, your study channels listed | Channel blocked with option to add it or go home | Choose how long you want to watch before video plays |

> The extension runs entirely locally — no data is sent anywhere, no accounts needed.

---

## 🚀 Installation

> The extension is not on the Chrome Web Store yet. Install it manually in under 2 minutes.

**Step 1** — Download this repo  
Click **Code → Download ZIP** and unzip it, or clone it:
```bash
git clone https://github.com/Ank-Frost/FocusYT.git
```

**Step 2** — Load into Chrome  
1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `focusyt` folder

**Step 3** — You're done  
The 🎯 icon appears in your toolbar. Pin it for easy access.

---

## ⚙️ First-time setup

1. Click 🎯 in the toolbar → click **⚙ Settings**
2. Default PIN is **`1234`** — **change it immediately** so you can't just walk past it
3. Set your **daily leisure cap** (e.g. 60 minutes)
4. Visit a YouTube channel you use for studying → FocusYT will prompt you to add it

---

## 🧭 Usage Guide

### Adding a study channel
1. Go to any YouTube channel (e.g. `youtube.com/@3blue1brown`)
2. FocusYT shows a block overlay with an **"➕ Add as Study Channel"** button
3. Click it — that channel is now permanently whitelisted

You can also add channels manually from the Settings page.

### Watching leisure content
1. Navigate to any non-study video
2. A session picker appears — choose **5 / 10 / 15 / 20 / 30 min**
3. A countdown timer appears in the bottom-right corner
4. When time's up, the video pauses and the picker appears again
5. Sessions count toward your daily cap

### Study Mode
- Click 🎯 → toggle **Study Mode ON**
- All non-study channels are immediately blocked — no timer, no session picker
- To turn it off, you need your PIN

### Daily cap
- Configured in Settings (default: 60 min)
- After you hit the cap, YouTube locks to study channels until midnight
- You can manually reset from Settings if needed

---

## 📁 Project Structure

```
focusyt/
├── manifest.json      # Chrome extension manifest (MV3)
├── background.js      # Service worker — state, alarms, time tracking
├── content.js         # Injected into YouTube — blocking logic, overlays, timer
├── content.css        # Styles for overlays, timer widget, home banner
├── popup.html/js/css  # Extension popup — mode toggle, usage stats, PIN pad
├── options.html/js/css # Settings page — daily cap, channels, PIN management
└── README.md
```

---

## 🔧 How it works

**State** is stored in `chrome.storage.local` — nothing leaves your browser.

**Time tracking** uses `chrome.alarms` which fires every minute to accrue leisure usage when a session is active. This works even when the browser window is in the background.

**Channel detection** works by scraping the channel link from the YouTube DOM after navigation (`yt-navigate-finish` event), with multiple CSS selector fallbacks to handle YouTube's layout changes.

**Button clicks** use event delegation with `data-fyt-action` attributes rather than inline `onclick` handlers — this is required because Chrome extensions run content scripts in an isolated JavaScript world, separate from the page's `window`.

---

## 🛠️ Troubleshooting

**Extension not reacting on YouTube?**  
Go to `chrome://extensions` → click the 🔄 refresh icon → reload YouTube.

**Channel not being detected on a video?**  
Wait 3–4 seconds after the video loads. YouTube is a single-page app and channel info loads asynchronously. Refreshing the page also helps.

**Forgot your PIN?**  
Go to `chrome://extensions` → FocusYT → click **"Service Worker"** → in the DevTools console run:
```js
chrome.storage.local.set({ pin: '1234' })
```
This resets your PIN to `1234`.

**Homepage banner not showing?**  
Reload the YouTube tab after installing or updating the extension.

---

## 🤝 Contributing

Pull requests are welcome! Some ideas for improvements:

- [ ] Chrome Web Store release
- [ ] Scheduled study mode (e.g. auto-enable 9am–6pm on weekdays)
- [ ] Export/import study channel list
- [ ] Stats page — weekly usage graphs
- [ ] Shorts-specific controls
- [ ] Support for YouTube Music

---

## 📄 License

MIT — do whatever you want with it.

---

*Built to solve a real problem: YouTube's algorithm is very good at its job, and willpower alone isn't enough. FocusYT puts a system in place so you don't have to rely on it.*
