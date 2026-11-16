(function () {
  var A = window.Andu, f = document.getElementById('form-admin'); if (!f) return;
  var pesan = document.getElementById('a-pesan'), btn = document.getElementById('a-btn');
  if (window.Admin.session()) { location.href = A.url('/superadmin/dashboard/'); return; }
  f.addEventListener('submit', async function (e) {
    e.preventDefault();
    var u = document.getElementById('a-user').value.trim().toLowerCase(), p = document.getElementById('a-pass').value;
    if (!u || !p) { pesan.textContent = 'Username dan kata sandi wajib diisi.'; return; }
    btn.disabled = true; btn.textContent = 'Memverifikasi…'; pesan.textContent = '';
    try {
      var r = await A.api('login', { username: u, password: p }, { session: null, noRedirect: true });
      if (!r.success) pesan.textContent = r.message || 'Gagal masuk.';
      else if (!r.user || r.user.role !== 'superadmin') pesan.textContent = 'Akun ini bukan superadmin.';
      else { window.Admin.set(r.token, r.user); location.href = A.url('/superadmin/dashboard/'); return; }
    } catch (err) { pesan.textContent = 'Tidak dapat terhubung ke server. Periksa api_url di _config.yml.'; }
    btn.disabled = false; btn.textContent = 'Masuk';
  });
})();
