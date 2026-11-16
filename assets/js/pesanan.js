(function () {
  var A = window.Andu, box = document.getElementById('pesanan-daftar'); if (!box || !A.requireLogin()) return;
  var BADGE = { menunggu: 'bg-amber-100 text-amber-800', verifikasi: 'bg-sky-100 text-sky-800', lunas: 'bg-emerald-100 text-emerald-800', dibatalkan: 'bg-slate-200 text-slate-600' };
  var LABEL = { menunggu: 'Menunggu pembayaran', verifikasi: 'Menunggu verifikasi', lunas: 'Lunas', dibatalkan: 'Dibatalkan' };
  var timer, cache = [];

  function kartu(o) {
    var items = o.items.map(function (i) { return '<li class="flex justify-between gap-2 text-sm"><span>' + A.esc(i.nama) + '</span><span class="font-semibold">' + A.esc(A.rupiah(i.harga)) + '</span></li>'; }).join('');
    var aksi = '';
    if (o.status === 'lunas') {
      aksi = '<ul class="mt-3 grid gap-2">' + (o.downloads || []).map(function (d) {
        var ok = /^https:\/\//i.test(d.link || '');
        return '<li class="flex items-center justify-between gap-2 rounded-xl bg-slate-50 p-2.5 text-sm"><span class="font-semibold">' + A.esc(d.nama) + '</span>' +
          (ok ? '<a class="btn-brand !py-1.5" target="_blank" rel="noopener noreferrer" href="' + A.esc(d.link) + '">Unduh</a>' : '<span class="text-xs text-slate-500">Tautan belum diatur</span>') + '</li>';
      }).join('') + '</ul>';
    } else if (o.status === 'menunggu' || o.status === 'verifikasi') {
      var wa = '/pesan/?to=' + encodeURIComponent(A.cfg.support) + '&order=' + encodeURIComponent(o.id) + '&pesan=' + encodeURIComponent('Halo, saya ada pertanyaan soal pesanan ' + o.id + '.');
      aksi = '<div class="mt-3 flex flex-wrap gap-2"><button type="button" class="btn-brand" data-bayar="' + A.esc(o.id) + '"><span class="ikon" aria-hidden="true">qr_code_2</span> ' + (o.status === 'menunggu' ? 'Bayar dengan QRIS' : 'Lihat status') + '</button>' +
        '<a class="btn-ghost" href="' + A.esc(A.url(wa)) + '"><span class="ikon" aria-hidden="true">chat</span> Tanya lewat chat</a></div>';
    } else if (o.status === 'dibatalkan' && o.catatanAdmin) {
      aksi = '<p class="mt-2 text-xs text-slate-500">' + A.esc(o.catatanAdmin) + '</p>';
    }
    return '<article class="kartu p-4"><div class="flex flex-wrap items-center justify-between gap-2"><div><p class="font-extrabold">' + A.esc(o.id) + '</p><p class="text-xs text-slate-500">' + A.esc(A.tgl(o.createdAt)) + '</p></div>' +
      '<span class="rounded-full px-2.5 py-1 text-xs font-bold ' + (BADGE[o.status] || BADGE.dibatalkan) + '">' + A.esc(LABEL[o.status] || o.status) + '</span></div>' +
      '<ul class="mt-3 grid gap-1 border-t border-slate-100 pt-3">' + items + '</ul>' +
      '<p class="mt-2 flex justify-between border-t border-slate-100 pt-2 text-sm"><span class="text-slate-500">' + ((o.status === 'menunggu' || o.status === 'verifikasi') && o.kodeUnik ? 'Total transfer (kode unik ' + o.kodeUnik + ')' : 'Total') + '</span><span class="font-extrabold">' + A.esc(A.rupiah((o.status === 'menunggu' || o.status === 'verifikasi') && o.totalBayar ? o.totalBayar : o.total).replace('Gratis', 'Rp 0')) + '</span></p>' + aksi + '</article>';
  }

  async function muat() {
    var r = await A.api('getMyOrders');
    if (!r.success) { box.innerHTML = '<p class="kartu p-6 text-center text-red-600">' + A.esc(r.message || 'Gagal memuat.') + '</p>'; return; }
    cache = r.orders;
    box.innerHTML = r.orders.length ? r.orders.map(kartu).join('') :
      '<div class="kartu p-8 text-center"><p class="text-4xl" aria-hidden="true">🧾</p><p class="mt-2 font-bold">Belum ada pesanan</p><a class="btn-brand mt-3" href="' + A.esc(A.url('/produk/')) + '">Mulai belanja</a></div>';
    clearInterval(timer);
    if (r.orders.some(function (o) { return o.status === 'menunggu' || o.status === 'verifikasi'; })) timer = setInterval(function () { if (!document.hidden) muat(); }, 20000);
  }
  box.addEventListener('click', function (e) {
    var b = e.target.closest('[data-bayar]'); if (!b) return;
    var o = cache.filter(function (x) { return x.id === b.getAttribute('data-bayar'); })[0]; if (!o) return;
    A.pay.open(o, { onPaid: function () { muat(); }, onCancel: function () { muat(); } });
  });
  document.getElementById('muat-ulang').addEventListener('click', muat);
  muat();
})();
