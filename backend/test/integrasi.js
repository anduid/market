/**
 * Uji integrasi: JavaScript sisi klien (core, akun, keranjang, pesanan, chat, admin) dijalankan di jsdom
 * dan dihubungkan ke backend Code.gs (simulasi) sehingga kontrak API kedua sisi ikut teruji.
 * Jalankan:  node backend/test/integrasi.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const H = require('./harness');
const { ctx, call, files: driveFiles, logs } = H;
const ROOT = path.join(__dirname, '..', '..');
const BASE = '/market', SUPPORT = 'andu';

let pass = 0, failed = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓', n); } else { failed++; console.log('  ✗', n, d !== undefined ? '→ ' + JSON.stringify(d) : ''); } };
const sec = (t) => console.log('\n' + t);
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
async function tunggu(cond, ms = 4000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (cond()) return true; } catch (e) {} await tidur(15); } return false; }

// ---------- pemuat halaman: template Jekyll -> HTML (Liquid dibuang, jalur relative_url diisi) ----------
function strip(src) {
  if (src.startsWith('---')) src = src.split('---').slice(2).join('---');
  src = src.replace(/\{\{\s*'([^']*)'\s*\|\s*relative_url\s*\}\}/g, (m, p) => BASE + p);
  return src.replace(/\{%[\s\S]*?%\}/g, '').replace(/\{\{[\s\S]*?\}\}/g, '');
}
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
function produkJson() {
  const r = call('getPublicProducts', {}, 'GET');
  return r.products.map((p) => ({ id: p.id, slug: 'p-' + p.id.toLowerCase(), nama: p.nama, ringkas: '', harga: p.harga, harga_coret: p.hargaCoret, diskon: 0, stok: p.stok, kategori: p.kategori, gambar_id: p.gambarId, penjual: p.penjualUsername }));
}
const windows = [];
function bukaHalaman(file, { search = '', scripts = [], storage = {}, session = {}, layout = 'default', online = () => true, fixtureHtml = '' } = {}) {
  const header = layout === 'default' ? strip(read('_includes/header.html')) : '';
  const html = `<!doctype html><html><body data-guard="${layout === 'admin' ? 'true' : ''}">${header}<main>${strip(read(file))}${fixtureHtml}</main><div id="toast" class="hidden"></div></body></html>`;
  const vc = new VirtualConsole(); vc.on('jsdomError', () => {});
  const dom = new JSDOM(html, { url: 'https://andu.test' + BASE + '/' + file.replace(/\.html$/, '/').replace(/^index\//, '') + search, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window; windows.push(w);
  const tutupAsli = w.close.bind(w); w.close = () => setTimeout(tutupAsli, 250); // beri waktu proses async selesai
  w.ANDU = { api: 'https://gas.test/exec', base: BASE, support: SUPPORT };
  w.Element.prototype.scrollIntoView = () => {}; w.confirm = () => true;
  Object.defineProperty(w.navigator, 'onLine', { get: online, configurable: true });
  Object.entries(storage).forEach(([k, v]) => w.localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)));
  Object.entries(session).forEach(([k, v]) => w.sessionStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)));
  w.fetch = async (url, opts = {}) => {
    const u = new URL(url, 'https://andu.test');
    if (u.pathname.endsWith('/assets/data/produk.json')) return { json: async () => produkJson() };
    if (u.host !== 'gas.test') throw new Error('fetch tak terduga: ' + url);
    let out;
    if ((opts.method || 'GET') === 'POST') { const b = JSON.parse(opts.body); const { action, ...rest } = b; out = call(action, rest, 'POST'); }
    else { const q = Object.fromEntries(u.searchParams); const { action, ...rest } = q; out = call(action, rest, 'GET'); }
    return { json: async () => JSON.parse(JSON.stringify(out)) };
  };
  ['core', ...scripts].forEach((s) => w.eval(read('assets/js/' + s + '.js')));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return w;
}
const $ = (w, id) => w.document.getElementById(id);
const tipe = (w, id, v) => { const e = $(w, id); e.value = v; e.dispatchEvent(new w.Event('input', { bubbles: true })); };
const kirimForm = (w, id) => $(w, id).dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
const klik = (el) => el.dispatchEvent(new el.ownerDocument.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }));
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.alloc(64, 7)]);
function pilihBerkas(w, id, nama, tipeMime, bytes) {
  const input = $(w, id), f = new w.File([bytes], nama, { type: tipeMime });
  Object.defineProperty(input, 'files', { value: [f], configurable: true });
  input.dispatchEvent(new w.Event('change', { bubbles: true }));
}

(async () => {
  // ============================================================
  sec('0. Persiapan data lewat backend');
  ctx.setupAwal();
  const mm = logs.join('\n').match(/Username: (\S+) \| Sandi: (\S+)/); const SU = mm[1], SUPW = mm[2];
  const adm = call('login', { username: SU, password: SUPW });
  const mk = (p) => call('addProduct', { token: adm.token, product: Object.assign({ deskripsi: 'Deskripsi', kategori: 'Source Code', stok: 5, status: 'aktif' }, p) }).id;
  const XSS = '<img src=x onerror="window.__xss=1">Produk Nakal';
  const PA = mk({ nama: XSS, harga: 249000, linkDownload: 'https://drive.google.com/rahasia-a' });
  const PB = mk({ nama: 'Boilerplate Gratis', harga: 0, linkDownload: 'https://drive.google.com/gratis-b' });
  const PC = mk({ nama: 'Produk Habis', harga: 1000, stok: 0 });
  ok(!!PA && !!PB && !!PC, 'tiga produk contoh dibuat');

  // ============================================================
  sec('1. Akun: daftar dan masuk lewat formulir');
  let w = bukaHalaman('akun.html', { scripts: ['akun'] });
  ok(!$(w, 'akun-auth').classList.contains('hidden') && $(w, 'akun-profil').classList.contains('hidden'), 'belum masuk: formulir masuk/daftar tampil');
  klik($(w, 'tab-daftar'));
  tipe(w, 'd-nama', 'Sari Pembeli'); tipe(w, 'd-user', 'sari'); tipe(w, 'd-telp', '08123456789'); tipe(w, 'd-pass', 'rahasia123');
  kirimForm(w, 'form-daftar');
  ok(await tunggu(() => w.localStorage.getItem('andu_session')), 'daftar lalu masuk otomatis; sesi tersimpan');
  const sess = JSON.parse(w.localStorage.getItem('andu_session'));
  ok(sess.user.username === 'sari' && sess.user.role === 'pembeli' && sess.exp > Date.now(), 'sesi memuat pengguna dan masa berlaku');
  ok(await tunggu(() => !$(w, 'akun-profil').classList.contains('hidden')), 'tampilan berganti ke profil');
  ok($(w, 'p-nama').textContent === 'Sari Pembeli' && $(w, 'pr-telp').value === '08123456789', 'profil terisi (nomor telepon tetap berawalan 0)');
  tipe(w, 'pr-nama', 'Sari Baru'); kirimForm(w, 'form-profil');
  ok(await tunggu(() => call('me', { token: sess.token }).user.nama === 'Sari Baru'), 'ubah profil tersimpan di backend');
  w.close();
  w = bukaHalaman('akun.html', { scripts: ['akun'] }); klik($(w, 'tab-masuk'));
  tipe(w, 'm-user', 'sari'); tipe(w, 'm-pass', 'salah-salah'); kirimForm(w, 'form-masuk');
  ok(await tunggu(() => /salah/.test($(w, 'auth-pesan').textContent)), 'sandi salah menampilkan pesan galat');

  // ============================================================
  sec('2. Keranjang dan pembuatan pesanan');
  const SESI = { andu_session: { token: sess.token, user: sess.user, exp: Date.now() + 3600e3 } };
  w = bukaHalaman('index.html', { fixtureHtml: `<button data-tambah="${PA}" id="btn-a">+</button><button data-beli="${PB}" id="btn-b">beli</button>` });
  klik($(w, 'btn-a'));
  ok(JSON.stringify(w.Andu.cart.ids()) === JSON.stringify([PA]), 'klik [data-tambah] memasukkan produk ke keranjang');
  ok($(w, 'lencana-keranjang').textContent === '1' && !$(w, 'lencana-keranjang').classList.contains('hidden'), 'lencana keranjang di header terupdate');
  klik($(w, 'btn-a')); ok(w.Andu.cart.count() === 1, 'produk yang sama tidak ganda');
  w.close();

  w = bukaHalaman('keranjang.html', { scripts: ['keranjang'], storage: Object.assign({ andu_cart: [PA, PB, PC, 'PRD-TIDAKADA'] }, SESI) });
  ok(await tunggu(() => w.document.querySelectorAll('#keranjang-daftar li').length === 3), 'tiga produk valid tampil (id yang tak dikenal dibuang)');
  ok(!w.__xss && !w.document.querySelector('#keranjang-daftar img[onerror]'), 'nama produk berisi HTML tidak dieksekusi (XSS tertahan)');
  ok(w.document.getElementById('keranjang-daftar').textContent.includes('<img src=x'), 'nama produk tampil sebagai teks biasa');
  ok(/Stok habis/.test($(w, 'keranjang-daftar').textContent), 'produk stok 0 ditandai habis');
  klik(w.document.querySelector('[data-hapus="' + PC + '"]'));
  ok(await tunggu(() => w.document.querySelectorAll('#keranjang-daftar li').length === 2), 'hapus item dari keranjang');
  ok($(w, 'ringkas-total').textContent.replace(/\s/g, '') === 'Rp249.000', 'total di layar = harga produk berbayar', $(w, 'ringkas-total').textContent);
  tipe(w, 'catatan', 'untuk instansi X'); klik($(w, 'btn-checkout'));
  ok(await tunggu(() => !$(w, 'hasil-pesanan').classList.contains('hidden')), 'pesanan dibuat; panel hasil tampil');
  const hasilTeks = $(w, 'hasil-pesanan').textContent;
  ok(/INV-[A-Z0-9]{10}/.test(hasilTeks) && /Langkah pembayaran/.test(hasilTeks), 'nomor pesanan dan langkah pembayaran tampil');
  ok(w.Andu.cart.count() === 0, 'keranjang dikosongkan setelah pesanan');
  const linkChat = w.document.querySelector('#hasil-pesanan a[href*="/pesan/"]').getAttribute('href');
  ok(linkChat.includes('to=andu') && linkChat.includes('order=INV-') && linkChat.startsWith(BASE + '/pesan/'), 'tombol "Kirim bukti lewat chat" membawa penerima dan nomor pesanan', linkChat);
  const ordList = call('getMyOrders', { token: sess.token }).orders;
  ok(ordList.length === 1 && ordList[0].total === 249000 && ordList[0].status === 'menunggu' && ordList[0].items.length === 2, 'backend menyimpan pesanan (total 249.000, 2 item)');
  const ORD = ordList[0].id;
  w.close();

  sec('3. Pesanan dan pelepasan unduhan');
  w = bukaHalaman('pesanan.html', { scripts: ['pesanan'], storage: SESI });
  ok(await tunggu(() => /INV-/.test($(w, 'pesanan-daftar').textContent)), 'daftar pesanan tampil');
  ok(/Menunggu pembayaran/.test($(w, 'pesanan-daftar').textContent) && !w.document.querySelector('#pesanan-daftar a[href*="drive.google.com"]'), 'belum lunas: tidak ada tombol unduh');
  ok(!!w.document.querySelector('#pesanan-daftar a[href*="/pesan/"]'), 'ada tautan kirim bukti pembayaran');
  w.close();
  call('updateOrderStatus', { token: adm.token, id: ORD, status: 'lunas' });
  w = bukaHalaman('pesanan.html', { scripts: ['pesanan'], storage: SESI });
  ok(await tunggu(() => w.document.querySelectorAll('#pesanan-daftar a[href*="drive.google.com"]').length === 2), 'setelah lunas: dua tombol Unduh muncul');
  const hrefs = [...w.document.querySelectorAll('#pesanan-daftar a[href*="drive.google.com"]')].map((a) => a.getAttribute('href'));
  ok(hrefs.includes('https://drive.google.com/rahasia-a') && hrefs.includes('https://drive.google.com/gratis-b'), 'tautan unduhan benar');
  ok([...w.document.querySelectorAll('#pesanan-daftar a[href*="drive.google.com"]')].every((a) => /noopener/.test(a.rel) && a.target === '_blank'), 'tautan unduhan memakai rel=noopener');
  w.close();

  // ============================================================
  sec('4. Chat pembeli ↔ admin (logika Pesaner)');
  const ADMSESI = { andu_session: { token: adm.token, user: adm.user, exp: Date.now() + 3600e3 } };
  let online = true;
  let wb = bukaHalaman('pesan.html', { scripts: ['chat'], search: `?to=${SUPPORT}&produk=${PA}&pesan=Halo%20saya%20tertarik`, storage: SESI, online: () => online });
  ok(await tunggu(() => !$(wb, 'chat-app').classList.contains('hidden')), 'aplikasi chat tampil untuk pengguna yang masuk');
  ok(await tunggu(() => $(wb, 'chat-nama').textContent === 'ANDU Support'), 'percakapan dengan dukungan terbuka otomatis dari parameter ?to=');
  ok($(wb, 'chat-input').value === 'Halo saya tertarik', 'kolom pesan terisi dari parameter ?pesan=');
  ok($(wb, 'chat-konteks').textContent.includes('Konsultasi produk') && !$(wb, 'chat-konteks').querySelector('img'), 'banner konteks produk tampil dan di-escape');
  kirimForm(wb, 'chat-form');
  ok(await tunggu(() => /Halo saya tertarik/.test($(wb, 'chat-pesan').textContent)), 'pesan muncul langsung (kirim optimistis)');
  ok(await tunggu(() => $(wb, 'chat-pesan').querySelector('[aria-label="Terkirim"]')), 'status berubah menjadi terkirim (✓)');
  const msgsA = call('getConversation', { token: adm.token, otherUsername: 'sari' });
  ok(msgsA.messages.length === 1 && msgsA.messages[0].content === 'Halo saya tertarik' && msgsA.messages[0].productId === PA, 'pesan tersimpan di backend beserta konteks produk');

  let wa = bukaHalaman('pesan.html', { scripts: ['chat'], storage: ADMSESI });
  ok(await tunggu(() => $(wa, 'chat-list').textContent.includes('Sari Baru')), 'admin melihat percakapan dari pembeli');
  ok(/1/.test($(wa, 'chat-list').querySelector('[data-user="sari"]').textContent), 'jumlah belum dibaca (1) tampil di daftar');
  ok(!$(wa, 'chat-search-wrap').classList.contains('hidden'), 'admin mendapat kolom cari pengguna');
  klik($(wa, 'chat-list').querySelector('[data-user="sari"]'));
  ok(await tunggu(() => /Halo saya tertarik/.test($(wa, 'chat-pesan').textContent)), 'admin membuka percakapan dan membaca pesan');
  tipe(wa, 'chat-input', 'Halo Sari, ada yang bisa dibantu?'); kirimForm(wa, 'chat-form');
  ok(await tunggu(() => call('getConversation', { token: sess.token, otherUsername: SU }).messages.length === 2), 'balasan admin terkirim');
  wb.document.dispatchEvent(new wb.Event('visibilitychange'));
  ok(await tunggu(() => /ada yang bisa dibantu/.test($(wb, 'chat-pesan').textContent)), 'pembeli menerima balasan lewat polling');
  ok(await tunggu(() => $(wb, 'chat-pesan').querySelector('[aria-label="Dibaca"]')), 'pesan pembeli berubah menjadi dibaca (✓✓) setelah admin membukanya');

  // lampiran gambar
  pilihBerkas(wb, 'chat-berkas', 'bukti.png', 'image/png', png);
  ok(await tunggu(() => call('getConversation', { token: adm.token, otherUsername: 'sari' }).messages.some((m) => m.type === 'image')), 'foto bukti diunggah ke Drive lalu terkirim sebagai pesan gambar');
  ok(await tunggu(() => $(wb, 'chat-pesan').querySelector('img[src*="drive.google.com/thumbnail"]')), 'gambar tampil di percakapan');
  pilihBerkas(wb, 'chat-berkas', 'virus.exe', 'application/octet-stream', Buffer.from('MZ'));
  ok(await tunggu(() => /Jenis berkas tidak diizinkan/.test($(wb, 'toast').textContent)), 'berkas berbahaya ditolak dan pengguna diberi tahu');

  // antrean offline
  online = false;
  tipe(wb, 'chat-input', 'pesan saat offline'); kirimForm(wb, 'chat-form');
  ok(await tunggu(() => $(wb, 'chat-pesan').querySelector('[aria-label="Menunggu koneksi"]')), 'tanpa internet: pesan menunggu (ikon awan)');
  ok(JSON.parse(wb.localStorage.getItem('andu_chat_pending_sari') || '[]').length === 1, 'pesan disimpan di antrean lokal');
  ok(!call('getConversation', { token: adm.token, otherUsername: 'sari' }).messages.some((m) => m.content === 'pesan saat offline'), 'belum ada di server');
  online = true; wb.dispatchEvent(new wb.Event('online'));
  ok(await tunggu(() => call('getConversation', { token: adm.token, otherUsername: 'sari' }).messages.some((m) => m.content === 'pesan saat offline')), 'koneksi pulih: pesan terkirim otomatis');
  ok(await tunggu(() => JSON.parse(wb.localStorage.getItem('andu_chat_pending_sari') || '[]').length === 0), 'antrean lokal kosong kembali');

  // XSS di pesan
  tipe(wb, 'chat-input', '<img src=x onerror="window.__x2=1"> lihat https://contoh.id/a?b=1&c=2'); kirimForm(wb, 'chat-form');
  ok(await tunggu(() => /lihat/.test($(wb, 'chat-pesan').textContent)), 'pesan berisi HTML tampil');
  ok(!wb.__x2 && !$(wb, 'chat-pesan').querySelector('img[onerror]'), 'HTML di pesan tidak dieksekusi');
  const a = $(wb, 'chat-pesan').querySelector('a[href^="https://contoh.id"]');
  ok(a && /ugc/.test(a.rel) && /nofollow/.test(a.rel), 'tautan di pesan dibuat aman (rel=ugc nofollow noopener)', a && a.outerHTML);
  wa.close(); wb.close();

  // paginasi
  sec('5. Paginasi chat (30 per halaman)');
  H.advance(120000);
  for (let i = 0; i < 20; i++) { call('sendMessage', { token: adm.token, toUsername: 'sari', content: 'admin lama ' + i }); call('sendMessage', { token: sess.token, toUsername: SU, content: 'sari lama ' + i }); }
  const totalServer = call('getConversation', { token: sess.token, otherUsername: SU }).total;
  wb = bukaHalaman('pesan.html', { scripts: ['chat'], search: '?to=andu', storage: SESI });
  ok(await tunggu(() => $(wb, 'chat-muat-lama')), 'tombol "Muat pesan sebelumnya" tampil karena ada lebih dari 30 pesan');
  const awal = wb.document.querySelectorAll('#chat-pesan .rounded-2xl').length;
  ok(awal === 30, '30 pesan terbaru dimuat lebih dulu', awal);
  klik($(wb, 'chat-muat-lama'));
  ok(await tunggu(() => wb.document.querySelectorAll('#chat-pesan .rounded-2xl').length === totalServer), `halaman berikutnya memuat sisa pesan (total ${totalServer})`);
  ok(!$(wb, 'chat-muat-lama'), 'tombol hilang setelah semua pesan termuat');
  wb.close();

  // ============================================================
  sec('6. Panel superadmin (logika Todipener)');
  w = bukaHalaman('superadmin/index.html', { scripts: ['admin-core', 'admin-login'], layout: 'admin' });
  tipe(w, 'a-user', 'sari'); tipe(w, 'a-pass', 'rahasia123'); kirimForm(w, 'form-admin');
  ok(await tunggu(() => /bukan superadmin|salah/i.test($(w, 'a-pesan').textContent)), 'akun pembeli ditolak masuk panel superadmin', $(w, 'a-pesan').textContent);
  ok(!w.sessionStorage.getItem('andu_admin_session'), 'tidak ada sesi admin untuk pembeli');
  tipe(w, 'a-user', SU); tipe(w, 'a-pass', SUPW); kirimForm(w, 'form-admin');
  ok(await tunggu(() => w.sessionStorage.getItem('andu_admin_session')), 'superadmin berhasil masuk; sesi di sessionStorage');
  const ADM_S = { andu_admin_session: { token: JSON.parse(w.sessionStorage.getItem('andu_admin_session')).token, user: adm.user } };
  w.close();

  w = bukaHalaman('superadmin/dashboard.html', { scripts: ['admin-core', 'admin-dashboard'], layout: 'admin', session: ADM_S });
  ok(await tunggu(() => /^\d+$/.test($(w, 'st-produk').textContent)), 'statistik dashboard terisi', $(w, 'st-produk').textContent);
  ok(await tunggu(() => w.document.querySelectorAll('#tb-produk tr').length === 3), 'tabel produk memuat 3 baris');
  ok(!w.__xss && !w.document.querySelector('#tb-produk img[onerror]'), 'nama produk berisi HTML tidak dieksekusi di tabel admin');
  ok(/Produk Habis/.test($(w, 'tb-produk').textContent), 'produk stok 0 tetap terlihat oleh admin');
  tipe(w, 'f-q', 'gratis');
  ok(await tunggu(() => w.document.querySelectorAll('#tb-produk tr').length === 1 && /Boilerplate/.test($(w, 'tb-produk').textContent)), 'pencarian produk (debounce) memfilter tabel');
  tipe(w, 'f-q', '');
  ok(await tunggu(() => w.document.querySelectorAll('#tb-produk tr').length === 3), 'hapus kata kunci mengembalikan semua produk');
  klik(w.document.querySelector('[data-hapus="' + PC + '"]'));
  ok(await tunggu(() => !$(w, 'modal').classList.contains('hidden')), 'modal konfirmasi hapus tampil');
  klik($(w, 'modal-ok'));
  ok(await tunggu(() => call('getProduct', { token: adm.token, id: PC }).success === false), 'produk terhapus di backend');
  klik(w.document.querySelector('[data-hapus="' + PB + '"]'));
  await tunggu(() => !$(w, 'modal').classList.contains('hidden')); klik($(w, 'modal-ok'));
  ok(await tunggu(() => /pernah terjual/.test($(w, 'toast').textContent)), 'produk yang sudah terjual tidak bisa dihapus (pesan dari server)');
  klik(w.document.querySelector('[data-tab="pesanan"]'));
  ok(await tunggu(() => /INV-/.test($(w, 'tb-pesanan').textContent)), 'tab pesanan memuat daftar pesanan');
  ok(!!w.document.querySelector('[data-os="dibatalkan"]'), 'tombol batalkan tersedia untuk pesanan lunas');
  klik(w.document.querySelector('[data-os="dibatalkan"]'));
  await tunggu(() => !$(w, 'modal').classList.contains('hidden')); klik($(w, 'modal-ok'));
  ok(await tunggu(() => call('getMyOrders', { token: sess.token }).orders.some((o) => o.status === 'dibatalkan')), 'pesanan dibatalkan dari panel');
  klik(w.document.querySelector('[data-tab="pengguna"]'));
  ok(await tunggu(() => w.document.querySelector('[data-user="sari"][data-ua="reset"]')), 'tab pengguna memuat daftar; akun sendiri tidak punya tombol ubah');
  klik(w.document.querySelector('[data-user="sari"][data-ua="reset"]'));
  await tunggu(() => !$(w, 'modal').classList.contains('hidden')); $(w, 'modal-input').value = 'sandibaru2026'; klik($(w, 'modal-ok'));
  ok(await tunggu(() => call('login', { username: 'sari', password: 'sandibaru2026' }).success), 'reset kata sandi pengguna dari modal berhasil');
  w.close();

  // form tambah produk dengan gambar
  w = bukaHalaman('superadmin/produk.html', { scripts: ['admin-core', 'admin-produk'], layout: 'admin', session: ADM_S });
  const sel = $(w, 'p-kategori'); sel.innerHTML = '<option>Source Code</option><option>UI/UX Kits</option><option value="__lain__">Lainnya…</option>';
  ok($(w, 'p-penjual').value === SUPPORT && $(w, 'p-stok').value === '1', 'default form: penjual = akun dukungan, stok 1');
  kirimForm(w, 'form-produk');
  ok(/Nama produk wajib/.test($(w, 'form-pesan').textContent), 'validasi: nama wajib');
  tipe(w, 'p-nama', 'Produk Baru UI Kit'); tipe(w, 'p-deskripsi', 'Deskripsi lengkap'); tipe(w, 'p-harga', '-5'); kirimForm(w, 'form-produk');
  ok(/Harga/.test($(w, 'form-pesan').textContent), 'validasi: harga negatif ditolak');
  tipe(w, 'p-harga', '79000'); tipe(w, 'p-coret', '150000'); tipe(w, 'p-stok', '9'); tipe(w, 'p-link', 'http://tidak-aman.test');
  kirimForm(w, 'form-produk'); ok(/https/.test($(w, 'form-pesan').textContent), 'validasi: tautan unduhan harus https');
  tipe(w, 'p-link', 'https://drive.google.com/uikit'); sel.value = '__lain__'; sel.dispatchEvent(new w.Event('change'));
  tipe(w, 'p-kategori-lain', 'Kategori Baru');
  pilihBerkas(w, 'p-gambar', 'cover.png', 'image/png', png);
  ok(await tunggu(() => !$(w, 'preview').classList.contains('hidden')), 'pratinjau gambar tampil setelah memilih berkas');
  const sebelum = driveFiles.length;
  kirimForm(w, 'form-produk');
  ok(await tunggu(() => call('getProducts', { token: adm.token, q: 'ui kit' }).products.length === 1), 'produk baru tersimpan di backend');
  const baru = call('getProducts', { token: adm.token, q: 'ui kit' }).products[0];
  ok(baru.kategori === 'Kategori Baru' && baru.harga === 79000 && baru.hargaCoret === 150000 && baru.stok === 9 && /^[A-Za-z0-9_-]+$/.test(baru.gambarId) && driveFiles.length === sebelum + 1, 'data, kategori baru, dan gambar (terunggah ke Drive) benar');
  w.close();

  w = bukaHalaman('superadmin/produk.html', { scripts: ['admin-core', 'admin-produk'], layout: 'admin', session: ADM_S, search: '?id=' + baru.id });
  $(w, 'p-kategori').innerHTML = '<option>Source Code</option><option value="__lain__">Lainnya…</option>';
  ok(await tunggu(() => $(w, 'p-nama').value === 'Produk Baru UI Kit'), 'mode ubah memuat data produk');
  ok($(w, 'judul-form').textContent === 'Ubah produk' && !$(w, 'btn-hapus').classList.contains('hidden'), 'judul dan tombol hapus mode ubah');
  ok(await tunggu(() => $(w, 'p-kategori').value === '__lain__' && $(w, 'p-kategori-lain').value === 'Kategori Baru'), 'kategori di luar daftar ditampilkan sebagai "Lainnya"');
  tipe(w, 'p-harga', '69000'); w.document.querySelector('input[name="p-status"][value="nonaktif"]').checked = true;
  kirimForm(w, 'form-produk');
  ok(await tunggu(() => call('getProduct', { token: adm.token, id: baru.id }).product.harga === 69000), 'perubahan harga tersimpan');
  ok(call('getProduct', { token: adm.token, id: baru.id }).product.status === 'nonaktif' && !call('getPublicProducts', {}, 'GET').products.some((p) => p.id === baru.id), 'status nonaktif menyembunyikan produk dari katalog publik');
  w.close();

  w = bukaHalaman('superadmin/dashboard.html', { scripts: ['admin-core', 'admin-dashboard'], layout: 'admin' });
  await tidur(150);
  ok(!w.sessionStorage.getItem('andu_admin_session') && !/^\d+$/.test($(w, 'st-produk').textContent), 'tanpa sesi admin, dashboard tidak memuat data');
  w.close();

  windows.forEach((x) => { try { x.close(); } catch (e) {} });
  console.log(`\nHASIL INTEGRASI: ${pass} lulus, ${failed} gagal`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('GALAT UJI:', e); process.exit(2); });
