/* Halaman produk: segarkan harga dan stok langsung dari backend (build statis bisa tertinggal beberapa jam). */
(function () {
  var box = document.getElementById('detail-produk');
  if (!box) return;
  var A = window.Andu, id = box.getAttribute('data-id');
  A.pub('getPublicProduct', { id: id }).then(function (r) {
    if (!r || !r.success) {
      if (r && /tidak ditemukan/i.test(r.message || '')) {
        var st = document.getElementById('stok-produk');
        if (st) { st.textContent = 'Produk ini sudah tidak tersedia'; st.className = 'text-sm font-semibold text-red-600'; }
        box.querySelectorAll('[data-beli],[data-tambah]').forEach(function (b) { b.disabled = true; });
      }
      return;
    }
    var p = r.product;
    var h = document.getElementById('harga-produk'); if (h) h.textContent = A.rupiah(p.harga);
    var c = document.getElementById('harga-coret'); if (c) c.textContent = A.rupiah(p.hargaCoret);
    var s = document.getElementById('stok-produk');
    if (s) { s.textContent = p.stok < 1 ? 'Stok habis' : 'Tersedia ' + p.stok + ' lisensi'; s.className = 'text-sm font-semibold ' + (p.stok < 1 ? 'text-red-600' : 'text-brand-deeper'); }
    box.querySelectorAll('[data-beli],[data-tambah]').forEach(function (b) { b.disabled = p.stok < 1; });
  }).catch(function () { /* tetap pakai data statis */ });
})();
