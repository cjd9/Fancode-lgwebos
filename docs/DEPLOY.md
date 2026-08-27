# Deploying the FanCode webOS app to your LG TV

The app in this folder is a complete, working prototype:
**device-code login → live-match list → native-HLS player**, using the exact
API calls proven in `scripts/probe.mjs`. It's already been verified in a browser
against your account. What's left is getting it onto the TV.

There are two setup tracks. Do them once each; after that, deploy is one command.

---

## Track 1 — On the TV (you must do this physically, one time)

LG locks sideloading behind "Developer Mode". Steps:

1. **Create a free LG developer account** at https://developer.lge.com (webOS TV).
2. On the TV, open the **Content Store** and install the app called
   **"Developer Mode"** (published by LG).
3. Open Developer Mode, **log in** with the account from step 1, and toggle
   **Dev Mode Status → ON**. The TV restarts into dev mode.
4. Back in the Developer Mode app, note three things shown on screen:
   - the **TV's IP address**
   - the **passphrase** (a 6-char code)
   - confirm **"Key Server" is ON** (leave it on)
5. Keep the TV on this screen the first time you connect — dev mode expires
   after 1000 hours; you can reset the timer in the Developer Mode app.

> The TV and your Mac must be on the **same network**.

---

## Track 2 — On your Mac (one time)

Install LG's CLI (works on your Node 20/23):

```bash
npm install -g @webos-tools/cli      # provides the `ares-*` commands
ares-setup-device --version          # sanity check
```

Register your TV as a target (uses the IP + passphrase from Track 1):

```bash
ares-setup-device
# choose "add", give it a name e.g. "lgtv",
# device type: webOS TV, IP: <TV ip>, port: 9922, user: prisoner
```

Then pair (this prompts for the passphrase and pulls a key from the TV's key server):

```bash
ares-novacom --device lgtv --getkey    # enter the 6-char passphrase when asked
```

---

## Deploy loop (every time you change the app)

From this `app/` directory:

```bash
ares-package .                                   # -> com.clyde.fancode_0.0.1_all.ipk
ares-install --device lgtv com.clyde.fancode_0.0.1_all.ipk
ares-launch  --device lgtv com.clyde.fancode
```

To watch logs / debug (opens Chrome DevTools pointed at the TV app):

```bash
ares-inspect --device lgtv --app com.clyde.fancode --open
```

To stop / uninstall:

```bash
ares-launch  --device lgtv --close com.clyde.fancode
ares-install --device lgtv --remove com.clyde.fancode
```

---

## First run on the TV

1. Launch **FanCode (unofficial)** from the TV's app list (orange icon).
2. It shows a **code** + `fancode.com/tv/login`. Approve it on your phone with
   your paid account (same flow as `probe.mjs`).
3. The **live-match list** appears. Use the remote **↑/↓** to move, **OK** to
   play, **Back** to return to the list.
4. Playback uses the TV's **native HLS** pipeline — the same clear stream that
   played in Safari. No DRM plumbing needed for this content.

---

## Known-good / known-limits (as built)

- **Auth, list, stream, playback** — all verified against your account.
- **Token refresh** — not wired yet. When the token expires (~24h), the list
  fails and you relaunch to sign in again. Adding `RefreshTokenAuthV2` is the
  obvious next improvement.
- **Content** — only *live* matches, and only the first stream source. VOD,
  multiple audio feeds, and the stream-switcher are future work (option C).
- **Some content may be DRM'd.** This build requests a clear/Widevine source
  and plays clear. If a given match returns a `drm.licenceUrl`, native webOS
  playback would need `<video>` + a MediaKeys/DRM agent — not handled yet.
- **Ads** — the API returns CSAI/SSAI ad config; this build ignores it and
  plays the base stream.
