# FanCode (unofficial) for LG webOS — install guide

An unofficial FanCode client for LG smart TVs. You sign in with **your own paid
FanCode account** (nothing is shared). Live matches, native playback, and
Widevine DRM support.

**Requirements**
- LG TV running **webOS 4.0 or newer**, **model year 2017+** (needed for the
  DRM-protected matches, e.g. LaLiga).
- Your own FanCode account with an active subscription.
- ~2 minutes for the one-time setup below.

---

## Easiest: install via Homebrew Channel (permanent, recommended)

1. On a computer, open **https://www.rootmytv.com** and follow the guided steps
   for your TV's webOS version. This installs the **Homebrew Channel** app on the
   TV. (It's reversible and widely used.)
2. On the TV, open **Homebrew Channel**.
3. Choose **Install app from URL** (or copy the `.ipk` to a USB stick and pick
   *Install from Storage*).
   - Latest package: **https://github.com/cjd9/Fancode-lgwebos/releases** (or the
     raw file:
     `https://github.com/cjd9/Fancode-lgwebos/raw/main/dist/com.clyde.fancode_1.0.0_all.ipk`)
4. It installs and appears in your TV's app list as **"FanCode (unofficial)"**
   (orange icon). Launch it.

Homebrew Channel installs are **permanent** — they survive reboots and don't
expire.

---

## First run

1. Launch **FanCode (unofficial)**.
2. It shows a **6-character code** and `fancode.com/tv/login`.
3. On your phone, open that URL, sign in with **your** FanCode account, and enter
   the code.
4. The **live match list** appears.

**Remote controls**
- **↑ / ↓** — move between matches
- **OK** — play the highlighted match
- **OK** (during playback) — pause / resume
- **▶▶ (fast-forward)** or **↑** — jump to the live edge
- **Back** — return to the list

---

## Notes & limitations

- **Live matches only** for now (no VOD/highlights yet).
- **Auto-updates aren't supported** — to update, install the newer `.ipk` the
  same way.
- **DRM matches** (some leagues, e.g. LaLiga) require a 2017+ TV with Widevine.
  Clear matches (many EPL/golf/tennis feeds) play on anything webOS 4+.
- If a match says *"Not live yet"*, it hasn't started — the list refreshes
  automatically every ~45s.
- This is a personal/unofficial client. Each user signs in with their own
  account; no credentials or streams are shared between installs.

---

## Alternative: Developer Mode (temporary — for a quick technical test)

If you don't want to install Homebrew Channel, a developer can sideload it, but
**Developer Mode expires after ~50 hours** and must be re-enabled, so it's only
good for short testing. Steps are in `DEPLOY.md` in the project (requires the
`@webos-tools/cli` and the TV's dev-mode passphrase).
