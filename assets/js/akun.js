(function () {
  var A = window.Andu, $ = function (id) { return document.getElementById(id); };
  var auth = $('akun-auth'); if (!auth) return;
  var profil = $('akun-profil'), pesan = $('auth-pesan');

  function tampil() {
    var u = A.user();
    auth.classList.toggle('hidden', !!u); profil.classList.toggle('hidden', !u); profil.classList.toggle('grid', !!u);
    if (!u) return;
    $('p-nama').textContent = u.nama; $('p-user').textContent = '@' + u.username;
    $('p-role').textContent = u.role === 'superadmin' ? 'Superadmin' : 'Pembeli';
    $('link-admin').classList.toggle('hidden', u.role !== 'superadmin');
    $('pr-nama').value = u.nama; $('pr-email').value = u.email || ''; $('pr-telp').value = u.telepon || '';
    muatSaldo();
  }
  async function muatSaldo() {
    var ul = $('saldo-riwayat');
    try {
      var r = await A.api('getSaldo', {}, { noRedirect: true });
      if (!r.success) throw 0;
      $('saldo-total').textContent = A.rupiah(r.saldo).replace('Gratis', 'Rp 0');
      $('saldo-belanja').classList.toggle('hidden', r.saldo <= 0);
      ul.innerHTML = r.riwayat.length ? r.riwayat.map(function (x) {
        var plus = x.jumlah > 0;
        return '<li class="flex items-start justify-between gap-3"><span><span class="block">' + A.esc(x.keterangan) + '</span><span class="text-xs text-slate-500">' + A.esc(A.tgl(x.createdAt)) + '</span></span>' +
          '<span class="whitespace-nowrap font-mono font-bold ' + (plus ? 'text-emerald-700' : 'text-slate-600') + '">' + (plus ? '+' : '-') + A.esc(A.rupiah(Math.abs(x.jumlah))) + '</span></li>';
      }).join('') : '<li class="text-slate-500">Belum ada mutasi saldo. Kode unik dari pembayaran QRIS yang disetujui akan muncul di sini.</li>';
    } catch (e) { ul.innerHTML = '<li class="text-slate-500">Saldo tidak dapat dimuat sekarang.</li>'; }
  }
  function tab(daftar) {
    $('form-masuk').classList.toggle('hidden', daftar); $('form-daftar').classList.toggle('hidden', !daftar);
    $('tab-masuk').className = 'rounded-lg py-2 ' + (daftar ? 'text-slate-500' : 'bg-white shadow-sm');
    $('tab-daftar').className = 'rounded-lg py-2 ' + (daftar ? 'bg-white shadow-sm' : 'text-slate-500');
    $('tab-masuk').setAttribute('aria-selected', String(!daftar)); $('tab-daftar').setAttribute('aria-selected', String(daftar));
    pesan.textContent = '';
  }
  $('tab-masuk').addEventListener('click', function () { tab(false); });
  $('tab-daftar').addEventListener('click', function () { tab(true); });

  async function masuk(username, password) {
    var r = await A.api('login', { username: username, password: password }, { noRedirect: true });
    if (!r.success) { pesan.textContent = r.message || 'Gagal masuk.'; return; }
    A.session.set(r.token, r.user, r.expiresInSec);
    var next = A.amanNext(new URLSearchParams(location.search).get('next'));
    if (next && !/\/akun\/?(\?|$)/.test(next)) { location.href = next; return; }
    pesan.textContent = ''; tampil(); A.updateBadges(); A.pollBadge();
  }

  $('form-masuk').addEventListener('submit', function (e) {
    e.preventDefault();
    var u = $('m-user').value.trim().toLowerCase(), p = $('m-pass').value;
    if (!u || !p) { pesan.textContent = 'Username dan kata sandi wajib diisi.'; return; }
    masuk(u, p);
  });
  $('form-daftar').addEventListener('submit', async function (e) {
    e.preventDefault();
    var username = $('d-user').value.trim().toLowerCase(), password = $('d-pass').value;
    var r = await A.api('register', { nama: $('d-nama').value, username: username, email: $('d-email').value, telepon: $('d-telp').value, password: password }, { noRedirect: true });
    if (!r.success) { pesan.textContent = r.message || 'Pendaftaran gagal.'; return; }
    A.toast('Akun dibuat. Masuk otomatis…'); masuk(username, password);
  });
  $('form-profil').addEventListener('submit', async function (e) {
    e.preventDefault();
    var r = await A.api('updateProfile', { nama: $('pr-nama').value, email: $('pr-email').value, telepon: $('pr-telp').value });
    if (r.success) { A.session.update(r.user); tampil(); A.toast('Profil disimpan'); } else A.toast(r.message || 'Gagal menyimpan.');
  });
  $('form-sandi').addEventListener('submit', async function (e) {
    e.preventDefault();
    var r = await A.api('changePassword', { oldPassword: $('s-lama').value, newPassword: $('s-baru').value });
    if (r.success) { A.session.clear(); A.toast('Kata sandi diganti. Silakan masuk lagi.'); tampil(); } else A.toast(r.message || 'Gagal mengganti kata sandi.');
  });
  $('btn-keluar').addEventListener('click', async function () {
    try { await A.api('logout', {}, { noRedirect: true }); } catch (e) {}
    A.session.clear(); A.updateBadges(0); tampil();
  });
  A.pub('getConfig').then(function (c) { if (c && c.allowRegister === false) $('tab-daftar').classList.add('hidden'); }).catch(function () {});
  tampil();
})();
