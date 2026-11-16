/* Form produk. Validasi, unggah gambar (base64 -> Drive, maks 5 MB), simpan/ubah/hapus
 * meniru Todipener (form-produk.html): processFile, uploadImage, validateForm, simpanProduk. */
(function () {
  'use strict';
  var A = window.Andu, Admin = window.Admin, $ = function (id) { return document.getElementById(id); };
  var form = $('form-produk'); if (!form) return;
  var id = new URLSearchParams(location.search).get('id') || '';
  var S = { file: null, dataUrl: '', gambarId: '' };
  var TIPE = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'], MAKS = 5 * 1024 * 1024;

  function pesan(t) { $('form-pesan').textContent = t || ''; }
  function tampilPreview(src) { var p = $('preview'); p.src = src; p.classList.remove('hidden'); }

  // ---------- gambar ----------
  function prosesFile(f) {
    if (!f) return;
    if (TIPE.indexOf(f.type) === -1) { A.toast('Format harus JPEG, PNG, GIF, atau WebP.'); return; }
    if (f.size > MAKS) { A.toast('Ukuran gambar maksimal 5 MB.'); return; }
    var fr = new FileReader();
    fr.onload = function () { S.file = f; S.dataUrl = String(fr.result); tampilPreview(S.dataUrl); };
    fr.readAsDataURL(f);
  }
  $('p-gambar').addEventListener('change', function (e) { prosesFile(e.target.files[0]); e.target.value = ''; });
  var drop = $('drop');
  ['dragover', 'dragenter'].forEach(function (n) { drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.add('border-brand'); }); });
  ['dragleave', 'drop'].forEach(function (n) { drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.remove('border-brand'); }); });
  drop.addEventListener('drop', function (e) { prosesFile(e.dataTransfer.files[0]); });

  $('p-deskripsi').addEventListener('input', function () { $('hitung-desk').textContent = this.value.length + '/2000'; });
  $('p-kategori').addEventListener('change', function () { $('p-kategori-lain').classList.toggle('hidden', this.value !== '__lain__'); });

  function nilai() {
    var kat = $('p-kategori').value === '__lain__' ? $('p-kategori-lain').value.trim() : $('p-kategori').value;
    return {
      nama: $('p-nama').value.trim(), deskripsi: $('p-deskripsi').value.trim(), harga: $('p-harga').value, hargaCoret: $('p-coret').value,
      stok: $('p-stok').value, kategori: kat, penjualUsername: $('p-penjual').value.trim().toLowerCase(),
      linkDownload: $('p-link').value.trim(), status: (document.querySelector('input[name="p-status"]:checked') || {}).value || 'aktif'
    };
  }
  function validasi(v) {
    if (!v.nama) return ['p-nama', 'Nama produk wajib diisi.'];
    if (!v.deskripsi) return ['p-deskripsi', 'Deskripsi wajib diisi.'];
    if (v.harga === '' || !(Number(v.harga) >= 0)) return ['p-harga', 'Harga harus angka 0 atau lebih.'];
    if (v.hargaCoret !== '' && !(Number(v.hargaCoret) >= 0)) return ['p-coret', 'Harga coret tidak valid.'];
    if (v.stok === '' || !(Number(v.stok) >= 0) || Math.floor(Number(v.stok)) !== Number(v.stok)) return ['p-stok', 'Stok harus bilangan bulat 0 atau lebih.'];
    if (!v.kategori) return ['p-kategori', 'Kategori wajib diisi.'];
    if (v.penjualUsername && !/^[a-z0-9_]{3,20}$/.test(v.penjualUsername)) return ['p-penjual', 'Username penjual tidak valid.'];
    if (v.linkDownload && !/^https:\/\//i.test(v.linkDownload)) return ['p-link', 'Tautan unduhan harus diawali https://'];
    return null;
  }

  // ---------- simpan ----------
  form.addEventListener('submit', async function (e) {
    e.preventDefault(); pesan('');
    var v = nilai(), err = validasi(v);
    if (err) { pesan(err[1]); $(err[0]).focus(); return; }
    var btn = $('btn-simpan'); btn.disabled = true; var asal = btn.textContent; btn.textContent = 'Menyimpan…';
    try {
      if (S.file) {
        var up = await Admin.api('uploadImage', { filename: S.file.name, base64: S.dataUrl.split(',')[1] || '' });
        if (!up.success) { pesan(up.message || 'Unggah gambar gagal.'); return; }
        S.gambarId = up.fileId;
      }
      v.gambarId = S.gambarId; if (id) v.id = id;
      var r = await Admin.api(id ? 'updateProduct' : 'addProduct', { product: v });
      if (!r.success) { pesan(r.message || 'Gagal menyimpan.'); return; }
      location.href = A.url('/superadmin/dashboard/') + '?pesan=' + encodeURIComponent(id ? 'Produk diperbarui' : 'Produk ditambahkan');
    } catch (ex) { pesan('Tidak dapat terhubung ke server.'); }
    finally { btn.disabled = false; btn.textContent = asal; }
  });

  $('btn-hapus').addEventListener('click', async function () {
    if (!id || !confirm('Hapus produk ini secara permanen?')) return;
    var r = await Admin.api('deleteProduct', { id: id });
    if (r.success) location.href = A.url('/superadmin/dashboard/') + '?pesan=' + encodeURIComponent('Produk dihapus');
    else pesan(r.message || 'Gagal menghapus.');
  });

  // ---------- muat data saat ubah ----------
  async function muat() {
    if (!id) { $('p-penjual').value = A.cfg.support; $('p-stok').value = 1; return; }
    $('judul-form').textContent = 'Ubah produk'; $('btn-hapus').classList.remove('hidden');
    var r = await Admin.api('getProduct', { id: id });
    if (!r.success) { pesan(r.message || 'Produk tidak ditemukan.'); form.querySelectorAll('input,textarea,select,button[type=submit]').forEach(function (x) { x.disabled = true; }); return; }
    var p = r.product;
    $('p-nama').value = p.nama; $('p-deskripsi').value = p.deskripsi; $('hitung-desk').textContent = p.deskripsi.length + '/2000';
    $('p-harga').value = p.harga; $('p-coret').value = p.hargaCoret || ''; $('p-stok').value = p.stok;
    var opsi = Array.prototype.map.call($('p-kategori').options, function (o) { return o.value; });
    if (opsi.indexOf(p.kategori) !== -1) $('p-kategori').value = p.kategori;
    else { $('p-kategori').value = '__lain__'; $('p-kategori-lain').classList.remove('hidden'); $('p-kategori-lain').value = p.kategori; }
    $('p-penjual').value = p.penjualUsername || ''; $('p-link').value = p.linkDownload || '';
    var rad = document.querySelector('input[name="p-status"][value="' + (p.status === 'nonaktif' ? 'nonaktif' : 'aktif') + '"]'); if (rad) rad.checked = true;
    S.gambarId = p.gambarId || ''; if (p.gambarId) tampilPreview(A.driveThumb(p.gambarId, 400));
  }
  muat(); // skrip dimuat dengan defer, DOM sudah siap
})();
