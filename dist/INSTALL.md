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

1. Install the **Homebrew Channel** on the TV. On a computer, open
   **https://cani.rootmy.tv/** and enter your TV model + firmware — it tells you
   which exploit works for your set and links the guided steps. (The classic
   **https://rootmy.tv/** method still works on some TVs but is patched on many,
   so use the checker first.) This is reversible and widely used.
   Rooting installs the **Homebrew Channel** app automatically.
2. Download the app package (`.ipk`) to your computer:
   `https://github.com/cjd9/Fancode-lgwebos/raw/main/dist/com.clyde.fancode_1.0.0_all.ipk`
   (or from the repo's **Releases**).
3. Install it on the TV using one of these — the Homebrew Channel itself is an app
   *catalog*, so you install a custom `.ipk` with one of the tools below, not from
   a URL box inside it:

   **Option A — Dev Manager Desktop (easiest, no command line)**
   1. Install **webOS Dev Manager**: https://github.com/webosbrew/dev-manager-desktop/releases
      (macOS `.dmg`, Windows `.msi`, Linux `.deb`/AppImage).
   2. Open it — it auto-detects your TV on the network and connects (rooted TVs
      connect over SSH automatically).
   3. Go to the **Apps** tab → **Install** → pick the `.ipk` you downloaded. Done.

   **Option B — SSH one-liner (rooted TVs, installs straight from the URL)**
   ```sh
   ssh root@<TV-IP>        # default password: alpine  (until you add an SSH key)
   luna-send-pub -n 1 'luna://org.webosbrew.hbchannel.service/install' \
     '{"ipkUrl":"https://github.com/cjd9/Fancode-lgwebos/raw/main/dist/com.clyde.fancode_1.0.0_all.ipk","subscribe":true}'
   ```

4. It appears in your TV's app list as **"FanCode (unofficial)"** (orange icon).
   Launch it.

Installs on a rooted TV are **permanent** — they survive reboots and don't expire.

### If your TV can't be rooted

Rooting is patched on newer LG firmware, so **`cani.rootmy.tv` may report that no
exploit is available for your model**. That's an LG platform limitation — there's
no way around it for the permanent install. Your options then are:

- **Don't update, or downgrade, the TV firmware** — if a known-rootable firmware
  exists for your model, `cani.rootmy.tv` will say so. (Downgrading isn't always
  possible and is at your own risk.)
- **Use Developer Mode instead** (see the bottom of this guide). It works on any
  TV, but the install **expires after ~50 hours** and must be re-enabled, and it
  needs a computer with LG's CLI — fine for occasional viewing, tedious for daily
  use.
- **Watch on another device** you already own (phone/Android TV/web) — nothing
  here changes your FanCode account.

There is unfortunately no un-rooted, permanent way to sideload a third-party app
on webOS; LG only allows that through their own store.

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
