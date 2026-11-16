/* Chat marketplace. Logika & konfigurasi diambil dari Pesaner:
 * getConversations / getConversation / sendMessage / markConversationRead / uploadChatFile,
 * paginasi 30 pesan, polling thread 4 dtk, daftar 10 dtk, lencana 20 dtk, batas berkas 25 MB,
 * kirim optimistis (sending -> sent -> read), coba ulang, dan antrean offline.
 * Perbedaan: identitas dari token (bukan parameter username), dan tanpa grup/voice note/kontak. */
(function () {
  'use strict';
  var A = window.Andu, CF = A.CHAT;
  var $ = function (id) { return document.getElementById(id); };
  var app = $('chat-app'); if (!app) return;

  var S = { me: null, contacts: [], convs: [], cur: null, curNama: '', msgs: [], hasMore: false, serverCount: 0, sending: 0, pollT: null, listT: null, produkId: '', params: new URLSearchParams(location.search) };
  var FILE_OK = /^https:\/\/(drive\.google\.com|lh3\.googleusercontent\.com)\//;
  var pendKey = function () { return 'andu_chat_pending_' + S.me.username; };

  // ---------- util ----------
  function initial(n) { return (String(n || '?').trim().charAt(0) || '?').toUpperCase(); }
  function jam(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace(':', '.'); }
  function hariLabel(iso) {
    var d = new Date(iso), n = new Date(), g = function (x) { return x.getFullYear() * 400 + x.getMonth() * 32 + x.getDate(); };
    if (g(d) === g(n)) return 'Hari ini';
    var k = new Date(n.getTime() - 86400000); if (g(d) === g(k)) return 'Kemarin';
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function linkify(escaped) {
    return escaped.replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]])/g, function (u) {
      return '<a href="' + u + '" target="_blank" rel="noopener noreferrer ugc nofollow" class="underline">' + u + '</a>';
    });
  }
  function nearBottom(el) { return el.scrollHeight - el.scrollTop - el.clientHeight < 140; }
  function setView(v) {
    var l = $('chat-panel-list'), t = $('chat-panel-thread');
    l.classList.toggle('hidden', v === 'thread'); l.classList.toggle('flex', v === 'list');
    t.classList.toggle('hidden', v === 'list'); t.classList.toggle('flex', v === 'thread');
  }
  function namaDari(u) {
    var c = S.convs.concat(S.contacts).filter(function (x) { return x.username === u; })[0];
    return c ? c.nama : u;
  }

  // ---------- daftar percakapan ----------
  async function muatKontak() {
    if (S.me.role === 'superadmin') return;
    var r = await A.api('getSupportContacts');
    if (r.success) S.contacts = r.contacts.filter(function (c) { return c.username !== S.me.username; });
  }
  async function muatDaftar() {
    var r = await A.api('getConversations');
    if (!r.success) return;
    var list = r.conversations.slice(), ada = {};
    list.forEach(function (c) { ada[c.username] = 1; });
    S.contacts.forEach(function (c) { if (!ada[c.username]) list.push({ username: c.username, nama: c.nama, role: c.role, lastMessage: 'Mulai percakapan', lastAt: '', unread: 0, kosong: true }); });
    S.convs = list;
    var total = list.reduce(function (n, c) { return n + (c.username === S.cur ? 0 : c.unread || 0); }, 0);
    document.title = (total ? '(' + total + ') ' : '') + 'Pesan | ' + (A.cfg.title || 'ANDU.my.id');
    renderDaftar();
  }
  function renderDaftar() {
    var ul = $('chat-list');
    if (!S.convs.length) { ul.innerHTML = '<li class="p-6 text-center text-sm text-slate-400">Belum ada percakapan.</li>'; return; }
    ul.innerHTML = S.convs.map(function (c) {
      var aktif = c.username === S.cur;
      return '<li><button type="button" data-user="' + A.esc(c.username) + '" class="flex w-full items-center gap-3 p-3 text-left hover:bg-slate-50 ' + (aktif ? 'bg-emerald-50' : '') + '">' +
        '<span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand font-extrabold text-slate-900">' + A.esc(initial(c.nama)) + '</span>' +
        '<span class="min-w-0 flex-1"><span class="flex items-center justify-between gap-2"><span class="truncate font-bold">' + A.esc(c.nama) + (c.role === 'superadmin' ? ' <span class="ikon text-brand-deeper" style="font-size:16px" aria-label="Resmi">verified</span>' : '') + '</span>' +
        '<span class="shrink-0 text-[11px] text-slate-400">' + (c.lastAt ? A.esc(jam(c.lastAt)) : '') + '</span></span>' +
        '<span class="flex items-center justify-between gap-2"><span class="truncate text-xs text-slate-500">' + (c.lastFromMe ? 'Anda: ' : '') + A.esc(c.lastMessage) + '</span>' +
        (c.unread && !aktif ? '<span class="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-extrabold text-slate-900">' + c.unread + '</span>' : '') + '</span></span></button></li>';
    }).join('');
  }

  // ---------- thread ----------
  async function bukaThread(username, opsi) {
    opsi = opsi || {};
    S.cur = username; S.curNama = namaDari(username); S.msgs = []; S.serverCount = 0; S.hasMore = false;
    $('chat-nama').textContent = S.curNama; $('chat-avatar').textContent = initial(S.curNama);
    var k = S.convs.concat(S.contacts).filter(function (c) { return c.username === username; })[0];
    $('chat-peran').textContent = k && k.role === 'superadmin' ? 'Resmi · Siap membantu' : 'Pengguna';
    $('chat-cepat').classList.toggle('hidden', S.me.role === 'superadmin'); $('chat-cepat').classList.toggle('flex', S.me.role !== 'superadmin');
    setView('thread'); renderDaftar();
    $('chat-pesan').innerHTML = '<p class="mt-10 text-center text-sm text-slate-400">Memuat pesan…</p>';
    var u = new URL(location.href); u.searchParams.set('to', username); history.replaceState(null, '', u.pathname + u.search);
    await muatThread(true);
    tandaiBaca();
    mulaiPoll();
    if (opsi.prefill && !$('chat-input').value) { $('chat-input').value = opsi.prefill; autoTinggi(); }
    $('chat-input').focus();
  }

  async function muatThread(awal) {
    var cur = S.cur;
    var r = await A.api('getConversation', { otherUsername: cur, offset: 0, limit: CF.PAGE_SIZE });
    if (cur !== S.cur) return;
    if (!r.success) { A.toast(r.message || 'Gagal memuat pesan.'); return; }
    var lokal = S.msgs.filter(function (m) { return m.local; });
    S.msgs = r.messages.concat(lokal.length ? lokal : pendingUntuk(cur));
    S.serverCount = r.messages.length; S.hasMore = r.hasMore;
    render(awal ? 'bawah' : 'tetap');
  }

  async function muatLama() {
    var el = $('chat-pesan'), tinggiLama = el.scrollHeight;
    var r = await A.api('getConversation', { otherUsername: S.cur, offset: S.serverCount, limit: CF.PAGE_SIZE });
    if (!r.success) return;
    var lokal = S.msgs.filter(function (m) { return m.local; }), server = S.msgs.filter(function (m) { return !m.local; });
    S.msgs = r.messages.concat(server, lokal);
    S.serverCount += r.messages.length; S.hasMore = r.hasMore;
    render('tetap'); el.scrollTop = el.scrollHeight - tinggiLama;
  }

  async function poll() {
    if (document.hidden || !S.cur || S.sending > 0) return;
    var cur = S.cur;
    var r = await A.api('getConversation', { otherUsername: cur, offset: 0, limit: CF.PAGE_SIZE }, { noRedirect: true });
    if (!r.success || cur !== S.cur || S.sending > 0) return;
    var known = {}; S.msgs.forEach(function (m) { if (!m.local) known[m.id] = m; });
    var baru = [], berubah = false;
    r.messages.forEach(function (m) { var k = known[m.id]; if (!k) baru.push(m); else if (k.read !== m.read) { k.read = m.read; berubah = true; } });
    if (!baru.length && !berubah) return;
    var el = $('chat-pesan'), bawah = nearBottom(el);
    var server = S.msgs.filter(function (m) { return !m.local; }).concat(baru).sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; });
    S.msgs = server.concat(S.msgs.filter(function (m) { return m.local; }));
    S.serverCount += baru.length;
    render(bawah ? 'bawah' : 'tetap');
    var masuk = baru.filter(function (m) { return m.fromUsername !== S.me.username; });
    if (masuk.length) { tandaiBaca(); notif(masuk[masuk.length - 1]); muatDaftar(); }
  }
  function mulaiPoll() { clearInterval(S.pollT); S.pollT = setInterval(poll, CF.THREAD_POLL_MS); }

  function tandaiBaca() {
    if (!S.cur || document.hidden) return;
    A.api('markConversationRead', { otherUsername: S.cur }, { noRedirect: true }).then(function () {
      S.convs.forEach(function (c) { if (c.username === S.cur) c.unread = 0; }); renderDaftar();
    });
  }

  // ---------- render pesan ----------
  function ikonStatus(m) {
    if (m.fromUsername !== S.me.username) return '';
    var s = m.local ? m.status : (m.read ? 'read' : 'sent');
    var map = { sending: ['schedule', 'text-slate-400', 'Mengirim'], pending: ['cloud_off', 'text-slate-400', 'Menunggu koneksi'], failed: ['error', 'text-red-600', 'Gagal'], sent: ['done', 'text-slate-400', 'Terkirim'], read: ['done_all', 'text-sky-600', 'Dibaca'] };
    var x = map[s] || map.sent;
    return '<span class="ikon ' + x[1] + '" style="font-size:15px" title="' + x[2] + '" aria-label="' + x[2] + '">' + x[0] + '</span>';
  }
  function isiPesan(m) {
    if (m.type === 'image' && FILE_OK.test(m.fileUrl || '')) {
      return '<a href="' + A.esc(m.fileUrl) + '" target="_blank" rel="noopener noreferrer"><img src="' + A.esc(m.fileUrl) + '" alt="' + A.esc(m.fileName || 'Foto') + '" class="mb-1 max-h-60 rounded-lg" loading="lazy" referrerpolicy="no-referrer"></a>' + (m.content ? '<div>' + linkify(A.esc(m.content)) + '</div>' : '');
    }
    if (m.type === 'file' && FILE_OK.test(m.fileUrl || '')) {
      return '<a href="' + A.esc(m.fileUrl) + '" target="_blank" rel="noopener noreferrer" class="flex items-center gap-2 underline"><span class="ikon" aria-hidden="true">description</span><span class="break-all">' + A.esc(m.fileName || 'Berkas') + '</span></a>' + (m.content ? '<div class="mt-1">' + linkify(A.esc(m.content)) + '</div>' : '');
    }
    if ((m.type === 'image' || m.type === 'file') && m.local) return '<span class="ikon" aria-hidden="true">attach_file</span> ' + A.esc(m.fileName || 'Berkas') + ' <span class="text-xs opacity-70">(mengunggah…)</span>';
    return linkify(A.esc(m.content || ''));
  }
  function render(posisi) {
    var el = $('chat-pesan'), html = '', hari = '';
    if (S.hasMore) html += '<div class="mb-2 text-center"><button type="button" id="chat-muat-lama" class="chip !bg-white ring-1 ring-slate-200">Muat pesan sebelumnya</button></div>';
    if (!S.msgs.length) html += '<p class="mt-10 text-center text-sm text-slate-400">Belum ada pesan. Sapa penjual 👋</p>';
    S.msgs.forEach(function (m) {
      var h = hariLabel(m.createdAt);
      if (h !== hari) { hari = h; html += '<div class="my-3 text-center"><span class="chip !bg-white ring-1 ring-slate-200">' + A.esc(h) + '</span></div>'; }
      var mine = m.fromUsername === S.me.username;
      html += '<div class="mb-1.5 flex ' + (mine ? 'justify-end' : 'justify-start') + '"><div class="max-w-[82%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm shadow-sm ' + (mine ? 'rounded-br-sm bg-brand/90 text-slate-900' : 'rounded-bl-sm bg-white') + '">' +
        isiPesan(m) +
        '<div class="mt-0.5 flex items-center justify-end gap-1 text-[10px] ' + (mine ? 'text-slate-700' : 'text-slate-400') + '">' + A.esc(jam(m.createdAt)) + ikonStatus(m) +
        (m.local && m.status === 'failed' ? ' <button type="button" class="font-bold text-red-700 underline" data-ulang="' + A.esc(m.id) + '">Coba lagi</button>' : '') + '</div></div></div>';
    });
    el.innerHTML = html;
    if (posisi === 'bawah') el.scrollTop = el.scrollHeight;
  }

  // ---------- kirim: optimistis, coba ulang, antrean offline ----------
  function bacaPending() { try { return JSON.parse(localStorage.getItem(pendKey()) || '[]'); } catch (e) { return []; } }
  function tulisPending(a) { try { localStorage.setItem(pendKey(), JSON.stringify(a.slice(0, 50))); } catch (e) {} }
  function simpanPending(m) {
    var a = bacaPending().filter(function (x) { return x.id !== m.id; });
    a.push({ id: m.id, toUsername: m.toUsername, content: m.content, type: m.type, fileUrl: m.fileUrl || '', fileName: m.fileName || '', mimeType: m.mimeType || '', productId: m.productId || '', createdAt: m.createdAt });
    tulisPending(a);
  }
  function hapusPending(id) { tulisPending(bacaPending().filter(function (x) { return x.id !== id; })); }
  function pendingUntuk(user) {
    return bacaPending().filter(function (x) { return x.toUsername === user; }).map(function (x) { return Object.assign({ fromUsername: S.me.username, read: false, local: true, status: 'pending' }, x); });
  }

  async function kirimServer(m) {
    if (!navigator.onLine) { m.status = 'pending'; simpanPending(m); render('tetap'); return; }
    S.sending++; var lamaId = m.id;
    try {
      var r = await A.api('sendMessage', { toUsername: m.toUsername, content: m.content, type: m.type, fileUrl: m.fileUrl, fileName: m.fileName, mimeType: m.mimeType, productId: m.productId }, { noRedirect: true });
      if (r.success) { m.id = r.messageId; m.createdAt = r.createdAt; m.local = false; m.status = 'sent'; hapusPending(lamaId); S.serverCount++; }
      else { m.status = 'failed'; A.toast(r.message || 'Pesan gagal dikirim.'); hapusPending(lamaId); }
    } catch (e) { m.status = 'pending'; simpanPending(m); }
    finally { S.sending--; }
    render('bawah'); muatDaftar();
  }

  function pesanLokal(extra) {
    return Object.assign({ id: 'tmp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), local: true, status: 'sending', fromUsername: S.me.username, toUsername: S.cur, content: '', type: 'text', fileUrl: '', fileName: '', mimeType: '', productId: S.produkId, createdAt: new Date().toISOString(), read: false }, extra);
  }

  async function kirimTeks() {
    var inp = $('chat-input'), teks = inp.value.trim();
    if (!teks || !S.cur) return;
    if (teks.length > CF.MAX_TEXT) { A.toast('Pesan terlalu panjang.'); return; }
    inp.value = ''; autoTinggi();
    var m = pesanLokal({ content: teks }); S.msgs.push(m); render('bawah');
    await kirimServer(m);
  }

  function bacaBase64(file) {
    return new Promise(function (ok, gagal) {
      var fr = new FileReader();
      fr.onload = function () { ok(String(fr.result).split(',')[1] || ''); };
      fr.onerror = gagal; fr.readAsDataURL(file);
    });
  }
  async function kirimBerkas(file) {
    if (!S.cur) { A.toast('Pilih percakapan dulu.'); return; }
    if (file.size > CF.MAX_FILE_BYTES) { A.toast('Ukuran berkas maksimal 25 MB.'); return; }
    var gambar = /^image\//.test(file.type);
    var m = pesanLokal({ type: gambar ? 'image' : 'file', fileName: file.name, mimeType: file.type || '' }); m._berkas = file;
    S.msgs.push(m); render('bawah'); S.sending++;
    try {
      var up = await A.api('uploadChatFile', { fileName: file.name, mimeType: file.type || 'application/octet-stream', base64Data: await bacaBase64(file) }, { noRedirect: true });
      if (!up.success) { m.status = 'failed'; A.toast(up.message || 'Unggah gagal.'); render('tetap'); return; }
      m.fileUrl = up.directUrl; m.mimeType = up.mimeType;
    } catch (e) { m.status = 'failed'; A.toast('Unggah gagal. Periksa koneksi.'); render('tetap'); return; }
    finally { S.sending--; }
    await kirimServer(m);
  }

  async function ulang(id) {
    var m = S.msgs.filter(function (x) { return x.id === id; })[0]; if (!m) return;
    m.status = 'sending'; render('tetap');
    if ((m.type === 'image' || m.type === 'file') && !m.fileUrl && m._berkas) { await kirimBerkas2(m); return; }
    await kirimServer(m);
  }
  async function kirimBerkas2(m) {
    S.sending++;
    try {
      var up = await A.api('uploadChatFile', { fileName: m._berkas.name, mimeType: m._berkas.type || 'application/octet-stream', base64Data: await bacaBase64(m._berkas) }, { noRedirect: true });
      if (!up.success) { m.status = 'failed'; render('tetap'); return; }
      m.fileUrl = up.directUrl; m.mimeType = up.mimeType;
    } catch (e) { m.status = 'failed'; render('tetap'); return; } finally { S.sending--; }
    await kirimServer(m);
  }

  async function kirimPending() {
    if (!navigator.onLine) return;
    var a = bacaPending();
    for (var i = 0; i < a.length; i++) {
      var x = a[i], m = S.msgs.filter(function (y) { return y.id === x.id; })[0] || Object.assign({ fromUsername: S.me.username, read: false, local: true, status: 'pending' }, x);
      if (m.toUsername === S.cur && S.msgs.indexOf(m) === -1) S.msgs.push(m);
      await kirimServer(m);
    }
  }

  // ---------- notifikasi ----------
  function notif(m) {
    if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
    try { new Notification(m.fromName || 'Pesan baru', { body: m.type === 'text' ? m.content : (m.type === 'image' ? '📷 Foto' : '📎 ' + (m.fileName || 'Berkas')), tag: 'andu-chat' }); } catch (e) {}
  }
  function autoTinggi() { var i = $('chat-input'); i.style.height = 'auto'; i.style.height = Math.min(i.scrollHeight, 128) + 'px'; }

  // ---------- konteks produk/pesanan dari tautan ----------
  async function pasangKonteks() {
    var pid = S.params.get('produk'), order = S.params.get('order'), box = $('chat-konteks');
    if (pid) {
      S.produkId = pid;
      var p = (await A.produk()).filter(function (x) { return x.id === pid; })[0];
      if (p) {
        box.innerHTML = '<span class="min-w-0 truncate"><strong>Konsultasi produk:</strong> ' + A.esc(p.nama) + ' · ' + A.esc(A.rupiah(p.harga)) + '</span>' +
          '<button type="button" id="chat-sisip" class="btn-brand !px-2.5 !py-1 text-xs">+ Sisipkan</button>';
        box.classList.remove('hidden'); box.classList.add('flex');
        $('chat-sisip').addEventListener('click', function () {
          var i = $('chat-input'); i.value = (i.value ? i.value + '\n' : '') + 'Produk: ' + p.nama + ' (' + location.origin + A.url('/produk/' + p.slug + '/') + ')'; autoTinggi(); i.focus();
        });
      }
    } else if (order) {
      box.innerHTML = '<span><strong>Pesanan:</strong> ' + A.esc(order) + '</span>'; box.classList.remove('hidden'); box.classList.add('flex');
    }
  }

  // ---------- pencarian pengguna (superadmin, minimal 3 huruf seperti Pesaner) ----------
  var cariT;
  function pasangCari() {
    $('chat-search-wrap').classList.remove('hidden');
    $('chat-search').addEventListener('input', function (e) {
      clearTimeout(cariT); var q = e.target.value.trim(), ul = $('chat-search-hasil');
      if (q.length < CF.MIN_SEARCH_CHARS) { ul.innerHTML = ''; return; }
      cariT = setTimeout(async function () {
        var r = await A.api('searchUsers', { q: q });
        ul.innerHTML = r.success && r.users.length ? r.users.map(function (u) {
          return '<li><button type="button" class="flex w-full items-center gap-2 rounded-lg p-2 text-left text-sm hover:bg-slate-100" data-cari="' + A.esc(u.username) + '" data-nama="' + A.esc(u.nama) + '"><span class="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 font-bold">' + A.esc(initial(u.nama)) + '</span><span><strong>' + A.esc(u.nama) + '</strong> <span class="text-slate-500">@' + A.esc(u.username) + '</span></span></button></li>';
        }).join('') : '<li class="p-2 text-xs text-slate-400">Tidak ditemukan.</li>';
      }, 300);
    });
    $('chat-search-hasil').addEventListener('click', function (e) {
      var b = e.target.closest('[data-cari]'); if (!b) return;
      S.contacts.push({ username: b.getAttribute('data-cari'), nama: b.getAttribute('data-nama'), role: '' });
      $('chat-search').value = ''; $('chat-search-hasil').innerHTML = ''; bukaThread(b.getAttribute('data-cari'));
    });
  }

  // ---------- inisialisasi ----------
  async function mulai() {
    var u = A.user();
    if (!u) { $('chat-masuk').classList.remove('hidden'); $('chat-link-masuk').href = A.url('/akun/') + '?next=' + encodeURIComponent(location.pathname + location.search); return; }
    S.me = u; app.classList.remove('hidden'); setView('list');
    if (u.role === 'superadmin') pasangCari();
    $('chat-notif').addEventListener('click', function () {
      if (!('Notification' in window)) { A.toast('Peramban tidak mendukung notifikasi.'); return; }
      Notification.requestPermission().then(function (p) { A.toast(p === 'granted' ? 'Notifikasi aktif' : 'Notifikasi tidak diizinkan'); });
    });
    $('chat-list').addEventListener('click', function (e) { var b = e.target.closest('[data-user]'); if (b) bukaThread(b.getAttribute('data-user')); });
    $('chat-kembali').addEventListener('click', function () { setView('list'); S.cur = null; clearInterval(S.pollT); renderDaftar(); muatDaftar(); });
    $('chat-pesan').addEventListener('click', function (e) {
      if (e.target.closest('#chat-muat-lama')) muatLama();
      var r = e.target.closest('[data-ulang]'); if (r) ulang(r.getAttribute('data-ulang'));
    });
    $('chat-cepat').addEventListener('click', function (e) { var b = e.target.closest('[data-balas]'); if (!b) return; var i = $('chat-input'); i.value = b.getAttribute('data-balas'); autoTinggi(); i.focus(); });
    $('chat-form').addEventListener('submit', function (e) { e.preventDefault(); kirimTeks(); });
    $('chat-input').addEventListener('input', autoTinggi);
    $('chat-input').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); kirimTeks(); } });
    $('chat-berkas').addEventListener('change', function (e) { var f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) kirimBerkas(f); });
    window.addEventListener('online', kirimPending);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { poll(); muatDaftar(); tandaiBaca(); } });

    await Promise.all([muatKontak(), pasangKonteks()]);
    await muatDaftar();
    var to = (S.params.get('to') || '').toLowerCase();
    if (!to && u.role !== 'superadmin' && S.convs.length === 0) to = A.cfg.support;
    if (to && to !== u.username) {
      if (!S.convs.concat(S.contacts).some(function (c) { return c.username === to; })) S.contacts.push({ username: to, nama: to, role: '' });
      await bukaThread(to, { prefill: S.params.get('pesan') || '' });
    }
    clearInterval(S.listT); S.listT = setInterval(function () { if (!document.hidden) muatDaftar(); }, CF.LIST_POLL_MS);
    kirimPending();
  }
  mulai();
})();
