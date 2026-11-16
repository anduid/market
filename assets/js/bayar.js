/* Sheet pembayaran QRIS (diambil dari andu.my.id/portal, disesuaikan untuk marketplace).
 * Dipakai oleh keranjang dan pesanan: Andu.pay.open(order, { onPaid, onCancel }). */
(function () {
  'use strict';
  var A = window.Andu; if (!A) return;
  var payT = null, pollT = null;

  function rp(n) { return A.rupiah(n).replace('Gratis', 'Rp 0'); }

  function qrDraw(el, text) {
    var go = function () {
      el.innerHTML = '';
      new window.QRCode(el, { text: text, width: 200, height: 200, colorDark: '#000000', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.M });
    };
    if (window.QRCode) return go();
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload = go;
    s.onerror = function () { el.textContent = 'QR gagal dimuat. Muat ulang halaman.'; };
    document.head.appendChild(s);
  }

  function sheet(html) {
    var o = document.getElementById('andu-pay');
    if (!o) {
      o = document.createElement('div'); o.id = 'andu-pay';
      o.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.55);display:flex;align-items:flex-end;justify-content:center';
      document.body.appendChild(o);
    }
    o.innerHTML = '<div style="background:#fff;color:#0f172a;width:100%;max-width:448px;max-height:92vh;overflow:auto;border-radius:24px 24px 0 0;padding:20px;font-family:inherit">' + html + '</div>';
    o.onclick = function (e) { if (e.target === o) P.close(); };
    return o;
  }
  function row(a, b, strong) {
    return '<div style="display:flex;justify-content:space-between;font-size:' + (strong ? 15 : 13) + 'px;' + (strong ? 'font-weight:800;' : 'color:#475569;') + 'padding:3px 0"><span>' + a + '</span><span style="font-family:monospace">' + b + '</span></div>';
  }
  function btn(id, label, primary) {
    return '<button id="' + id + '" type="button" style="width:100%;padding:13px;border-radius:14px;font-weight:800;font-size:14px;cursor:pointer;border:' +
      (primary ? '0;background:#10b981;color:#fff' : '1px solid #cbd5e1;background:#fff;color:#334155') + '">' + label + '</button>';
  }

  var P = A.pay = {
    close: function () {
      clearInterval(payT); clearInterval(pollT);
      var o = document.getElementById('andu-pay'); if (o) o.remove();
    },

    open: function (ord, hooks) {
      hooks = hooks || {};
      clearInterval(payT); clearInterval(pollT);
      if (ord.status === 'verifikasi') return P.wait(ord, hooks);
      if (ord.status === 'lunas') { A.toast('Pesanan sudah lunas.'); return; }
      if (ord.status !== 'menunggu') { A.toast('Pesanan ini sudah ditutup. Buat pesanan baru.'); return; }
      if (!ord.qris) { A.toast('Kode QRIS tidak tersedia. Muat ulang halaman.'); return; }

      var exp = Date.parse(ord.expiresAt);
      var it = (ord.items || []).map(function (i) {
        return '<div style="font-size:12px;color:#64748b;display:flex;justify-content:space-between;gap:8px"><span>' + A.esc(i.nama) + '</span><span>' + rp(i.harga) + '</span></div>';
      }).join('');

      sheet(
        '<div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:17px">Bayar dengan QRIS</b>' +
        '<button id="pc-x" type="button" aria-label="Tutup" style="font-size:20px;color:#94a3b8;cursor:pointer;background:none;border:0">✕</button></div>' +
        '<div style="font:600 11px monospace;color:#64748b;margin:2px 0 10px">' + A.esc(ord.id) + '</div>' + it +
        '<div style="display:flex;justify-content:center;margin:14px 0"><div id="pc-qr" style="background:#fff;padding:8px;border:1px solid #e2e8f0;border-radius:14px;min-width:216px;min-height:216px;display:flex;align-items:center;justify-content:center"></div></div>' +
        '<div style="background:#f8fafc;border-radius:14px;padding:10px 12px">' + row('Subtotal', rp(ord.total)) + (ord.saldoPakai ? row('Saldo terpakai', '-' + rp(ord.saldoPakai)) : '') + row('Kode unik', '+' + ord.kodeUnik) +
        '<div style="border-top:1px solid #e2e8f0;margin-top:6px;padding-top:6px">' + row('Total transfer', rp(ord.totalBayar), true) + '</div></div>' +
        '<p style="font-size:12px;color:#b45309;margin:10px 0">Bayar <b>persis</b> ' + rp(ord.totalBayar) + ' agar pembayaran mudah dicocokkan. Kode unik <b>menjadi saldo Anda</b> setelah pembayaran disetujui dan otomatis memotong pembelian berikutnya. Kedaluwarsa dalam <b id="pc-cd" style="font-family:monospace"></b></p>' +
        '<input id="pc-name" maxlength="80" placeholder="Nama pengirim di mutasi (opsional)" style="width:100%;padding:11px;border:1px solid #cbd5e1;border-radius:12px;font-size:13px;margin-bottom:8px;box-sizing:border-box">' +
        '<div id="pc-err" style="color:#dc2626;font-size:12px;min-height:16px"></div>' +
        btn('pc-done', 'Saya sudah bayar', true) + '<div style="height:8px"></div>' + btn('pc-copy', 'Salin nominal') +
        '<button id="pc-cancel" type="button" style="display:block;margin:12px auto 0;font-size:12px;color:#94a3b8;background:none;border:0;text-decoration:underline;cursor:pointer">Batalkan pesanan</button>'
      );
      qrDraw(document.getElementById('pc-qr'), ord.qris);

      var tick = function () {
        var s = Math.max(0, Math.floor((exp - Date.now()) / 1000)), el = document.getElementById('pc-cd');
        if (el) el.textContent = Math.floor(s / 3600) + ':' + ('0' + Math.floor(s % 3600 / 60)).slice(-2) + ':' + ('0' + s % 60).slice(-2);
        if (!s) clearInterval(payT);
      };
      tick(); payT = setInterval(tick, 1000);

      document.getElementById('pc-x').onclick = P.close;
      document.getElementById('pc-copy').onclick = function () {
        try { navigator.clipboard.writeText(String(ord.totalBayar)); A.toast('Nominal disalin: ' + ord.totalBayar); } catch (e) {}
      };
      document.getElementById('pc-done').onclick = async function () {
        var b = this; b.disabled = true;
        try {
          var j = await A.api('claimPaid', { id: ord.id, pengirim: document.getElementById('pc-name').value });
          if (j.success) { ord.status = 'verifikasi'; P.wait(j.order && j.order.totalBayar ? Object.assign({}, ord, j.order) : ord, hooks); }
          else { document.getElementById('pc-err').textContent = j.message || 'Gagal.'; b.disabled = false; }
        } catch (e) { document.getElementById('pc-err').textContent = 'Tidak dapat terhubung ke server.'; b.disabled = false; }
      };
      document.getElementById('pc-cancel').onclick = async function () {
        if (!confirm('Batalkan pesanan ini?')) return;
        try {
          var j = await A.api('cancelOrder', { id: ord.id });
          if (j.success) { P.close(); A.toast('Pesanan dibatalkan.'); if (hooks.onCancel) hooks.onCancel(); }
          else document.getElementById('pc-err').textContent = j.message || 'Gagal.';
        } catch (e) { document.getElementById('pc-err').textContent = 'Tidak dapat terhubung ke server.'; }
      };
    },

    wait: function (ord, hooks) {
      hooks = hooks || {};
      sheet('<div style="text-align:center;padding:12px 0"><div style="font-size:44px" aria-hidden="true">⏳</div>' +
        '<b style="font-size:17px;display:block;margin:6px 0">Menunggu verifikasi</b>' +
        '<p style="font-size:13px;color:#475569">Konfirmasi Anda sudah dikirim ke admin. Tautan unduhan muncul otomatis setelah pembayaran dicocokkan.</p>' +
        '<p style="font:700 13px monospace;color:#059669;margin:10px 0">' + A.esc(ord.id) + ' · ' + rp(ord.totalBayar) + '</p>' +
        btn('pw-close', 'Tutup (tetap dipantau)') + '</div>');
      document.getElementById('pw-close').onclick = P.close;
      clearInterval(pollT);
      pollT = setInterval(async function () {
        if (document.hidden) return;
        try {
          var j = await A.api('getMyOrders', {}, { noRedirect: true }); if (!j.success) return;
          var o = j.orders.filter(function (x) { return x.id === ord.id; })[0];
          if (!o || o.status === 'verifikasi') return;
          clearInterval(pollT);
          if (o.status === 'lunas') {
            P.close(); A.toast('Pembayaran disetujui! Tautan unduhan sudah tersedia.', 5000);
            if (hooks.onPaid) hooks.onPaid(o); else location.href = A.url('/pesanan/');
          } else {
            P.close(); A.toast('Pembayaran belum ditemukan. Cek chat untuk detailnya.', 6000);
            if (hooks.onCancel) hooks.onCancel();
          }
        } catch (e) {}
      }, 8000);
    }
  };
})();
