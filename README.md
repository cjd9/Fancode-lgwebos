# FanCode for LG webOS (unofficial)

An unofficial **FanCode** client for LG smart TVs (webOS). FanCode ships Android,
Android TV, iOS and web apps — but **no webOS app** — so this is a small,
native-feeling TV client that talks to the same public FanCode GraphQL API.

You sign in with **your own paid FanCode account** using FanCode's standard TV
device-code flow. Nothing is shared between installs — each person logs in as
themselves.

> ⚠️ **Unofficial & personal-use.** Not affiliated with, endorsed by, or
> supported by FanCode. It uses your own account and streams; you're responsible
> for complying with FanCode's Terms of Service. No credentials or streams are
> shared. See [Disclaimer](#disclaimer).

---

## Features

- 📺 **Live matches** list, auto-refreshing every ~45s
- 🔐 **Device-code sign-in** (approve on your phone) with **silent token refresh**
- ▶️ **Native HLS playback** for clear streams (the TV's own media pipeline)
- 🛡️ **Widevine DRM** playback for protected matches (e.g. LaLiga) via
  [Shaka Player](https://github.com/shaka-project/shaka-player) + EME
- ⏯️ Remote-friendly controls: play/pause and **jump to live**

## Requirements

- LG TV on **webOS 4.0+**, **2017 or newer** (Widevine is needed for DRM matches;
  clear matches play on any webOS 4+).
- An active **FanCode** subscription (your own account).

---

## Install

### 📥 Download

**[`com.clyde.fancode_1.0.0_all.ipk`](https://github.com/cjd9/Fancode-lgwebos/raw/main/dist/com.clyde.fancode_1.0.0_all.ipk)** (137 KB)

---

### Option 1 — Developer Mode + webOS Dev Manager (easiest, works on any TV)

**No rooting required.** Dev Manager is a cross-platform GUI (macOS, Windows,
Linux) — download the `.ipk` above and install it with a few clicks.

**On the TV (one-time)**

1. Create a free developer account at **https://webostv.developer.lge.com**
   (sign in with an LG account).
2. **LG Content Store** → search **"Developer Mode"** → **Install** it.
3. Launch **Developer Mode**, log in with that account, set **Dev Mode Status → ON**
   (the TV restarts).
4. Reopen **Developer Mode** and turn on **Key Server**. Note the **IP address**
   and the **6-character passphrase** shown on screen — keep this screen up for
   the next step.

**On your computer**

5. Install **webOS Dev Manager**:
   **https://github.com/webosbrew/dev-manager-desktop/releases**
   (macOS `.dmg`, Windows `.msi`, Linux `.deb`/AppImage).
6. Open it → **Devices** → **Add new device…** and enter:

   | Field | Value |
   |---|---|
   | Device Name | `tv` (anything) |
   | **Username** | **`prisoner`** |
   | Address | your TV's IP (e.g. `192.168.0.228`) |
   | **Port** | **`9922`** |
   | Authentication | **Dev Mode** + the passphrase from step 4 |

   > ⚠️ Use `prisoner` / `9922`, **not** `root` / `22` — those are for *rooted*
   > TVs and will fail on a Developer Mode TV.

7. **Save**, then open the **Apps** tab → **Install** → choose the `.ipk` you
   downloaded.
8. Launch **FanCode (unofficial)** from your TV's app list.

**Good to know:** Developer Mode has a **1000-hour timer** (~41 days). If it
lapses, apps installed this way are removed — but you can reset the timer in the
Developer Mode app, so this works fine long-term. Note you can only be logged
into **one TV per developer account**.

---

### Option 2 — Homebrew Channel repository (permanent, needs a rooted TV)

If your TV is rooted, add this repo once and get 1-click install **plus update
prompts**:

1. Check whether your TV can be rooted at **https://cani.rootmy.tv/** (enter your
   model + firmware) and follow the exploit it recommends. Rooting installs the
   **Homebrew Channel** automatically.
2. **Homebrew Channel → Settings → Add repository**, enter:
   ```
   https://raw.githubusercontent.com/cjd9/Fancode-lgwebos/main/repo/api/apps.json
   ```
3. **FanCode (unofficial)** appears in the app list — select it → **Install**.
4. Launch it from your TV's app list.

Installs on a rooted TV are **permanent** — no timer, and updates come through
the channel.

---

Full step-by-step (including remote controls and an SSH install method):
[`dist/INSTALL.md`](dist/INSTALL.md).

---

## Build from source (developers)

The app is plain HTML/JS/CSS — no build step, no framework.

```bash
npm install -g @webos-tools/cli          # LG's ares-* CLI (needs Node 18+)
git clone https://github.com/cjd9/Fancode-lgwebos.git
cd Fancode-lgwebos

# package the app/ folder into an .ipk
ares-package app -o dist

# refresh the self-hosted repo manifest + hash to match the new build
node scripts/update-repo.mjs

# register your TV once (IP + dev-mode passphrase from the Developer Mode app)
ares-setup-device
ares-novacom --device <name> --getkey

# install & launch
ares-install --device <name> dist/com.clyde.fancode_1.0.0_all.ipk
ares-launch  --device <name> com.clyde.fancode
```

See [`docs/DEPLOY.md`](docs/DEPLOY.md) for the detailed deploy/debug loop
(`ares-inspect` gives you Chrome DevTools pointed at the TV).

### Project layout

```
app/
  appinfo.json              webOS app manifest
  index.html                three screens: login / home / player
  js/api.js                 FanCode GraphQL client (auth, refresh, streams)
  js/app.js                 screen flow + D-pad navigation + player
  css/style.css             TV layout (viewport-relative units)
  lib/shaka-player.*.js      Shaka Player 3.3.0 (Widevine EME)
  icon.png / largeIcon.png  launcher icons
dist/                       prebuilt .ipk + user install guide
repo/                       self-hosted webosbrew repository (apps.json + manifest)
docs/DEPLOY.md              developer sideload / debug guide
scripts/probe.mjs           API diagnostic (device-code login → stream/DRM dump)
scripts/update-repo.mjs     regenerates repo/ manifest + hash after a new build
```

---

## How it works

- **API** — a single GraphQL endpoint (`www.fancode.com/graphql`). The client
  sends the same headers the TV app uses and an `Authorization: Bearer` token.
- **Auth** — TV **device-code** flow: `getDeviceCode` → you approve on
  `fancode.com/tv/login` → `deviceAuthenticate` returns access + refresh tokens.
  Access tokens are short-lived; the client decodes the JWT expiry and refreshes
  via `refreshTokenAuthV2` before each call (with a reactive retry).
- **Discovery** — `matchesHasLivestream` returns the current live/upcoming list.
- **Playback** — `fanLiveStream` returns a stream `url` plus, for protected
  content, a `drm` block (Widevine license URL + `nv-authorizations` header).
  Clear streams play via native `<video>`; DRM streams via Shaka Player, which
  injects the license headers on the EME request.

`scripts/probe.mjs` is a standalone Node script that walks this whole pipeline
from the command line — handy for debugging. It needs your own login and prints
only non-secret stream/DRM fields (tokens are stored locally and git-ignored).

---

## Known limitations

- **Live only** — no VOD / highlights yet.
- **No auto-update** — install a newer `.ipk` to update.
- **Long matches** — the stream session (CDN + DRM tokens) expires after ~1h;
  mid-stream re-acquisition isn't wired yet, so a very long match may need a
  re-open. (Access-token refresh *is* handled.)
- **DRM matches** need a 2017+ Widevine-capable TV.

---

## Disclaimer

This project is an independent, unofficial client provided for personal use and
interoperability. "FanCode" and related marks belong to their respective owners.
This repository contains **no** FanCode code, assets, credentials, or stream
data — only an independent client that authenticates with your own account. Use
it in accordance with FanCode's Terms of Service and your local laws.

## License

App code: [MIT](LICENSE). Bundled [Shaka Player](https://github.com/shaka-project/shaka-player)
is Apache-2.0 — see [THIRD_PARTY.md](THIRD_PARTY.md).
