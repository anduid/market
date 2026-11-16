/* Dashboard superadmin. Daftar/hapus produk meniru Todipener (dashboard.html): pencarian
 * ber-debounce, filter status/kategori, paginasi, konfirmasi hapus. Ditambah pesanan & pengguna. */
(function () {
  'use strict';
  var A = window.Andu, Admin = window.Admin, $ = function (id) { return document.getElementById(id); };
  if (!$('tb-produk')) return;
  var LIMIT = 15, state = { offset: 0, total: 0, filtered: 0 };

  // ---------- modal konfirmasi ----------
  function konfirmasi(judul, isi, opsi) {
    opsi = opsi || {};
    return new Promise(function (ok) {
      var m = $('modal'); $('modal-judul').textContent = judul; $('modal-isi').textContent = isi;
      var w = $('modal-input-wrap'); w.classList.toggle('hidden', !opsi.input); $('modal-input').value = '';
      if (opsi.input) $('modal-input-label').textContent = opsi.input;
      $('modal-ok').textContent = opsi.tombol || 'Lanjutkan'; $('modal-ok').className = opsi.aman ? 'btn-brand' : 'btn-danger';
      m.classList.remove('hidden'); m.classList.add('flex'); (opsi.input ? $('modal-input') : $('modal-ok')).focus();
      function tutup(v) { m.classList.add('hidden'); m.classList.remove('flex'); $('modal-ok').onclick = $('modal-batal').onclick = null; document.removeEventListener('keydown', esc); ok(v); }
      function esc(e) { if (e.key === 'Escape') tutup(null); }
      document.addEventListener('keydown', esc);
      $('modal-batal').onclick = function () { tutup(null); };
      $('modal-ok').onclick = function () { tutup(opsi.input ? $('modal-input').value : true); };
    });
  }

  // ---------- statistik ----------
  async function muatStat() {
    var r = await Admin.api('getStats'); if (!r.success) return;
    $('st-produk').textContent = r.produk.total; $('st-produk-sub').textContent = r.produk.aktif + ' aktif · ' + r.produk.habis + ' habis · ' + r.produk.kategori + ' kategori';
    $('st-menunggu').textContent = r.pesanan.menunggu; $('st-pesanan-sub').textContent = r.pesanan.total + ' pesanan total';
    $('st-pendapatan').textContent = A.rupiah(r.pesanan.pendapatan).replace('Gratis', 'Rp 0');
    $('st-lunas-sub').textContent = r.pesanan.lunas + ' lunas · penjualan ' + A.rupiah(r.pesanan.penjualan || 0).replace('Gratis', 'Rp 0') + ' + kode unik ' + A.rupiah(r.pesanan.kodeUnik || 0).replace('Gratis', 'Rp 0') + (r.pesanan.saldoDipakai ? ' − saldo terpakai ' + A.rupiah(r.pesanan.saldoDipakai) : '');
    $('st-saldo').textContent = A.rupiah(r.saldoPembeli || 0).replace('Gratis', 'Rp 0'); $('st-saldo-sub').textContent = 'kredit belum terpakai (kewajiban)';
    $('st-pengguna').textContent = r.pengguna.total; $('st-pengguna-sub').textContent = r.pengguna.pembeli + ' pembeli';
  }

  // ---------- produk ----------
  var qT;
  async function muatProduk() {
    var tb = $('tb-produk');
    var r = await Admin.api('getProducts', { q: $('f-q').value.trim(), status: $('f-status').value, kategori: $('f-kat').value, limit: LIMIT, offset: state.offset });
    if (!r.success) { tb.innerHTML = '<tr><td class="p-6 text-center text-red-600" colspan="6">' + A.esc(r.message || 'Gagal memuat.') + '</td></tr>'; return; }
    state.total = r.total; state.filtered = r.filtered;
    var kat = $('f-kat'), pilih = kat.value;
    if (kat.options.length - 1 !== r.kategoriList.length) {
      kat.innerHTML = '<option value="">Semua kategori</option>' + r.kategoriList.map(function (k) { return '<option>' + A.esc(k) + '</option>'; }).join(''); kat.value = pilih;
    }
    tb.innerHTML = r.products.length ? r.products.map(function (p) {
      return '<tr><td class="p-3"><div class="flex items-center gap-3"><span class="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">' +
        (p.gambarId ? '<img src="' + A.esc(A.driveThumb(p.gambarId, 120)) + '" alt="" class="h-full w-full object-cover" referrerpolicy="no-referrer" loading="lazy">' : '📦') + '</span>' +
        '<div class="min-w-0"><p class="truncate font-bold">' + A.esc(p.nama) + '</p><p class="truncate text-xs text-slate-500">' + A.esc(p.id) + ' · ' + A.esc(String(p.deskripsi).slice(0, 60)) + '</p></div></div></td>' +
        '<td class="p-3"><span class="chip">' + A.esc(p.kategori) + '</span></td>' +
        '<td class="p-3 font-mono font-semibold">' + A.esc(A.rupiah(p.harga)) + '</td>' +
        '<td class="p-3 ' + (p.stok === 0 ? 'font-bold text-red-600' : '') + '">' + p.stok + '</td>' +
        '<td class="p-3"><span class="rounded-full px-2.5 py-1 text-xs font-bold ' + (p.status === 'aktif' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600') + '">' + A.esc(p.status) + '</span></td>' +
        '<td class="p-3 text-right"><a class="btn-ghost !px-2.5 !py-1.5" href="' + A.esc(A.url('/superadmin/produk/') + '?id=' + encodeURIComponent(p.id)) + '" aria-label="Ubah ' + A.esc(p.nama) + '"><span class="ikon" aria-hidden="true">edit</span></a> ' +
        '<button type="button" class="btn-ghost !px-2.5 !py-1.5 text-red-600" data-hapus="' + A.esc(p.id) + '" data-nama="' + A.esc(p.nama) + '" aria-label="Hapus ' + A.esc(p.nama) + '"><span class="ikon" aria-hidden="true">delete</span></button></td></tr>';
    }).join('') : '<tr><td class="p-8 text-center text-slate-400" colspan="6">Tidak ada produk.</td></tr>';
    var dari = r.filtered ? state.offset + 1 : 0, sampai = Math.min(state.offset + LIMIT, r.filtered);
    $('pg-info').textContent = 'Menampilkan ' + dari + '-' + sampai + ' dari ' + r.filtered + ' produk';
    $('pg-prev').disabled = state.offset === 0; $('pg-next').disabled = state.offset + LIMIT >= r.filtered;
  }
  function ulangProduk() { state.offset = 0; muatProduk(); }
  $('f-q').addEventListener('input', function () { clearTimeout(qT); qT = setTimeout(ulangProduk, 350); });
  $('f-kat').addEventListener('change', ulangProduk); $('f-status').addEventListener('change', ulangProduk);
  $('f-segar').addEventListener('click', function () { muatProduk(); muatStat(); });
  $('pg-prev').addEventListener('click', function () { state.offset = Math.max(0, state.offset - LIMIT); muatProduk(); });
  $('pg-next').addEventListener('click', function () { state.offset += LIMIT; muatProduk(); });
  $('tb-produk').addEventListener('click', async function (e) {
    var b = e.target.closest('[data-hapus]'); if (!b) return;
    var ya = await konfirmasi('Hapus produk?', '"' + b.getAttribute('data-nama') + '" akan dihapus permanen.', { tombol: 'Hapus' });
    if (!ya) return;
    var r = await Admin.api('deleteProduct', { id: b.getAttribute('data-hapus') });
    A.toast(r.success ? 'Produk dihapus' : (r.message || 'Gagal menghapus'), 4500);
    if (r.success) { muatProduk(); muatStat(); }
  });

  // ---------- pesanan ----------
  var oT, BADGE = { menunggu: 'bg-amber-100 text-amber-800', verifikasi: 'bg-sky-100 text-sky-800', lunas: 'bg-emerald-100 text-emerald-800', dibatalkan: 'bg-slate-200 text-slate-600' };
  var daftarPesanan = [], LABEL_ST = { menunggu: 'menunggu bayar', verifikasi: 'perlu diverifikasi', lunas: 'lunas', dibatalkan: 'dibatalkan' };
  async function muatPesanan() {
    var r = await Admin.api('getOrders', { q: $('o-q').value.trim(), status: $('o-status').value, limit: 50 });
    var tb = $('tb-pesanan');
    if (!r.success) { tb.innerHTML = '<tr><td class="p-6 text-center text-red-600" colspan="5">' + A.esc(r.message || 'Gagal memuat.') + '</td></tr>'; return; }
    daftarPesanan = r.orders;
    tb.innerHTML = r.orders.length ? r.orders.map(function (o) {
      var aksi = '';
      var bukaSt = o.status === 'menunggu' || o.status === 'verifikasi';
      if (bukaSt || o.status === 'dibatalkan') aksi += '<button type="button" class="btn-brand !px-2.5 !py-1.5" data-os="lunas" data-id="' + A.esc(o.id) + '">' + (o.status === 'dibatalkan' ? 'Setujui (terlambat)' : 'Setujui') + '</button> ';
      if (o.status !== 'dibatalkan') aksi += '<button type="button" class="btn-ghost !px-2.5 !py-1.5 text-red-600" data-os="dibatalkan" data-id="' + A.esc(o.id) + '">' + (bukaSt ? 'Tolak' : 'Batalkan') + '</button>';
      else aksi += '<button type="button" class="btn-ghost !px-2.5 !py-1.5" data-os="menunggu" data-id="' + A.esc(o.id) + '">Aktifkan lagi</button>';
      return '<tr><td class="p-3"><p class="font-bold">' + A.esc(o.id) + '</p><p class="text-xs text-slate-500">' + A.esc(A.tgl(o.createdAt)) + ' · ' + A.esc(o.items.map(function (i) { return i.nama; }).join(', ')).slice(0, 90) + '</p></td>' +
        '<td class="p-3">@' + A.esc(o.username) + ' <a class="text-xs font-bold text-brand-deeper underline" href="' + A.esc(A.url('/pesan/') + '?to=' + encodeURIComponent(o.username) + '&order=' + encodeURIComponent(o.id)) + '">chat</a></td>' +
        '<td class="p-3 font-mono font-semibold">' + A.esc(A.rupiah(bukaSt && o.totalBayar ? o.totalBayar : o.total).replace('Gratis', 'Rp 0')) + (bukaSt && o.kodeUnik ? '<p class="text-[11px] font-normal text-slate-500">pokok ' + A.esc(A.rupiah(o.total)) + ' + kode ' + A.esc(o.kodeUnik) + '</p>' : '') + (o.pengirim ? '<p class="text-[11px] font-normal text-slate-500">pengirim: ' + A.esc(o.pengirim) + '</p>' : '') + '</td>' +
        '<td class="p-3"><span class="rounded-full px-2.5 py-1 text-xs font-bold ' + (BADGE[o.status] || BADGE.dibatalkan) + '">' + A.esc(LABEL_ST[o.status] || o.status) + '</span>' + (o.catatanAdmin ? '<p class="mt-1 text-[11px] text-slate-500">' + A.esc(o.catatanAdmin) + '</p>' : '') + '</td>' +
        '<td class="p-3 text-right">' + aksi + '</td></tr>';
    }).join('') : '<tr><td class="p-8 text-center text-slate-400" colspan="5">Belum ada pesanan.</td></tr>';
  }
  $('o-q').addEventListener('input', function () { clearTimeout(oT); oT = setTimeout(muatPesanan, 350); });
  $('o-status').addEventListener('change', muatPesanan);
  $('tb-pesanan').addEventListener('click', async function (e) {
    var b = e.target.closest('[data-os]'); if (!b) return;
    var st = b.getAttribute('data-os'), id = b.getAttribute('data-id');
    var o = daftarPesanan.filter(function (x) { return x.id === id; })[0] || {};
    var body = { id: id, status: st };
    if (st === 'lunas') {
      var nominal = A.rupiah(o.totalBayar || o.total).replace('Gratis', 'Rp 0');
      var ya = await konfirmasi('Setujui pembayaran?', id + ': pastikan dana ' + nominal + (o.kodeUnik ? ' (kode unik ' + o.kodeUnik + ')' : '') + ' sudah masuk di mutasi. Stok berkurang dan pembeli mendapat tautan unduhan.', { tombol: 'Ya, setujui', aman: true });
      if (!ya) return;
      body.diterima = o.totalBayar || o.total;
    } else if (st === 'dibatalkan') {
      var alasan = prompt('Alasan (dikirim ke pembeli lewat chat):', 'Pembayaran tidak ditemukan di mutasi'); if (alasan === null) return;
      body.alasan = alasan;
    } else {
      var ok = await konfirmasi('Ubah status pesanan?', id + ' → ' + st, { tombol: 'Ya, ubah', aman: true }); if (!ok) return;
    }
    var r = await Admin.api('updateOrderStatus', body);
    A.toast(r.success ? 'Status diperbarui' : (r.message || 'Gagal'), 4500);
    if (r.success) { muatPesanan(); muatStat(); muatProduk(); }
  });

  // ---------- pengguna ----------
  var uT;
  async function muatPengguna() {
    var r = await Admin.api('getUsers', { q: $('u-q').value.trim(), limit: 50 });
    var tb = $('tb-pengguna'), saya = Admin.session().user.username;
    if (!r.success) { tb.innerHTML = '<tr><td class="p-6 text-center text-red-600" colspan="6">' + A.esc(r.message || 'Gagal memuat.') + '</td></tr>'; return; }
    tb.innerHTML = r.users.map(function (u) {
      var diri = u.username === saya, d = ' data-user="' + A.esc(u.username) + '"';
      return '<tr><td class="p-3"><p class="font-bold">' + A.esc(u.nama) + '</p><p class="text-xs text-slate-500">@' + A.esc(u.username) + (u.email ? ' · ' + A.esc(u.email) : '') + '</p></td>' +
        '<td class="p-3"><span class="chip">' + A.esc(u.role) + '</span></td>' +
        '<td class="p-3 font-mono text-xs font-semibold">' + (u.saldo ? A.esc(A.rupiah(u.saldo)) : '<span class="text-slate-400">–</span>') + '</td>' +
        '<td class="p-3"><span class="rounded-full px-2.5 py-1 text-xs font-bold ' + (u.status === 'aktif' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600') + '">' + A.esc(u.status) + '</span></td>' +
        '<td class="p-3 text-xs text-slate-500">' + A.esc(u.lastLoginAt ? A.tgl(u.lastLoginAt) : '–') + '</td>' +
        '<td class="p-3 text-right">' + (diri ? '<span class="text-xs text-slate-400">Akun Anda</span>' :
          '<button type="button" class="btn-ghost !px-2.5 !py-1.5"' + d + ' data-ua="status" data-nilai="' + (u.status === 'aktif' ? 'nonaktif' : 'aktif') + '">' + (u.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan') + '</button> ' +
          '<button type="button" class="btn-ghost !px-2.5 !py-1.5"' + d + ' data-ua="role" data-nilai="' + (u.role === 'superadmin' ? 'pembeli' : 'superadmin') + '">' + (u.role === 'superadmin' ? 'Jadikan pembeli' : 'Jadikan superadmin') + '</button> ' +
          '<button type="button" class="btn-ghost !px-2.5 !py-1.5"' + d + ' data-ua="reset">Reset sandi</button>') + '</td></tr>';
    }).join('') || '<tr><td class="p-8 text-center text-slate-400" colspan="6">Tidak ada pengguna.</td></tr>';
  }
  $('u-q').addEventListener('input', function () { clearTimeout(uT); uT = setTimeout(muatPengguna, 350); });
  $('tb-pengguna').addEventListener('click', async function (e) {
    var b = e.target.closest('[data-ua]'); if (!b) return;
    var user = b.getAttribute('data-user'), aksi = b.getAttribute('data-ua'), nilai = b.getAttribute('data-nilai'), r;
    if (aksi === 'reset') {
      var baru = await konfirmasi('Reset kata sandi', 'Atur kata sandi baru untuk @' + user + ' (minimal 8 karakter). Sesinya akan berakhir.', { input: 'Kata sandi baru', tombol: 'Simpan', aman: true });
      if (!baru) return;
      r = await Admin.api('resetUserPassword', { username: user, newPassword: baru });
    } else {
      var ya = await konfirmasi('Ubah pengguna?', '@' + user + ' → ' + aksi + ' ' + nilai, { tombol: 'Ya, ubah', aman: true });
      if (!ya) return;
      var p = { username: user }; p[aksi] = nilai; r = await Admin.api('updateUser', p);
    }
    A.toast(r.success ? 'Berhasil' : (r.message || 'Gagal'), 4500);
    if (r.success) muatPengguna();
  });

  // ---------- tab ----------
  var dimuat = { pesanan: false, pengguna: false };
  function tab(nama) {
    ['produk', 'pesanan', 'pengguna'].forEach(function (t) { $('tab-' + t).classList.toggle('hidden', t !== nama); });
    document.querySelectorAll('#tabs [data-tab]').forEach(function (b) {
      var aktif = b.getAttribute('data-tab') === nama; b.className = 'rounded-lg px-4 py-2 ' + (aktif ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'); b.setAttribute('aria-selected', String(aktif));
    });
    if (nama === 'pesanan' && !dimuat.pesanan) { dimuat.pesanan = true; muatPesanan(); }
    if (nama === 'pengguna' && !dimuat.pengguna) { dimuat.pengguna = true; muatPengguna(); }
    var u = new URL(location.href); u.searchParams.set('tab', nama); history.replaceState(null, '', u.pathname + u.search);
  }
  $('tabs').addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (b) tab(b.getAttribute('data-tab')); });
  var awal = new URLSearchParams(location.search).get('tab');
  tab(['pesanan', 'pengguna'].indexOf(awal) !== -1 ? awal : 'produk');
  muatStat(); muatProduk();
})();
