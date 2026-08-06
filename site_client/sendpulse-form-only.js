/**
 * Тільки /form — збереження ліда. Додано: Shadow DOM, ng-reflect-model (Angular).
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'plasticinezen_lead_v1';
  var COOKIE_KEY = 'plasticinezen_lead_v1';
  var LEAD_TTL_MS = 365 * 24 * 60 * 60 * 1000;

  var pollId = null;
  var lastSnap = '';
  var deepCounter = 0;
  var lastWarn = 0;

  /** Логи: 1) додайте до URL ?plasticinezen_debug=1 або 2) у консолі: localStorage.setItem('plasticinezen_debug','1'); location.reload(); */
  function debug() {
    try {
      if (localStorage.getItem('plasticinezen_debug') === '1') return true;
    } catch (e) {}
    return /(?:\?|#|&)plasticinezen_debug=1(?:&|$)/.test(location.href);
  }
  function log() {
    if (!debug()) return;
    try {
      console.info.apply(console, ['[PZ-form]'].concat([].slice.call(arguments)));
    } catch (e) {}
  }

  function writeLead(data) {
    var exp = Date.now() + LEAD_TTL_MS;
    var payload = { exp: exp, name: data.name || '', phone: data.phone || '', email: data.email || '' };
    var json = JSON.stringify(payload);
    try {
      localStorage.setItem(STORAGE_KEY, json);
      log('localStorage OK');
    } catch (e) {
      log('localStorage error', String(e));
    }
    var maxAge = Math.floor(LEAD_TTL_MS / 1000);
    try {
      if (encodeURIComponent(json).length < 3500) {
        document.cookie =
          COOKIE_KEY +
          '=' +
          encodeURIComponent(json) +
          '; path=/; max-age=' +
          maxAge +
          '; SameSite=Lax';
        log('cookie OK');
      }
    } catch (e2) {
      log('cookie error', String(e2));
    }
  }

  function mergeBag(dst, src) {
    if (src.email && !dst.email) dst.email = src.email;
    if (src.phone && !dst.phone) dst.phone = src.phone;
    if (src.name && !dst.name) dst.name = src.name;
  }

  /** Angular часто дублює значення в ng-reflect-model. */
  function scanNgReflect(doc) {
    var out = { email: '', phone: '', name: '' };
    if (!doc || !doc.querySelectorAll) return out;
    try {
      var els = doc.querySelectorAll('[ng-reflect-model]');
      for (var i = 0; i < els.length; i++) {
        var m = (els[i].getAttribute('ng-reflect-model') || '').trim();
        if (!m) continue;
        if (m.indexOf('@') !== -1 && m.length < 320 && !out.email) out.email = m;
        else if ((m[0] === '+' || /^[\d\s()\-]+$/.test(m)) && m.length < 40 && !out.phone) out.phone = m;
        else if (m.length > 1 && m.length < 120 && !out.name && m.indexOf('@') === -1 && !/^\+?\d[\d\s\-]{6,}$/.test(m))
          out.name = m;
      }
    } catch (e) {}
    return out;
  }

  function findInDoc(doc) {
    var out = { email: '', phone: '', name: '' };
    if (!doc || !doc.querySelectorAll) return out;
    try {
      var inputs = doc.querySelectorAll('input, textarea, select');
      for (var i = 0; i < inputs.length; i++) {
        var inp = inputs[i];
        if (inp.disabled) continue;
        var v = String(inp.value != null ? inp.value : '').trim();
        if (!v) continue;
        var type = (inp.type || '').toLowerCase();
        var id = (inp.id || '').toLowerCase();
        var nm = (inp.name || '').toLowerCase();
        var fcn = (
          inp.getAttribute && (inp.getAttribute('formcontrolname') || inp.getAttribute('formControlName') || '')
        ).toLowerCase();
        var ac = (inp.autocomplete || '').toLowerCase();
        var ph = (inp.placeholder || '').toLowerCase();
        if (type === 'email' || id === 'email' || nm === 'email' || fcn === 'email' || ac === 'email') out.email = v;
        else if (type === 'tel' || id === 'phone' || nm === 'phone' || fcn === 'phone' || ac === 'tel') out.phone = v;
        else if (type === 'text' || type === 'search' || !type || type === 'url') {
          if (
            ac === 'name' ||
            fcn === 'name' ||
            (nm && nm.indexOf('name') !== -1) ||
            (id && id.indexOf('name') !== -1) ||
            ph.indexOf('ім') !== -1
          ) {
            if (!out.name) out.name = v;
          }
          if (!out.email && /^\S+@\S+\.\S+$/.test(v)) out.email = v;
        }
      }
    } catch (e) {}
    return out;
  }

  /** Рекурсивно заходимо в open ShadowRoot. */
  function scanShadowTree(root, out) {
    if (!root || !root.querySelectorAll) return;
    try {
      mergeBag(out, findInDoc(root));
      mergeBag(out, scanNgReflect(root));
      var stars = root.querySelectorAll('*');
      for (var i = 0; i < stars.length; i++) {
        var el = stars[i];
        if (el.shadowRoot) scanShadowTree(el.shadowRoot, out);
      }
    } catch (e) {}
  }

  function gatherLeadFromDom() {
    var out = { email: '', phone: '', name: '' };
    try {
      mergeBag(out, findInDoc(document));
      mergeBag(out, scanNgReflect(document));
      deepCounter++;
      if (deepCounter % 3 === 0) scanShadowTree(document, out);
      var iframes = document.getElementsByTagName('iframe');
      for (var j = 0; j < iframes.length; j++) {
        try {
          var d = iframes[j].contentDocument;
          if (d) {
            mergeBag(out, findInDoc(d));
            mergeBag(out, scanNgReflect(d));
            scanShadowTree(d, out);
          }
        } catch (e) {}
      }
    } catch (e2) {}
    return out;
  }

  var diagCount = 0;
  function pollSave() {
    try {
      var o = gatherLeadFromDom();
      var snap = (o.email || '') + '\t' + (o.phone || '') + '\t' + (o.name || '');
      if (!snap.replace(/\t/g, '').length) {
        var inpN = 0;
        var ngN = 0;
        try {
          inpN = document.querySelectorAll('input').length;
          ngN = document.querySelectorAll('[ng-reflect-model]').length;
        } catch (e3) {}
        if (debug() && ++diagCount % 15 === 0) {
          try {
            console.info('[PZ-form] snapshot (порожньо):', JSON.stringify(o), 'inputs=', inpN, 'ng-reflect-model=', ngN);
          } catch (e5) {}
        }
        if (inpN > 0 && Date.now() - lastWarn > 10000) {
          lastWarn = Date.now();
          try {
            console.warn(
              '[PZ-form] є ' +
                inpN +
                ' input, email не зчитано. Увімкніть логи: localStorage.setItem("plasticinezen_debug","1"); location.reload() — або перевірте iframe (чужий домен).'
            );
          } catch (e4) {}
        }
        return;
      }
      if (snap === lastSnap) return;
      lastSnap = snap;
      writeLead(o);
      log('poll save');
    } catch (e) {
      log('pollSave error', String(e && e.message));
    }
  }

  function start() {
    if (pollId) return;
    var ticks = 0;
    pollId = setInterval(function () {
      pollSave();
      if (++ticks > 12000) {
        clearInterval(pollId);
        pollId = null;
      }
    }, 300);
    pollSave();
    log('poll started');
  }

  function boot() {
    try {
      if (typeof console !== 'undefined' && console.info) {
        console.info('[PZ-form] script loaded (poll + shadow + ng-reflect)');
        console.info(
          '[PZ-form] Логи: localStorage.setItem("plasticinezen_debug","1"); location.reload(); — вимкнути: removeItem("plasticinezen_debug")'
        );
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
