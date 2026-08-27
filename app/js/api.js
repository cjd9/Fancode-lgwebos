/* FanCode API client — the exact calls proven in probe.mjs, ported to the browser.
   GraphQL CORS is reflective (any origin, credentials) so fetch() works from a
   webOS packaged app. Media is played via native <video> (no CORS). */
(function (global) {
  'use strict';

  var GRAPHQL = 'https://www.fancode.com/graphql';
  var APP_VERSION = '3.0.1';
  var BUILD_VERSION = '179';
  var LS = window.localStorage;

  // Stable device identity, persisted on the TV.
  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
  function deviceId() {
    var d = LS.getItem('fc_device_id');
    if (!d) { d = uuid(); LS.setItem('fc_device_id', d); }
    return d;
  }

  function token() { return LS.getItem('fc_access_token') || ''; }
  function setSession(accessToken, refreshToken, user) {
    LS.setItem('fc_access_token', accessToken);
    if (refreshToken) LS.setItem('fc_refresh_token', refreshToken);
    if (user) LS.setItem('fc_user', JSON.stringify(user));
  }
  function clearSession() {
    LS.removeItem('fc_access_token');
    LS.removeItem('fc_refresh_token');
    LS.removeItem('fc_user');
  }
  function user() {
    try { return JSON.parse(LS.getItem('fc_user') || 'null'); } catch (e) { return null; }
  }

  function headers(withAuth) {
    var h = {
      'Content-Type': 'application/json',
      'source': 'fancodetv',
      'tvplatform': 'fancode',
      'appversion': APP_VERSION,
      'buildversion': BUILD_VERSION,
      'expcapability': 'true',
      'apiKey': '',
      'deviceId': deviceId(),
      'guestid': deviceId(),
      'advertiserid': deviceId(),
      'X-Manufacturer': 'LG',
      'X-OS-Version': 'webOS',
      'X-Resolution': 'XHDPI'
    };
    if (withAuth && token()) h['Authorization'] = 'Bearer ' + token();
    return h;
  }

  // Low-level call → resolves { status, json }.
  function httpGql(query, variables, withAuth) {
    return fetch(GRAPHQL, {
      method: 'POST',
      headers: headers(withAuth),
      body: JSON.stringify({ query: query, variables: variables || {} })
    }).then(function (r) {
      return r.json().then(function (j) { return { status: r.status, json: j }; },
                           function () { return { status: r.status, json: null }; });
    });
  }

  // ---- token expiry / refresh ----
  function jwtExp(t) {
    try {
      var p = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      while (p.length % 4) p += '=';
      return JSON.parse(atob(p)).exp || 0;
    } catch (e) { return 0; }
  }
  function tokenExpired() {
    var e = jwtExp(token());
    return !e || (Date.now() / 1000) >= (e - 60); // refresh in the last minute of life
  }

  var refreshInFlight = null;
  var onExpired = null;

  function refreshAccessToken() {
    if (refreshInFlight) return refreshInFlight;           // dedupe concurrent refreshes
    var rt = LS.getItem('fc_refresh_token');
    var at = token();
    if (!rt) return Promise.resolve(false);
    refreshInFlight = httpGql(M_REFRESH, { refreshToken: rt, accessToken: at }, false)
      .then(function (res) {
        var nt = res.json && res.json.data && res.json.data.refreshTokenAuthV2 &&
                 res.json.data.refreshTokenAuthV2.accessToken;
        if (nt) { LS.setItem('fc_access_token', nt); return true; }
        return false;
      })
      .catch(function () { return false; })
      .then(function (ok) { refreshInFlight = null; return ok; });
    return refreshInFlight;
  }

  function ensureFreshToken() {
    if (!token()) return Promise.resolve(false);
    if (!tokenExpired()) return Promise.resolve(true);
    return refreshAccessToken();
  }

  function isAuthError(res) {
    if (res.status === 401 || res.status === 403) return true;
    var errs = res.json && res.json.errors;
    if (!errs || !errs.length) return false;
    for (var i = 0; i < errs.length; i++) {
      var m = (errs[i].message || '').toLowerCase();
      var c = ((errs[i].extensions && errs[i].extensions.code) || '').toLowerCase();
      if (/unauth|unauthorized|forbidden|token|expired|401|403/.test(m)) return true;
      if (/unauth|forbidden/.test(c)) return true;
    }
    return false;
  }

  // Authed call with proactive refresh + one reactive retry on auth failure.
  function authedGql(query, variables) {
    return ensureFreshToken().then(function () {
      return httpGql(query, variables, true).then(function (res) {
        if (isAuthError(res) && LS.getItem('fc_refresh_token')) {
          return refreshAccessToken().then(function (ok) {
            if (!ok) { handleExpired(); return res; }
            return httpGql(query, variables, true).then(function (res2) {
              if (isAuthError(res2)) handleExpired();
              return res2;
            });
          });
        }
        return res;
      });
    });
  }

  function handleExpired() {
    clearSession();
    if (typeof onExpired === 'function') try { onExpired(); } catch (e) {}
  }

  // ---- Operations (verified against the live API) ----
  var Q_DEVICE_CODE =
    'query GetDeviceCode($matchId: Int) { getDeviceCode(matchId: $matchId) { deviceCode expiryDate interval verificationUrl } }';
  var M_DEVICE_AUTH =
    'mutation DeviceAuthenticate($deviceCode: String!) { deviceAuthenticate(deviceCode: $deviceCode) { accessToken refreshToken userInfo { userId email name } } }';
  var M_REFRESH =
    'mutation RefreshTokenAuthV2($refreshToken: String!, $accessToken: String!) { refreshTokenAuthV2(refreshToken: $refreshToken, accessToken: $accessToken) { accessToken } }';
  var Q_LIVE =
    'query LiveStreamingMatches { matchesHasLivestream { id name streamingStatus status isPremium isUserEntitled startTime sport { name } squads { shortName name } } }';
  var Q_STREAM =
    'query FanLiveStream($input: liveStreamInput!) { fanLiveStream(input: $input) { session { error { sessionError } } liveStreams { sources { deliveryType networkProtocol url title drm { provider licenceUrl kID certificateUrl headers { name value } } } } } }';

  var API = {
    isLoggedIn: function () { return !!token(); },
    user: user,
    logout: clearSession,
    // App registers a callback here; fired when the session can't be refreshed.
    onAuthExpired: function (cb) { onExpired = cb; },

    getDeviceCode: function (matchId) {
      return httpGql(Q_DEVICE_CODE, { matchId: matchId || null }, false)
        .then(function (res) { return res.json && res.json.data && res.json.data.getDeviceCode; });
    },

    // Resolves with session on success, null while still pending.
    pollDeviceAuth: function (deviceCode) {
      return httpGql(M_DEVICE_AUTH, { deviceCode: deviceCode }, false).then(function (res) {
        var d = res.json && res.json.data && res.json.data.deviceAuthenticate;
        if (d && d.accessToken) {
          setSession(d.accessToken, d.refreshToken, d.userInfo);
          return d;
        }
        return null;
      });
    },

    liveMatches: function () {
      return authedGql(Q_LIVE, {}).then(function (res) {
        return (res.json && res.json.data && res.json.data.matchesHasLivestream) || [];
      });
    },

    // Returns { url, deliveryType, drm } for the first source, or throws.
    streamForMatch: function (id) {
      var input = { id: id, drmType: 'WIDEVINE', videoProtocols: ['DASH', 'HLS'], supportedCodecs: ['H264', 'H265'] };
      return authedGql(Q_STREAM, { input: input }).then(function (res) {
        var fls = res.json && res.json.data && res.json.data.fanLiveStream;
        var sErr = fls && fls.session && fls.session.error && fls.session.error.sessionError;
        if (sErr) throw new Error(sErr);
        var src = fls && fls.liveStreams && fls.liveStreams.sources && fls.liveStreams.sources[0];
        if (!src || !src.url) throw new Error('No playable source');
        return src;
      });
    }
  };

  global.FCAPI = API;
})(window);
