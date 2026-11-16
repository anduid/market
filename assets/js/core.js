/* ANDU Marketplace: inti sisi klien. Menyediakan window.Andu (api, sesi, keranjang, util). */
(function () {
  'use strict';
  var C = window.ANDU || {};
  var A = (window.Andu = {});
  A.cfg = C;

  // Konfigurasi chat (nilai diambil dari Pesaner)
  A.CHAT = { PAGE_SIZE: 30, THREAD_POLL_MS: 4000, LIST_POLL_MS: 10000, BADGE_POLL_MS: 20000, MAX_FILE_BYTES: 25 * 1024 * 1024, MIN_SEARCH_CHARS: 3, MAX_TEXT: 2000 };

  A.url = function (p) { return (C.base || '') + p; };
  A.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  };
  A.rupiah = function (n) {
    n = Number(n) || 0;
    return n === 0 ? 'Gratis' : 'Rp ' + n.toLocaleString('id-ID');
  };
  A.tgl = function (iso) {
    var d = new Date(iso); if (isNaN(d)) return '';
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace(':', '.');
  };
  A.driveThumb = function (id, w) { return id ? 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w' + (w || 400) : ''; };

  var toastTimer;
  A.toast = function (msg, ms) {
    var el = document.getElementById('toast'); if (!el) return;
    el.textContent = msg; el.classList.remove('hidden');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.classList.add('hidden'); }, ms || 3000);
  };

  // ---------- sesi pembeli (localStorage, berakhir sesuai token) ----------
  var KEY = 'andu_session';
  A.session = {
    get: function () {
      try {
        var s = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (!s || !s.token || (s.exp && s.exp < Date.now())) { localStorage.removeItem(KEY); return null; }
        return s;
      } catch (e) { return null; }
    },
    set: function (token, user, ttlSec) {
      localStorage.setItem(KEY, JSON.stringify({ token: token, user: user, exp: Date.now() + (ttlSec || 43200) * 1000 }));
    },
    update: function (user) { var s = A.session.get(); if (s) { s.user = user; localStorage.setItem(KEY, JSON.stringify(s)); } },
    clear: function () { localStorage.removeItem(KEY); }
  };
  A.user = function () { var s = A.session.get(); return s ? s.user : null; };

  // Alamat tujuan setelah login: hanya jalur dalam situs ini (cegah open redirect).
  A.amanNext = function (n) {
    n = String(n || '');
    var base = C.base || '';
    return n.charAt(0) === '/' && n.charAt(1) !== '/' && n.indexOf('\\') === -1 && (!base || n.indexOf(base + '/') === 0 || n === base) ? n : '';
  };
  A.requireLogin = function () {
    if (A.session.get()) return true;
    var next = location.pathname + location.search;
    location.href = A.url('/akun/') + '?next=' + encodeURIComponent(next);
    return false;
  };

  // ---------- API ----------
  // Baca publik: GET (bisa di-cache). Aksi bertoken: POST text/plain (tanpa preflight CORS).
  A.pub = async function (action, params) {
    var qs = new URLSearchParams(Object.assign({ action: action }, params || {})).toString();
    var res = await fetch(C.api + '?' + qs, { redirect: 'follow' });
    return res.json();
  };
  A.api = async function (action, params, opts) {
    opts = opts || {};
    var s = opts.session || A.session.get();
    var body = JSON.stringify(Object.assign({ action: action, token: s ? s.token : '' }, params || {}));
    var res = await fetch(C.api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body, redirect: 'follow' });
    var data = await res.json();
    if (data && data.success === false && /Sesi|masuk lagi|Akun tidak aktif/.test(data.message || '') && !opts.noRedirect) {
      (opts.onExpired || function () { A.session.clear(); A.toast('Sesi berakhir. Silakan masuk lagi.'); })();
    }
    return data;
  };

  // ---------- keranjang ----------
  var CK = 'andu_cart';
  A.cart = {
    ids: function () { try { var a = JSON.parse(localStorage.getItem(CK) || '[]'); return Array.isArray(a) ? a.filter(function (x) { return typeof x === 'string'; }).slice(0, 20) : []; } catch (e) { return []; } },
    save: function (a) { localStorage.setItem(CK, JSON.stringify(a)); A.updateBadges(); },
    add: function (id) { var a = A.cart.ids(); if (a.indexOf(id) !== -1) return false; a.push(id); A.cart.save(a); return true; },
    remove: function (id) { A.cart.save(A.cart.ids().filter(function (x) { return x !== id; })); },
    clear: function () { A.cart.save([]); },
    count: function () { return A.cart.ids().length; }
  };

  var produkCache = null;
  A.produk = async function () {
    if (produkCache) return produkCache;
    try { var r = await fetch(A.url('/assets/data/produk.json')); produkCache = await r.json(); } catch (e) { produkCache = []; }
    return produkCache;
  };

  A.updateBadges = function (unread) {
    var n = A.cart.count(), b = document.getElementById('lencana-keranjang');
    if (b) { b.textContent = n; b.classList.toggle('hidden', n === 0); }
    var u = A.user();
    var chat = document.getElementById('tombol-chat');
    if (chat) { chat.classList.toggle('hidden', !u); chat.classList.toggle('flex', !!u); }
    if (typeof unread === 'number') {
      var l = document.getElementById('lencana-chat');
      if (l) { l.textContent = unread > 99 ? '99+' : unread; l.classList.toggle('hidden', unread === 0); }
    }
  };

  var badgeTimer;
  A.pollBadge = function () {
    clearInterval(badgeTimer);
    if (!A.session.get() || /\/pesan\/?$/.test(location.pathname)) return;
    var run = async function () {
      if (document.hidden || !A.session.get()) return;
      try { var r = await A.api('getUnreadCount', {}, { noRedirect: true }); if (r.success) A.updateBadges(r.unread); } catch (e) {}
    };
    run(); badgeTimer = setInterval(run, A.CHAT.BADGE_POLL_MS);
  };

  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-tambah],[data-beli]') : null;
    if (!t) return;
    var id = t.getAttribute('data-tambah') || t.getAttribute('data-beli');
    if (!id) return;
    e.preventDefault();
    var baru = A.cart.add(id);
    if (t.hasAttribute('data-beli')) { location.href = A.url('/keranjang/'); return; }
    A.toast(baru ? 'Ditambahkan ke keranjang' : 'Produk sudah ada di keranjang');
  });

  document.addEventListener('DOMContentLoaded', function () {
    A.updateBadges(); A.pollBadge();
    window.addEventListener('storage', function () { A.updateBadges(); });
  });
})();
