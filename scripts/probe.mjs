#!/usr/bin/env node
// FanCode webOS feasibility probe — Step 1
// -------------------------------------------------------------------
// Goal: prove the *pipeline* works from a plain web client (no Android app):
//   1. TV device-code login with YOUR paid account
//   2. confirm the token identifies you (GetUserInfo)
//   3. ask the stream API for a match/video you're entitled to
//   4. print back the stream URL + DRM info (provider / licence URL / kID / headers)
//
// This is the make-or-break test. If a browser-style client gets a playable
// URL and a DRM licence URL, a webOS port is real. If the API/licence server
// refuses a non-app client, we find out here on day one.
//
// Requires Node 18+ (uses global fetch). Run with:  node probe.mjs
// Nothing here needs your password. Tokens are stored locally in
// ./.fc-session.json and are redacted in console output.
// -------------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const GRAPHQL = 'https://www.fancode.com/graphql';
const SESSION_FILE = new URL('./.fc-session.json', import.meta.url);
const APP_VERSION = '3.0.1';
const BUILD_VERSION = '179';

// A stable per-run device identity. Reused across a session if one exists.
function loadOrMakeDevice() {
  if (existsSync(SESSION_FILE)) {
    try { return JSON.parse(readFileSync(SESSION_FILE, 'utf8')); } catch {}
  }
  return { deviceId: randomUUID(), guestId: randomUUID() };
}
let session = loadOrMakeDevice();
function saveSession() { writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2)); }

// Headers the Android TV app sends. apiKey is genuinely empty ("") in the APK.
function baseHeaders(withAuth = false) {
  const h = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'source': 'fancodetv',
    'tvplatform': 'fancode',
    'appversion': APP_VERSION,
    'buildversion': BUILD_VERSION,
    'expcapability': 'true',
    'apiKey': '',
    'deviceId': session.deviceId,
    'guestid': session.guestId,
    'advertiserid': session.guestId,
    'X-Manufacturer': 'LG',
    'X-OS-Version': 'webOS',
    'X-Resolution': 'XHDPI',
    // A desktop-ish UA so we look like a browser, not the app.
    'User-Agent': 'Mozilla/5.0 (SmartTV; Linux; Web0S) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  };
  if (withAuth && session.accessToken) h['Authorization'] = 'Bearer ' + session.accessToken;
  return h;
}

async function gql(query, variables, { withAuth = false, operationName } = {}) {
  const res = await fetch(GRAPHQL, {
    method: 'POST',
    headers: baseHeaders(withAuth),
    body: JSON.stringify({ query, variables, operationName }),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, ok: res.ok, json, raw: text };
}

function redact(s) {
  if (!s) return s;
  return s.length <= 12 ? '***' : s.slice(0, 6) + '…' + s.slice(-4);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- GraphQL operations (exact strings pulled from the APK) ----
const Q_DEVICE_CODE =
  'query GetDeviceCode($matchId: Int) { getDeviceCode(matchId: $matchId) { deviceCode expiryDate interval verificationUrl } }';
const M_DEVICE_AUTH =
  'mutation DeviceAuthenticate($deviceCode: String!) { deviceAuthenticate(deviceCode: $deviceCode) { accessToken refreshToken userInfo { userId email mobileNo name profilePic } } }';
const Q_USER_INFO =
  'query GetUserInfo($accessToken: String!) { getUserInfo(accessToken: $accessToken) { userId name mobileNo email profilePic } }';
const Q_MATCH =
  'query MatchResponse($id: Int!) { match: matchWithScores(id: $id) { id name status streamingStatus isPremium isUserEntitled startTime sport { name } tour { id name } } }';
const Q_FAN_LIVE_STREAM =
  'query FanLiveStream($input: liveStreamInput!) { fanLiveStream(input: $input) { session { error { sessionError } data { ttl sessionId baseUrl } } freeTrial { isEligible isAvailable remTimeInSeconds } liveStreams { sources { deliveryType networkProtocol withCredentials url title drm { provider licenceUrl kID certificateUrl headers { name value } } wm { enabled } } contentType contentId } } }';

async function login(matchIdForCode) {
  console.log('\n=== 1) Requesting device code ===');
  const dc = await gql(Q_DEVICE_CODE, { matchId: matchIdForCode ?? null });
  if (!dc.json?.data?.getDeviceCode) {
    console.log('HTTP', dc.status);
    console.log('Response:', dc.raw.slice(0, 2000));
    throw new Error('Could not get a device code — see response above (this itself is a useful finding).');
  }
  const { deviceCode, verificationUrl, interval, expiryDate } = dc.json.data.getDeviceCode;
  const verifyUrl = verificationUrl || 'https://www.fancode.com/tv/login';
  console.log('\n  ┌───────────────────────────────────────────────');
  console.log('  │  On your phone/computer, open:');
  console.log('  │     ' + verifyUrl);
  console.log('  │  and enter this code:');
  console.log('  │');
  console.log('  │        >>>  ' + deviceCode + '  <<<');
  console.log('  │');
  console.log('  └───────────────────────────────────────────────');
  console.log('  (polling every ' + (interval || 5) + 's; expires ' + (expiryDate || '?') + ')');

  const pollMs = Math.max(2, Number(interval) || 5) * 1000;
  for (let i = 0; i < 120; i++) {
    await sleep(pollMs);
    const au = await gql(M_DEVICE_AUTH, { deviceCode });
    const d = au.json?.data?.deviceAuthenticate;
    if (d?.accessToken) {
      session.accessToken = d.accessToken;
      session.refreshToken = d.refreshToken;
      session.userId = d.userInfo?.userId;
      saveSession();
      console.log('\n  ✅ Authenticated as:', d.userInfo?.name || d.userInfo?.userId || '(unknown)');
      console.log('     accessToken:', redact(d.accessToken));
      return;
    }
    const err = au.json?.errors?.[0]?.message;
    process.stdout.write('.' + (err ? '(' + err + ')' : ''));
  }
  throw new Error('Timed out waiting for approval.');
}

async function checkUser() {
  console.log('\n\n=== 2) Verifying token (GetUserInfo) ===');
  const u = await gql(Q_USER_INFO, { accessToken: session.accessToken }, { withAuth: true });
  console.log('HTTP', u.status, '-', JSON.stringify(u.json?.data?.getUserInfo || u.json?.errors || u.raw.slice(0, 500)));
}

async function inspectMatch(id) {
  console.log('\n=== 3) Match info (id=' + id + ') ===');
  const m = await gql(Q_MATCH, { id }, { withAuth: true });
  const match = m.json?.data?.match;
  if (match) {
    console.log('  name:', match.name);
    console.log('  streamingStatus:', match.streamingStatus, '| status:', match.status);
    console.log('  isPremium:', match.isPremium, '| isUserEntitled:', match.isUserEntitled);
  } else {
    console.log('  (no match data)', JSON.stringify(m.json?.errors || m.raw.slice(0, 500)));
  }
  return match;
}

async function getStream(id) {
  console.log('\n=== 4) FanLiveStream — THE decisive call (id=' + id + ') ===');
  let playable = null; // { url, deliveryType, title }
  // Ask for both protocols; request WIDEVINE first (webOS 2017+), we can retry PLAYREADY.
  for (const drmType of ['WIDEVINE', 'PLAYREADY']) {
    const input = {
      id,
      drmType,
      videoProtocols: ['DASH', 'HLS'],
      supportedCodecs: ['H264', 'H265'],
    };
    const r = await gql(Q_FAN_LIVE_STREAM, { input }, { withAuth: true });
    console.log('\n  --- drmType=' + drmType + ' → HTTP ' + r.status + ' ---');
    const fls = r.json?.data?.fanLiveStream;
    if (!fls) {
      console.log('  errors:', JSON.stringify(r.json?.errors || r.raw.slice(0, 800)));
      continue;
    }
    if (fls.session?.error?.sessionError) {
      console.log('  sessionError:', fls.session.error.sessionError);
    }
    const src = fls.liveStreams?.sources?.[0];
    if (!src) {
      console.log('  no sources returned. full session:', JSON.stringify(fls.session));
      continue;
    }
    console.log('  deliveryType   :', src.deliveryType);
    console.log('  networkProtocol:', src.networkProtocol);
    console.log('  withCredentials:', src.withCredentials);
    console.log('  stream url     :', src.url);          // <-- the actual DASH/HLS manifest
    if (src.drm) {
      console.log('  DRM.provider   :', src.drm.provider);
      console.log('  DRM.licenceUrl :', src.drm.licenceUrl);   // <-- the EME licence endpoint
      console.log('  DRM.kID        :', src.drm.kID);
      console.log('  DRM.certUrl    :', src.drm.certificateUrl);
      console.log('  DRM.headers    :', JSON.stringify(src.drm.headers));
    } else {
      console.log('  DRM            : (none — clear stream!)');
    }
    console.log('  watermark      :', src.wm?.enabled ? 'ENABLED' : 'off');
    if (src.url && !playable) playable = { url: src.url, deliveryType: src.deliveryType, title: src.title || fls.liveStreams?.contentId || ('match ' + id) };
  }
  console.log('\nIf you see a stream url + (for premium) a DRM licenceUrl above, Step 1 PASSES.');

  if (playable) {
    writePlayer(playable);
    console.log('\n▶︎  Wrote player.html with a fresh URL.');
    console.log('   Open it in SAFARI (Chrome can\'t play HLS natively):');
    console.log('      open -a Safari "' + new URL('./player.html', import.meta.url).pathname + '"');
    console.log('   The token expires in ~an hour — re-run this to refresh.');
  }
}

function writePlayer({ url, deliveryType, title }) {
  const safeTitle = String(title).replace(/[<&]/g, '');
  const html = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FanCode test player — ${safeTitle}</title>
<style>
  html,body{margin:0;background:#000;color:#eee;font-family:-apple-system,system-ui,sans-serif;height:100%}
  .wrap{display:flex;flex-direction:column;height:100%}
  header{padding:10px 14px;background:#111;font-size:14px;display:flex;gap:12px;align-items:center}
  header b{color:#ff5000}
  video{flex:1;width:100%;background:#000;min-height:0}
  #status{font-size:12px;color:#9a9}
  footer{padding:8px 14px;background:#111;font-size:12px;color:#889;word-break:break-all}
</style></head><body>
<div class="wrap">
  <header><b>FanCode</b> native-HLS test · ${safeTitle} · <span id="status">loading…</span></header>
  <video id="v" controls autoplay playsinline></video>
  <footer>deliveryType: ${deliveryType} — this page uses the TV's native HLS path (no DRM, no hls.js). Open in Safari.</footer>
</div>
<script>
  var url = ${JSON.stringify(url)};
  var v = document.getElementById('v');
  var s = document.getElementById('status');
  // Native HLS (Safari / webOS): assign src directly, no CORS/MSE involved.
  if (v.canPlayType('application/vnd.apple.mpegurl') || true) {
    v.src = url;
    v.addEventListener('loadedmetadata', function(){ s.textContent = 'playing (' + v.videoWidth + '×' + v.videoHeight + ')'; });
    v.addEventListener('playing', function(){ s.textContent = 'playing (' + v.videoWidth + '×' + v.videoHeight + ')'; });
    v.addEventListener('error', function(){ s.textContent = 'error — token may be expired, re-run probe.mjs. Chrome? use Safari.'; });
  }
</script>
</body></html>`;
  writeFileSync(new URL('./player.html', import.meta.url), html);
}

async function main() {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    if (!session.accessToken) {
      const ans = (await rl.question(
        'Optional match id to bind the login to (press Enter to skip): ')).trim();
      await login(ans ? Number(ans) : null);
    } else {
      console.log('Reusing saved session for', session.userId ? 'user ' + session.userId : 'device', '(delete .fc-session.json to re-login)');
    }
    await checkUser();

    const idStr = (await rl.question(
      '\nEnter a MATCH ID to test playback (from a fancode.com match URL): ')).trim();
    if (!idStr) { console.log('No id given — stopping after auth. Re-run and provide one to test playback.'); return; }
    const id = Number(idStr);
    await inspectMatch(id);
    await getStream(id);
  } finally {
    rl.close();
  }
}

main().catch(e => { console.error('\nFATAL:', e.message); process.exit(1); });
