/**
 * Тільки сторінка /thank-you — підстановка email у посилання на Telegram.
 * Вставте лише в «Довільний код → body» сторінки thank-you. Без form.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'plasticinezen_lead_v1';
  var COOKIE_KEY = 'plasticinezen_lead_v1';
  var FALLBACK_URL = 'https://tg.pulse.is/PlasticineZen_bot?start=69e888114656bccfca02e967&email=EMAILVALUE';

  var thankIntervalId = null;
  var thankMo = null;

  function debug() {
    return /(?:\?|#|&)plasticinezen_debug=1(?:&|$)/.test(location.href);
  }
  function log() {
    if (!debug()) return;
    try {
      console.info.apply(console, ['[PZ-thank]'].concat([].slice.call(arguments)));
    } catch (e) {}
  }

  function readLead() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var o = JSON.parse(raw);
        if (o && o.exp && Date.now() < o.exp) return o;
      }
    } catch (e) {}
    try {
      var m = document.cookie.match(new RegExp('(?:^|; )' + COOKIE_KEY + '=([^;]*)'));
      if (m) {
        var o2 = JSON.parse(decodeURIComponent(m[1]));
        if (o2 && o2.exp && Date.now() < o2.exp) return o2;
      }
    } catch (e2) {}
    return null;
  }

  function emailFromQuery() {
    try {
      var p = new URLSearchParams(window.location.search || '');
      var raw = (p.get('email') || p.get('e') || p.get('mail') || '').trim();
      if (!raw) return '';
      try {
        return decodeURIComponent(raw).trim();
      } catch (e2) {
        return raw;
      }
    } catch (e) {
      return '';
    }
  }

  function applyEmailToUrl(rawHref, email) {
    var href = rawHref || FALLBACK_URL;
    var em = (email || '').trim();
    if (!em) return href;
    var encoded = encodeURIComponent(em);
    if (href.indexOf('EMAILVALUE') !== -1) {
      return href.replace(/EMAILVALUE/g, encoded);
    }
    if (/[?&]email=/.test(href)) {
      return href.replace(/([?&]email=)[^&]*/i, '$1' + encoded);
    }
    return href + (href.indexOf('?') === -1 ? '?' : '&') + 'email=' + encoded;
  }

  function patchTelegramLinks() {
    try {
      var lead = readLead();
      var email = ((lead && lead.email) || emailFromQuery() || '').trim();
      var all = document.querySelectorAll('a[href*="tg.pulse.is"], a[href*="t.me"]');
      for (var i = 0; i < all.length; i++) {
        var h = (all[i].getAttribute('href') || '').toLowerCase();
        if (h.indexOf('plasticinezen_bot') !== -1 && h.indexOf('start=69e888114656bccfca02e967') !== -1) {
          all[i].setAttribute('href', applyEmailToUrl(all[i].getAttribute('href'), email));
        }
      }
      var byId = document.getElementById('plasticinezen-tg-btn');
      if (byId && byId.tagName === 'A') {
        byId.setAttribute('href', applyEmailToUrl(byId.getAttribute('href'), email));
      }
      log('patched', !!email);
    } catch (e) {
      log('patch error', String(e && e.message));
    }
  }

  function start() {
    log('bind thank-you');
    patchTelegramLinks();
    if (typeof MutationObserver !== 'undefined' && !thankMo) {
      var t;
      thankMo = new MutationObserver(function () {
        clearTimeout(t);
        t = setTimeout(patchTelegramLinks, 50);
      });
      thankMo.observe(document.documentElement, { childList: true, subtree: true });
    }
    if (thankIntervalId) clearInterval(thankIntervalId);
    var n = 0;
    thankIntervalId = setInterval(function () {
      patchTelegramLinks();
      if (++n > 50) {
        clearInterval(thankIntervalId);
        thankIntervalId = null;
      }
    }, 300);
  }

  function boot() {
    try {
      if (typeof console !== 'undefined' && console.info) {
        console.info('[PZ-thank] script loaded');
      }
    } catch (e) {}
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }
  }

  boot();
})();
