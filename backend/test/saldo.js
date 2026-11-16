'use strict';
/** Uji saldo kredit (kelebihan bayar kode unik). Jalankan:  node backend/test/saldo.js */
const { ctx, call, sheets, logs, advance } = require('./harness');
let pass = 0, failed = 0;
function ok(c, n, d) { if (c) { pass++; console.log('  ✓', n); } else { failed++; console.log('  ✗', n, d !== undefined ? '→ ' + JSON.stringify(d) : ''); } }

ctx.setupAwal();
const m = logs.join('\n').match(/Username: (\S+) \| Sandi: (\S+)/);
let ADMIN = call('login', { username: m[1], password: m[2] }).token;
const prod = (nama, harga) => call('addProduct', { token: ADMIN, product: { nama, deskripsi: 'x', harga, stok: 50, kategori: 'k', linkDownload: 'https://drive.google.com/x', status: 'aktif' } }).id;
const A = prod('Produk A', 100000), B = prod('Produk B', 100000), C = prod('Produk C', 40000);
call('register', { username: 'sari', nama: 'Sari', password: 'rahasia123' });
let U = call('login', { username: 'sari', password: 'rahasia123' }).token;
const saldo = () => call('getSaldo', { token: U });
const stat = () => call('getStats', { token: ADMIN });

console.log('\nA. Kelebihan bayar menjadi saldo');
ok(saldo().saldo === 0, 'akun baru: saldo 0');
let r = call('createOrder', { token: U, items: [{ id: A }] });
const O1 = r.order, unik1 = O1.kodeUnik;
ok(r.success && O1.totalBayar === 100000 + unik1 && O1.saldoPakai === 0, 'pesanan 1: total = harga + kode unik', O1);
ok(saldo().saldo === 0, 'saldo belum bertambah sebelum admin menyetujui');
ok(call('claimPaid', { token: U, id: O1.id }).success, 'pembeli menekan "sudah bayar"');
ok(saldo().saldo === 0, 'saldo belum bertambah saat verifikasi');
ok(call('updateOrderStatus', { token: ADMIN, id: O1.id, status: 'lunas', diterima: O1.totalBayar }).success, 'admin menyetujui');
r = saldo();
ok(r.saldo === unik1, 'kode unik masuk saldo pembeli (' + unik1 + ')', r);
ok(r.riwayat.length === 1 && r.riwayat[0].tipe === 'kredit' && r.riwayat[0].jumlah === unik1 && r.riwayat[0].orderId === O1.id, 'riwayat mutasi tercatat');
ok(call('updateOrderStatus', { token: ADMIN, id: O1.id, status: 'lunas', diterima: O1.totalBayar }).success && saldo().saldo === unik1, 'setujui ulang tidak menggandakan kredit');
let s = stat();
ok(s.pesanan.pendapatan === 100000 + unik1 && s.pesanan.penjualan === 100000 && s.pesanan.kodeUnik === unik1, 'dashboard: pendapatan mencakup kode unik', s.pesanan);
ok(s.saldoPembeli === unik1, 'dashboard: total saldo pembeli');

console.log('\nB. Saldo memotong pembelian berikutnya');
r = call('createOrder', { token: U, items: [{ id: B }] });
const O2 = r.order;
ok(O2.saldoPakai === unik1 && O2.totalBayar === 100000 - unik1 + O2.kodeUnik, 'pesanan 2 dipotong saldo otomatis', O2);
ok(saldo().saldo === 0, 'saldo ditahan selama pesanan terbuka');
ok(O2.qris && O2.qris.length > 40, 'QRIS dibuat untuk nominal setelah potongan');
ok(call('cancelOrder', { token: U, id: O2.id }).success && saldo().saldo === unik1, 'batal: saldo kembali utuh');
r = call('createOrder', { token: U, items: [{ id: B }], pakaiSaldo: false });
ok(r.order.saldoPakai === 0 && r.order.totalBayar === 100000 + r.order.kodeUnik && saldo().saldo === unik1, 'pembeli boleh menolak pakai saldo');
const O3 = r.order;
r = call('createOrder', { token: U, items: [{ id: B }], replace: true });
const O4 = r.order;
ok(r.success && O4.saldoPakai === unik1, 'pesanan pengganti memakai saldo yang dikembalikan');
call('claimPaid', { token: U, id: O4.id });
const kirim = O4.totalBayar + 7;   // admin menerima lebih 7 rupiah
call('updateOrderStatus', { token: ADMIN, id: O4.id, status: 'lunas', diterima: kirim });
const unik4 = O4.kodeUnik + 7;
ok(saldo().saldo === unik4, 'setelah lunas: saldo = kode unik baru (saldo lama sudah terpakai)', saldo());
s = stat();
ok(s.pesanan.pendapatan === (100000 + unik1) + kirim && s.pesanan.saldoDipakai === unik1, 'pendapatan = jumlah uang yang benar-benar masuk', s.pesanan);

console.log('\nC. Kedaluwarsa, batal, dan pembatalan setelah lunas');
r = call('createOrder', { token: U, items: [{ id: C }] });
const O5 = r.order;
ok(O5.saldoPakai === Math.min(unik4, 40000) && saldo().saldo === 0, 'saldo ditahan untuk pesanan 5');
advance(25 * 3600 * 1000);   // token 12 jam ikut kedaluwarsa: masuk lagi
ADMIN = call('login', { username: m[1], password: m[2] }).token; U = call('login', { username: 'sari', password: 'rahasia123' }).token;
ok(saldo().saldo === unik4, 'pesanan kedaluwarsa mengembalikan saldo');
call('createOrder', { token: U, items: [{ id: C }] });
const o6 = call('getMyOrders', { token: U }).orders.find((o) => o.status === 'menunggu');
call('claimPaid', { token: U, id: o6.id });
call('updateOrderStatus', { token: ADMIN, id: o6.id, status: 'dibatalkan', alasan: 'tidak ada di mutasi' });
ok(saldo().saldo === unik4, 'admin menolak: saldo kembali');
const k = call('createOrder', { token: U, items: [{ id: C }] }).order; call('claimPaid', { token: U, id: k.id });
call('updateOrderStatus', { token: ADMIN, id: k.id, status: 'lunas', diterima: k.totalBayar });
const sesudah = saldo().saldo;
call('updateOrderStatus', { token: ADMIN, id: k.id, status: 'dibatalkan', alasan: 'refund' });
ok(saldo().saldo === unik4, 'batal setelah lunas: kredit dibalik dan saldo yang dipakai kembali (' + sesudah + ' -> ' + saldo().saldo + ')');

console.log('\nD. Lunas penuh dari saldo');
call('register', { username: 'dewi', nama: 'Dewi', password: 'rahasia123' });
const D = call('login', { username: 'dewi', password: 'rahasia123' }).token;
const KECIL = prod('Kecil', 100);
const od = call('createOrder', { token: D, items: [{ id: KECIL }] }).order;
call('claimPaid', { token: D, id: od.id });
call('updateOrderStatus', { token: ADMIN, id: od.id, status: 'lunas', diterima: 100 + 400 });
const sd = call('getSaldo', { token: D }).saldo;
ok(sd === 400 || sd === od.kodeUnik + 400 - 0, 'kelebihan besar dari admin masuk saldo', sd);
const KP = prod('Sama dengan saldo', 50);
r = call('createOrder', { token: D, items: [{ id: KP }] });
ok(r.order.status === 'lunas' && r.order.saldoPakai === 50 && r.order.downloads.length === 1 && !r.order.qris, 'harga <= saldo: langsung lunas tanpa QRIS, tautan terbuka', r.order);
ok(call('getSaldo', { token: D }).saldo === sd - 50, 'saldo berkurang sesuai harga');

console.log('\nE. Keamanan dan admin');
ok(call('getSaldo', { token: '' }).success === false, 'getSaldo butuh login');
ok(call('getSaldo', { token: U, username: 'dewi' }).saldo === saldo().saldo, 'saldo diambil dari token, bukan parameter');
ok(call('getUsers', { token: ADMIN }).users.find((u) => u.username === 'sari').saldo === saldo().saldo, 'admin melihat saldo tiap pengguna');
ok(call('getUsers', { token: U }).success === false, 'pembeli tidak bisa melihat saldo orang lain');
const total = sheets.Saldo.data.slice(1).reduce((a, r) => a + Number(r[2]), 0);
ok(total === saldo().saldo + call('getSaldo', { token: D }).saldo, 'buku besar seimbang: jumlah seluruh baris = jumlah saldo pembeli');

console.log('\nF. Backfill pesanan lama');
const ctxRows = sheets.Orders; // pesanan lama: lunas, diterima > total, kredit kosong
call('register', { username: 'lama', nama: 'Lama', password: 'rahasia123' });
const L = call('login', { username: 'lama', password: 'rahasia123' }).token;
const ol = call('createOrder', { token: L, items: [{ id: A }] }).order;
call('claimPaid', { token: L, id: ol.id });
call('updateOrderStatus', { token: ADMIN, id: ol.id, status: 'lunas', diterima: ol.totalBayar });
const hdr = sheets.Orders.data[0], ki = hdr.indexOf('kredit');
const row = sheets.Orders.data.findIndex((r) => r[0] === ol.id);
sheets.Orders.data[row][ki] = ''; const sh = sheets.Saldo.data;           // simulasi data sebelum fitur ada
for (let i = sh.length - 1; i > 0; i--) if (sh[i][4] === ol.id) sh.splice(i, 1);
ok(call('getSaldo', { token: L }).saldo === 0, 'pesanan lama: belum ada saldo');
ctx.backfillSaldo(); ctx.backfillSaldo();
ok(call('getSaldo', { token: L }).saldo === ol.kodeUnik, 'backfillSaldo mengkreditkan kode unik pesanan lama (sekali saja)');

console.log('\nHASIL SALDO: ' + pass + ' lulus, ' + failed + ' gagal');
process.exit(failed ? 1 : 0);
