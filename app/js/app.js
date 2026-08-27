/* Screen flow + remote-control (D-pad) navigation for webOS.
   Keys: ArrowUp/Down = move focus, Enter = select, Back (461) / Backspace = go back. */
(function () {
  'use strict';

  var KEY = { UP: 38, DOWN: 40, LEFT: 37, RIGHT: 39, ENTER: 13, BACK: 461, BKSP: 8, ESC: 27,
              PLAY: 415, PAUSE: 19, PLAYPAUSE: 463, STOP: 413, FF: 417, RWD: 412 };
  var LIVE_EDGE_SLACK = 8; // seconds; within this of the end = "at live"
  var screens = {
    login: document.getElementById('screen-login'),
    home: document.getElementById('screen-home'),
    player: document.getElementById('screen-player')
  };
  var current = 'login';
  var pollTimer = null;
  var focusIndex = 0;
  var matches = [];

  function show(name) {
    Object.keys(screens).forEach(function (k) {
      screens[k].classList.toggle('hidden', k !== name);
    });
    current = name;
  }

  // ---------- Login ----------
  function startLogin() {
    show('login');
    var elUrl = document.getElementById('login-url');
    var elCode = document.getElementById('login-code');
    var elHint = document.getElementById('login-hint');
    elHint.textContent = 'Requesting a code…';

    FCAPI.getDeviceCode().then(function (dc) {
      if (!dc) { elHint.textContent = 'Could not get a code. Check network and relaunch.'; return; }
      elUrl.textContent = dc.verificationUrl || 'https://fancode.com/tv/login';
      elCode.textContent = dc.deviceCode;
      elHint.textContent = 'Waiting for you to approve on your phone…';
      var interval = Math.max(2, Number(dc.interval) || 5) * 1000;

      clearInterval(pollTimer);
      pollTimer = setInterval(function () {
        FCAPI.pollDeviceAuth(dc.deviceCode).then(function (session) {
          if (session) {
            clearInterval(pollTimer);
            enterHome();
          }
        }).catch(function () { /* keep polling */ });
      }, interval);
    }).catch(function () {
      elHint.textContent = 'Network error requesting a code.';
    });
  }

  // ---------- Home ----------
  var homeTimer = null;

  function enterHome() {
    show('home');
    var u = FCAPI.user();
    document.getElementById('home-user').textContent = u ? (u.name || '') : '';
    refreshMatches(true);
    // Keep the list current: matches flip from upcoming -> live while the app sits open.
    clearInterval(homeTimer);
    homeTimer = setInterval(function () { if (current === 'home') refreshMatches(false); }, 45000);
  }

  // fresh=true resets focus to top (first load); fresh=false preserves it (auto-refresh).
  function refreshMatches(fresh) {
    var list = document.getElementById('match-list');
    var empty = document.getElementById('home-empty');
    FCAPI.liveMatches().then(function (all) {
      // Live first, then upcoming.
      var next = all.slice().sort(function (a, b) {
        var la = a.streamingStatus === 'STARTED' ? 0 : 1;
        var lb = b.streamingStatus === 'STARTED' ? 0 : 1;
        return la - lb;
      });
      // Skip a re-render if nothing changed (avoids focus flicker on the interval).
      if (!fresh && sameMatches(next, matches)) return;
      matches = next;
      empty.classList.add('hidden');
      list.innerHTML = '';
      if (!matches.length) { empty.textContent = 'No live matches right now.'; empty.classList.remove('hidden'); return; }

      matches.forEach(function (m, i) {
        var row = document.createElement('div');
        row.className = 'match';
        var live = m.streamingStatus === 'STARTED';
        var teams = (m.squads || []).map(function (s) { return s.shortName || s.name; }).join('  vs  ');
        row.innerHTML =
          '<div class="dot ' + (live ? 'on' : '') + '"></div>' +
          '<div class="m-main"><div class="m-name">' + esc(m.name) + '</div>' +
          '<div class="m-sub">' + esc(m.sport && m.sport.name || '') +
          (teams ? ' · ' + esc(teams) : '') +
          (live ? ' · <span class="livetag">LIVE</span>' : ' · upcoming') + '</div></div>';
        row.addEventListener('click', function () { openMatch(i); });
        list.appendChild(row);
      });
      if (fresh) focusIndex = 0;
      focusIndex = Math.min(focusIndex, matches.length - 1);
      updateFocus();
    }).catch(function () {
      if (!matches.length) {
        empty.textContent = 'Failed to load matches (token may have expired). Relaunch to sign in again.';
        empty.classList.remove('hidden');
      }
    });
  }

  // Compare by id + streamingStatus so a status flip (upcoming->live) forces a re-render.
  function sameMatches(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i].id !== b[i].id || a[i].streamingStatus !== b[i].streamingStatus) return false;
    }
    return true;
  }

  function updateFocus() {
    var rows = document.querySelectorAll('#match-list .match');
    rows.forEach(function (r, i) { r.classList.toggle('focus', i === focusIndex); });
    var el = rows[focusIndex];
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }

  // ---------- Player ----------
  var controlsTimer = null;

  function openMatch(i) {
    var m = matches[i];
    if (!m) return;
    // Don't hard-block on cached status — a match may have just gone live.
    // The stream API is the source of truth; if there's no source we say so.
    show('player');
    var video = document.getElementById('video');
    var title = document.getElementById('player-title');
    var status = document.getElementById('player-status');
    title.textContent = m.name;
    status.textContent = 'Requesting stream…';
    syncPlayPause();
    showControls();

    // Keep the play/pause glyph in sync with actual playback state.
    video.onplay = syncPlayPause;
    video.onpause = syncPlayPause;
    video.ontimeupdate = updateLivePill;

    // Tapping the LIVE pill (magic-remote pointer) jumps to live too.
    var pill = document.getElementById('live-pill');
    pill.onclick = jumpToLive;

    FCAPI.streamForMatch(m.id).then(function (src) {
      status.textContent = 'Loading video…';
      var drm = src.drm && src.drm.provider && src.drm.provider !== 'NONE' ? src.drm : null;
      video.onloadedmetadata = function () {
        status.textContent = video.videoWidth + '×' + video.videoHeight;
        syncPlayPause();
      };
      video.onerror = function () { status.textContent = 'Playback error.'; };
      if (drm) {
        playDRM(video, src.url, drm, status);           // encrypted DASH via Shaka + Widevine EME
      } else {
        destroyShaka();                                  // clear HLS/DASH — native pipeline
        video.src = src.url;
        video.play().catch(function () {});
      }
    }).catch(function (e) {
      var msg = /no playable source/i.test(e.message) ? 'Not live yet — try again shortly.' : ('Stream error: ' + e.message);
      status.textContent = msg;
      // Bounce back to the list so the user isn't stuck on a black player.
      setTimeout(function () { if (current === 'player') closePlayer(); }, 2500);
    });
  }

  function liveEdge(video) {
    if (video.seekable && video.seekable.length) return video.seekable.end(video.seekable.length - 1);
    return NaN;
  }

  function isBehindLive(video) {
    var edge = liveEdge(video);
    return !isNaN(edge) && (edge - video.currentTime) > LIVE_EDGE_SLACK;
  }

  // Seek to the live edge of the DVR window and resume.
  function jumpToLive() {
    var video = document.getElementById('video');
    var edge = liveEdge(video);
    if (!isNaN(edge)) {
      try { video.currentTime = edge - 0.5; } catch (e) {}
    }
    video.play().catch(function () {});
    syncPlayPause();
    updateLivePill();
    flashCenter('⇥');
    showControls();
  }

  // Green "● LIVE" when at the edge; amber "● GO LIVE" when behind.
  function updateLivePill() {
    var video = document.getElementById('video');
    var pill = document.getElementById('live-pill');
    if (!pill) return;
    if (isBehindLive(video)) { pill.textContent = '● GO LIVE'; pill.classList.add('behind'); }
    else { pill.textContent = '● LIVE'; pill.classList.remove('behind'); }
  }

  // ---------- Widevine (Shaka Player) ----------
  var shakaPlayer = null;
  var shakaReady = false;

  function ensureShaka() {
    if (!window.shaka) return null;
    if (!shakaReady) { try { shaka.polyfill.installAll(); } catch (e) {} shakaReady = true; }
    return shaka;
  }

  function destroyShaka() {
    if (shakaPlayer) { try { shakaPlayer.destroy(); } catch (e) {} shakaPlayer = null; }
  }

  function playDRM(video, manifestUrl, drm, status) {
    var s = ensureShaka();
    if (!s || !s.Player.isBrowserSupported()) {
      status.textContent = 'This TV can\'t play the DRM stream (browser unsupported).';
      return;
    }
    destroyShaka();
    shakaPlayer = new s.Player(video);
    // Widevine license server + any headers the API told us to send (nv-authorizations, content-type).
    shakaPlayer.configure({ drm: { servers: { 'com.widevine.alpha': drm.licenceUrl } } });
    var hdrs = drm.headers || [];
    shakaPlayer.getNetworkingEngine().registerRequestFilter(function (type, request) {
      if (type === s.net.NetworkingEngine.RequestType.LICENSE) {
        hdrs.forEach(function (h) { request.headers[h.name] = h.value; });
      }
    });
    shakaPlayer.addEventListener('error', function (ev) {
      var d = ev.detail || {};
      status.textContent = 'DRM error ' + (d.code || '') + ' — see logs';
      if (window.console) console.error('Shaka error', d);
    });
    status.textContent = 'Acquiring licence…';
    shakaPlayer.load(manifestUrl).then(function () {
      status.textContent = video.videoWidth + '×' + video.videoHeight + ' (DRM)';
      video.play().catch(function () {});
      syncPlayPause();
    }).catch(function (err) {
      status.textContent = 'DRM load failed (' + (err && err.code) + ')';
      if (window.console) console.error('Shaka load failed', err);
    });
  }

  function togglePlay() {
    var video = document.getElementById('video');
    if (video.paused) video.play().catch(function () {});
    else video.pause();
    syncPlayPause();
    flashCenter(video.paused ? '❚❚' : '▶');
    showControls();
  }

  function syncPlayPause() {
    var video = document.getElementById('video');
    var btn = document.getElementById('btn-playpause');
    if (btn) btn.textContent = video.paused ? '▶' : '❚❚';
  }

  // Briefly show a big glyph in the middle of the screen.
  function flashCenter(glyph) {
    var el = document.getElementById('center-icon');
    if (!el) return;
    el.textContent = glyph;
    el.classList.remove('hidden');
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.add('hidden'); }, 600);
  }

  // Reveal the transport bar and auto-hide after a few seconds.
  function showControls() {
    var bar = document.getElementById('player-controls');
    if (!bar) return;
    bar.classList.remove('hidden');
    clearTimeout(controlsTimer);
    controlsTimer = setTimeout(function () { bar.classList.add('hidden'); }, 3500);
  }

  function closePlayer() {
    var video = document.getElementById('video');
    video.pause();
    destroyShaka();
    video.removeAttribute('src');
    video.load();
    clearTimeout(controlsTimer);
    document.getElementById('player-controls').classList.add('hidden');
    show('home');
    updateFocus();
  }

  // ---------- Helpers ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function flash(msg) {
    var u = document.getElementById('home-user');
    var old = u.textContent; u.textContent = msg;
    setTimeout(function () { u.textContent = old; }, 1200);
  }

  // ---------- Remote / keyboard ----------
  document.addEventListener('keydown', function (e) {
    var code = e.keyCode;
    if (current === 'home') {
      if (code === KEY.DOWN) { focusIndex = Math.min(matches.length - 1, focusIndex + 1); updateFocus(); e.preventDefault(); }
      else if (code === KEY.UP) { focusIndex = Math.max(0, focusIndex - 1); updateFocus(); e.preventDefault(); }
      else if (code === KEY.ENTER) { openMatch(focusIndex); e.preventDefault(); }
    } else if (current === 'player') {
      if (code === KEY.BACK || code === KEY.BKSP || code === KEY.ESC) { closePlayer(); e.preventDefault(); }
      else if (code === KEY.ENTER || code === KEY.PLAYPAUSE) { togglePlay(); e.preventDefault(); }
      else if (code === KEY.PLAY) { document.getElementById('video').play(); syncPlayPause(); showControls(); e.preventDefault(); }
      else if (code === KEY.PAUSE) { document.getElementById('video').pause(); syncPlayPause(); showControls(); e.preventDefault(); }
      else if (code === KEY.FF || code === KEY.UP) { jumpToLive(); e.preventDefault(); }
      else { showControls(); }
    }
  });

  // ---------- Boot ----------
  // If the refresh token is dead, the API clears the session and calls this;
  // tear down playback/timers and send the user back to sign-in.
  FCAPI.onAuthExpired(function () {
    clearInterval(homeTimer);
    destroyShaka();
    startLogin();
  });

  if (FCAPI.isLoggedIn()) enterHome();
  else startLogin();
})();
