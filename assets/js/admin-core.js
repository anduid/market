/* Inti panel superadmin (pola sesi dari Todipener: token di sessionStorage, gerbang di setiap halaman). */
(function () {
  'use strict';
  var A = window.Andu, K = 'andu_admin_session';
  var Admin = (window.Admin = {});
  Admin.session = function () { try { var s = JSON.parse(sessionStorage.getItem(K) || 'null'); return s && s.token ? s : null; } catch (e) { return null; } };
  Admin.set = function (token, user) { sessionStorage.setItem(K, JSON.stringify({ token: token, user: user })); };
  Admin.clear = function () { sessionStorage.removeItem(K); };
  Admin.loginUrl = function () { return A.url('/superadmin/'); };
  Admin.keluar = function () { Admin.clear(); location.href = Admin.loginUrl(); };
  Admin.api = function (action, params) {
    return A.api(action, params, { session: Admin.session(), onExpired: function () { A.toast('Sesi berakhir. Silakan masuk lagi.'); setTimeout(Admin.keluar, 800); } });
  };
  Admin.guard = function () {
    var s = Admin.session();
    if (!s || !s.user || s.user.role !== 'superadmin') { Admin.keluar(); return false; }
    return true;
  };
  document.addEventListener('DOMContentLoaded', function () {
    if (document.body.getAttribute('data-guard') === 'true') {
      if (!Admin.guard()) return;
      var n = document.getElementById('admin-nama'), s = Admin.session();
      if (n && s) n.textContent = s.user.nama + ' (@' + s.user.username + ')';
      var k = document.getElementById('admin-keluar');
      if (k) k.addEventListener('click', async function () { try { await Admin.api('logout', {}); } catch (e) {} Admin.keluar(); });
    }
    var p = new URLSearchParams(location.search).get('pesan');
    if (p) { A.toast(p); var u = new URL(location.href); u.searchParams.delete('pesan'); history.replaceState(null, '', u.pathname + u.search); }
  });
})();
