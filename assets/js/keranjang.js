(function () {
  var A = window.Andu;
  var daftar = document.getElementById('keranjang-daftar'); if (!daftar) return;
  var isi = document.getElementById('keranjang-isi'), kosong = document.getElementById('keranjang-kosong');
  var hasil = document.getElementById('hasil-pesanan'), btn = document.getElementById('btn-checkout');
  var peta = {}, saldo = 0, totalKeranjang = 0;

  function render() {
    var ids = A.cart.ids(), total = 0, n = 0;
    daftar.innerHTML = '';
    ids.forEach(function (id) {
      var p = peta[id];
      if (!p) { A.cart.remove(id); return; }
      n++; if (p.stok > 0) total += p.harga;
      var li = document.createElement('li');
      li.className = 'kartu flex items-center gap-3 p-3';
      li.innerHTML =
        '<a href="' + A.esc(A.url('/produk/' + p.slug + '/')) + '" class="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-100">' +
          (p.gambar_id ? '<img src="' + A.esc(A.driveThumb(p.gambar_id, 200)) + '" alt="" class="h-full w-full object-cover" referrerpolicy="no-referrer" loading="lazy">' : '<span class="flex h-full items-center justify-center text-2xl">📦</span>') + '</a>' +
        '<div class="min-w-0 flex-1"><p class="line-clamp-2 text-sm font-bold">' + A.esc(p.nama) + '</p>' +
          '<p class="text-xs text-slate-500">' + A.esc(p.kategori) + '</p>' +
          '<p class="mt-0.5 font-extrabold">' + A.esc(A.rupiah(p.harga)) + '</p>' +
          (p.stok < 1 ? '<p class="text-xs font-bold text-red-600">Stok habis, hapus dari keranjang</p>' : '') + '</div>' +
        '<button type="button" class="btn-ghost !px-2.5" data-hapus="' + A.esc(id) + '" aria-label="Hapus ' + A.esc(p.nama) + '"><span class="ikon" aria-hidden="true">delete</span></button>';
      daftar.appendChild(li);
    });
    document.getElementById('ringkas-jumlah').textContent = n;
    totalKeranjang = total;
    var cek = document.getElementById('pakai-saldo'), pakai = (cek && cek.checked) ? Math.min(saldo, total) : 0;
    document.getElementById('ringkas-total').textContent = A.rupiah(total - pakai).replace('Gratis', 'Rp 0');
    var sb = document.getElementById('ringkas-saldo-baris'); sb.classList.toggle('hidden', !pakai); sb.classList.toggle('flex', !!pakai);
    document.getElementById('ringkas-saldo').textContent = pakai ? '-' + A.rupiah(pakai) : '';
    var ada = n > 0;
    isi.classList.toggle('hidden', !ada); kosong.classList.toggle('hidden', ada || !hasil.classList.contains('hidden'));
    btn.disabled = !ada;
  }

  function muatSaldo() {
    if (!A.user()) return;
    A.api('getSaldo', {}, { noRedirect: true }).then(function (r) {
      if (!r || !r.success) return;
      saldo = r.saldo || 0;
      var w = document.getElementById('saldo-wrap'); w.classList.toggle('hidden', saldo <= 0); w.classList.toggle('flex', saldo > 0);
      document.getElementById('saldo-nominal').textContent = A.rupiah(saldo);
      render();
    }).catch(function () {});
  }
  document.getElementById('pakai-saldo').addEventListener('change', render);

  daftar.addEventListener('click', function (e) {
    var b = e.target.closest('[data-hapus]'); if (!b) return;
    A.cart.remove(b.getAttribute('data-hapus')); render();
  });

  var terakhir = null;
  function bukaBayar(o) { A.pay.open(o, { onPaid: function () { A.go ? A.go('/pesanan/') : (location.href = A.url('/pesanan/')); }, onCancel: function () { location.reload(); } }); }

  function tampilHasil(res) {
    var o = res.order, lunas = o.status === 'lunas';
    terakhir = o;
    var wa = '/pesan/?to=' + encodeURIComponent(A.cfg.support) + '&order=' + encodeURIComponent(o.id) + '&pesan=' +
      encodeURIComponent('Halo, saya ada pertanyaan soal pesanan ' + o.id + '.');
    var html = '<h2 class="text-lg font-extrabold">' + (lunas ? 'Pesanan selesai 🎉' : 'Pesanan dibuat ✅') + '</h2>' + (lunas && o.saldoPakai ? '<p class="mt-1 text-xs text-emerald-700">Dibayar dari saldo Anda ' + A.esc(A.rupiah(o.saldoPakai)) + '.</p>' : '') +
      '<p class="mt-1 text-sm text-slate-600">Nomor pesanan <strong>' + A.esc(o.id) + '</strong> · Total <strong>' + A.esc(A.rupiah(lunas ? o.total : o.totalBayar).replace('Gratis', 'Rp 0')) + '</strong></p>';
    if (lunas) {
      html += '<ul class="mt-3 grid gap-2">' + (o.downloads || []).map(function (d) {
        var ok = /^https:\/\//i.test(d.link || '');
        return '<li class="flex items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-sm"><span class="font-semibold">' + A.esc(d.nama) + '</span>' +
          (ok ? '<a class="btn-brand !py-1.5" target="_blank" rel="noopener noreferrer" href="' + A.esc(d.link) + '">Unduh</a>' : '<span class="text-xs text-slate-500">Tautan belum diatur. Hubungi admin.</span>') + '</li>';
      }).join('') + '</ul>';
    } else {
      html += '<div class="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><p class="font-bold">Bayar dengan QRIS</p>' +
        '<p class="mt-1">Transfer <strong>persis</strong> ' + A.esc(A.rupiah(o.totalBayar)) + ' (' + (o.saldoPakai ? 'setelah saldo ' + A.esc(A.rupiah(o.saldoPakai)) + ' dipakai, ' : '') + 'sudah termasuk kode unik ' + A.esc(o.kodeUnik) + '), lalu tekan <strong>Saya sudah bayar</strong>. Tautan unduhan muncul setelah admin memverifikasi.</p></div>' +
        '<button type="button" id="btn-bayar-qris" class="btn-brand mt-4"><span class="ikon" aria-hidden="true">qr_code_2</span> Bayar dengan QRIS</button> ' +
        '<a class="btn-ghost mt-4" href="' + A.esc(A.url(wa)) + '"><span class="ikon" aria-hidden="true">chat</span> Tanya lewat chat</a>';
    }
    html += ' <a class="btn-ghost mt-4" href="' + A.esc(A.url('/pesanan/')) + '">Lihat pesanan saya</a>';
    hasil.innerHTML = html; hasil.classList.remove('hidden'); hasil.scrollIntoView({ behavior: 'smooth', block: 'start' });
    var b = document.getElementById('btn-bayar-qris'); if (b) b.addEventListener('click', function () { bukaBayar(terakhir); });
  }

  btn.addEventListener('click', async function () {
    if (!A.requireLogin()) return;
    var ids = A.cart.ids(); if (!ids.length) return;
    btn.disabled = true; var asal = btn.textContent; btn.textContent = 'Memproses…';
    try {
      var res = await A.api('createOrder', { items: ids.map(function (id) { return { id: id }; }), catatan: document.getElementById('catatan').value, replace: true, pakaiSaldo: document.getElementById('pakai-saldo').checked });
      if (res.success) {
        A.cart.clear(); saldo = 0; render(); tampilHasil(res); muatSaldo();
        if (res.order.status === 'menunggu' && res.order.qris) bukaBayar(res.order);
      } else A.toast(res.message || 'Gagal membuat pesanan.', 4500);
    } catch (e) { A.toast('Tidak dapat terhubung ke server. Coba lagi.', 4500); }
    btn.disabled = false; btn.textContent = asal;
  });

  A.produk().then(function (list) { list.forEach(function (p) { peta[p.id] = p; }); render(); muatSaldo(); });
})();
