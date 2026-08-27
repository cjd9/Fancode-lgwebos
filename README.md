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

## Install (users)

The easiest, permanent method is the **Homebrew Channel**:

1. On a computer, open **https://www.rootmytv.com** and follow the guided steps
   for your TV's webOS version. This installs the **Homebrew Channel** app.
2. Grab the latest package: [`dist/com.clyde.fancode_1.0.0_all.ipk`](dist/com.clyde.fancode_1.0.0_all.ipk)
   (or from the repo's **Releases**).
3. In **Homebrew Channel** → **Install app from URL** (or copy the `.ipk` to a USB
   stick → *Install from Storage*).
4. Launch **FanCode (unofficial)** from your app list.

Full step-by-step (including remote controls): [`dist/INSTALL.md`](dist/INSTALL.md).

> Prefer sideloading via Developer Mode instead? See [`docs/DEPLOY.md`](docs/DEPLOY.md).
> Note that Developer Mode installs expire after ~50 hours; Homebrew Channel is permanent.

---

## Build from source (developers)

The app is plain HTML/JS/CSS — no build step, no framework.

```bash
npm install -g @webos-tools/cli          # LG's ares-* CLI (needs Node 18+)
git clone https://github.com/cjd9/Fancode-lgwebos.git
cd Fancode-lgwebos

# package the app/ folder into an .ipk
ares-package app -o dist

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
docs/DEPLOY.md              developer sideload / debug guide
scripts/probe.mjs           API diagnostic (device-code login → stream/DRM dump)
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
