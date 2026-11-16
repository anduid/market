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
  sec('UI saldo: akun, keranjang, pesanan, dashboard');
  ctx.setupAwal();
  const mm = logs.join('\n').match(/Username: (\S+) \| Sandi: (\S+)/);
  const adm = call('login', { username: mm[1], password: mm[2] });
  const mk = (p) => call('addProduct', { token: adm.token, product: Object.assign({ deskripsi: 'D', kategori: 'Source Code', stok: 9, status: 'aktif', linkDownload: 'https://drive.google.com/x' }, p) }).id;
  const P1 = mk({ nama: 'Produk Satu', harga: 100000 }), P2 = mk({ nama: 'Produk Dua', harga: 50000 });
  call('register', { username: 'sari', nama: 'Sari', password: 'rahasia123' });
  const lg = call('login', { username: 'sari', password: 'rahasia123' });
  const SESI = { andu_session: { token: lg.token, user: lg.user, exp: Date.now() + 3600e3 } };
  const ADMSESI = { andu_admin_session: { token: adm.token, user: adm.user } };

  // pembelian pertama: kode unik -> saldo
  const o1 = call('createOrder', { token: lg.token, items: [{ id: P1 }] }).order;
  call('claimPaid', { token: lg.token, id: o1.id });
  call('updateOrderStatus', { token: adm.token, id: o1.id, status: 'lunas', diterima: o1.totalBayar });

  let w = bukaHalaman('akun.html', { scripts: ['akun'], storage: SESI });
  ok(await tunggu(() => /Rp\s?[\d.]+/.test($(w, 'saldo-total').textContent) && $(w, 'saldo-total').textContent.replace(/\D/g, '') === String(o1.kodeUnik)), 'akun: kartu saldo menampilkan kode unik ' + o1.kodeUnik, $(w, 'saldo-total').textContent);
  ok(/Kelebihan bayar/.test($(w, 'saldo-riwayat').textContent) && $(w, 'saldo-riwayat').textContent.includes(o1.id), 'akun: riwayat saldo memuat pesanan asal');
  ok(!$(w, 'saldo-belanja').classList.contains('hidden'), 'akun: tombol belanja dengan saldo tampil');
  w.close();

  w = bukaHalaman('keranjang.html', { scripts: ['bayar', 'keranjang'], storage: Object.assign({}, SESI, { andu_cart: [P2] }) });
  ok(await tunggu(() => !$(w, 'saldo-wrap').classList.contains('hidden')), 'keranjang: opsi pakai saldo tampil');
  ok($(w, 'saldo-nominal').textContent.replace(/\D/g, '') === String(o1.kodeUnik), 'keranjang: nominal saldo benar');
  const tot = () => Number($(w, 'ringkas-total').textContent.replace(/\D/g, ''));
  ok(await tunggu(() => tot() === 50000 - o1.kodeUnik), 'keranjang: total di layar sudah dipotong saldo', $(w, 'ringkas-total').textContent);
  $(w, 'pakai-saldo').checked = false; $(w, 'pakai-saldo').dispatchEvent(new w.Event('change', { bubbles: true }));
  ok(tot() === 50000, 'keranjang: tanpa centang saldo total kembali penuh');
  $(w, 'pakai-saldo').checked = true; $(w, 'pakai-saldo').dispatchEvent(new w.Event('change', { bubbles: true }));
  klik($(w, 'btn-checkout'));
  ok(await tunggu(() => w.document.getElementById('andu-pay')), 'checkout: sheet QRIS terbuka');
  const sheetTxt = () => w.document.getElementById('andu-pay').textContent;
  ok(/Saldo terpakai/.test(sheetTxt()) && /menjadi saldo Anda/.test(sheetTxt()), 'sheet QRIS: rincian saldo terpakai dan penjelasan kode unik');
  const ord = call('getMyOrders', { token: lg.token }).orders.find((o) => o.status === 'menunggu');
  ok(ord && ord.saldoPakai === o1.kodeUnik && ord.totalBayar === 50000 - o1.kodeUnik + ord.kodeUnik, 'backend: pesanan memakai saldo', ord);
  w.close();

  w = bukaHalaman('pesanan.html', { scripts: ['bayar', 'pesanan'], storage: SESI });
  ok(await tunggu(() => /Dibayar dari saldo/.test($(w, 'pesanan-daftar').textContent)), 'pesanan: baris "Dibayar dari saldo" tampil');
  ok(/Kelebihan bayar/.test($(w, 'pesanan-daftar').textContent), 'pesanan: info kelebihan bayar masuk saldo pada pesanan lunas');
  w.close();

  w = bukaHalaman('superadmin/dashboard.html', { scripts: ['admin-core', 'admin-dashboard'], layout: 'admin', session: ADMSESI });
  ok(await tunggu(() => $(w, 'st-saldo') && $(w, 'st-pendapatan').textContent !== '–'), 'dashboard admin termuat');
  const angka = (id) => Number($(w, id).textContent.replace(/\D/g, ''));
  ok(angka('st-pendapatan') === 100000 + o1.kodeUnik, 'dashboard: pendapatan = harga + kode unik', $(w, 'st-pendapatan').textContent);
  ok(/kode unik/.test($(w, 'st-lunas-sub').textContent), 'dashboard: rincian penjualan + kode unik tampil');
  ok(angka('st-saldo') === 0, 'dashboard: saldo pembeli 0 karena sedang ditahan pesanan terbuka', $(w, 'st-saldo').textContent);
  w.close();
  console.log('\nHASIL UI SALDO: ' + pass + ' lulus, ' + failed + ' gagal');
  await tidur(500); process.exit(failed ? 1 : 0);
})();
