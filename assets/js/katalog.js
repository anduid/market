/* Katalog: filter, pencarian, dan urutan atas kartu yang sudah dirender server (ramah SEO). */
(function () {
  var grid = document.getElementById('kat-grid'); if (!grid) return;
  var cards = Array.prototype.slice.call(grid.children);
  var q = document.getElementById('kat-q'), kat = document.getElementById('kat-kategori'), urut = document.getElementById('kat-urut');
  var info = document.getElementById('kat-info'), kosong = document.getElementById('kat-kosong');

  var set = {};
  cards.forEach(function (c) { set[c.getAttribute('data-kategori')] = 1; });
  Object.keys(set).sort().forEach(function (k) { var o = document.createElement('option'); o.value = k; o.textContent = k; kat.appendChild(o); });

  var p = new URLSearchParams(location.search);
  q.value = p.get('q') || ''; if (set[p.get('kategori')]) kat.value = p.get('kategori');
  if (['baru', 'murah', 'mahal', 'diskon'].indexOf(p.get('urut')) !== -1) urut.value = p.get('urut');

  function num(c, a) { return Number(c.getAttribute(a)) || 0; }
  function jalan() {
    var kata = q.value.trim().toLowerCase(), k = kat.value, n = 0;
    cards.forEach(function (c) {
      var cocok = (!k || c.getAttribute('data-kategori') === k) && (!kata || c.getAttribute('data-nama').indexOf(kata) !== -1);
      c.classList.toggle('hidden', !cocok); if (cocok) n++;
    });
    var s = urut.value;
    cards.slice().sort(function (a, b) {
      if (s === 'murah') return num(a, 'data-harga') - num(b, 'data-harga');
      if (s === 'mahal') return num(b, 'data-harga') - num(a, 'data-harga');
      if (s === 'diskon') return num(b, 'data-diskon') - num(a, 'data-diskon');
      return a.getAttribute('data-tgl') < b.getAttribute('data-tgl') ? 1 : -1;
    }).forEach(function (c) { grid.appendChild(c); });
    info.textContent = n + ' produk ditemukan';
    kosong.classList.toggle('hidden', n !== 0);
    var np = new URLSearchParams(); if (q.value.trim()) np.set('q', q.value.trim()); if (k) np.set('kategori', k); if (s !== 'baru') np.set('urut', s);
    history.replaceState(null, '', location.pathname + (np.toString() ? '?' + np.toString() : ''));
  }
  [q, kat, urut].forEach(function (el) { el.addEventListener('input', jalan); el.addEventListener('change', jalan); });
  jalan();
})();
