#!/usr/bin/env node
/**
 * Mengambil produk AKTIF dari Apps Script (getPublicProducts) lalu menulis:
 *   _produk/<slug>.md          satu halaman per produk (SEO)
 *   _data/produk.json          data untuk beranda, katalog, promo
 *   assets/data/produk.json    data untuk keranjang dan chat di sisi klien
 *
 * Pemakaian:
 *   GAS_URL=https://script.google.com/macros/s/.../exec node scripts/ambil_produk.js
 *   node scripts/ambil_produk.js --contoh     (data contoh, tanpa Apps Script)
 *
 * Tautan unduhan TIDAK PERNAH ada di data ini (backend memang tidak mengirimkannya).
 * Teks produk disimpan sebagai string di front matter dan dikeluarkan dengan filter
 * "escape" di template, sehingga tidak bisa menyisipkan HTML/Liquid.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const GAS_URL = process.env.GAS_URL || '';
const MODE_CONTOH = process.argv.includes('--contoh');
const q = (v) => JSON.stringify(v);

const slugify = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/&/g, ' dan ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'produk';
const potong = (s, n) => { s = String(s).replace(/\s+/g, ' ').trim(); return s.length <= n ? s : s.slice(0, n - 1).replace(/[\s.,;:!?-]+$/, '') + '…'; };

async function ambilJson(url, percobaan = 3) {
  let galat;
  for (let i = 1; i <= percobaan; i++) {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 60000);
      const res = await fetch(url, { redirect: 'follow', signal: ctl.signal }); clearTimeout(t);
      return JSON.parse(await res.text());
    } catch (e) { galat = e; await new Promise((r) => setTimeout(r, 1500 * i)); }
  }
  throw new Error('Gagal mengambil data dari Apps Script: ' + galat.message);
}

async function ambilSemua() {
  if (MODE_CONTOH) return contoh();
  if (!GAS_URL || /GANTI_DENGAN/.test(GAS_URL)) throw new Error('GAS_URL belum diatur (GitHub Secret GAS_URL).');
  const semua = []; let offset = 0;
  for (;;) {
    const res = await ambilJson(`${GAS_URL}?action=getPublicProducts&limit=100&offset=${offset}`);
    if (!res || !res.success) throw new Error('Apps Script menolak permintaan: ' + (res && res.message));
    semua.push(...res.products); offset += res.products.length;
    if (!res.hasMore || !res.products.length) break;
  }
  return semua;
}

function contoh() {
  const t = (h) => new Date(Date.now() - h * 3600000).toISOString();
  return [
    { id: 'PRD-CONTOH01', nama: 'Android Kotlin POS Retail Multi-Outlet', deskripsi: 'Kode sumber aplikasi kasir Android native dengan Clean Architecture, printer thermal Bluetooth, dan integrasi QRIS dinamis.\n\nTermasuk dokumentasi instalasi dan pembaruan 12 bulan.', harga: 249000, hargaCoret: 450000, stok: 12, kategori: 'Source Code', gambarId: '', penjualUsername: 'andu', createdAt: t(5) },
    { id: 'PRD-CONTOH02', nama: 'SIPLokal v3.2 GovTech Microservices', deskripsi: 'Modul persuratan desa otomatis, enkripsi ASN, dan webhook QRIS resmi.', harga: 350000, hargaCoret: 600000, stok: 7, kategori: 'GovTech SaaS', gambarId: '', penjualUsername: 'andu', createdAt: t(24) },
    { id: 'PRD-CONTOH03', nama: 'VIP Academy: Android Native Jetpack Masterclass', deskripsi: 'Akses seumur hidup ke repositori privat, pembaruan modul 12 bulan, dan mentoring arsitektur.', harga: 149000, hargaCoret: 300000, stok: 30, kategori: 'VIP Academy', gambarId: '', penjualUsername: 'andu', createdAt: t(48) },
    { id: 'PRD-CONTOH04', nama: 'E-Commerce UI/UX Design System (Figma)', deskripsi: 'Sistem desain e-commerce dengan auto-layout, komponen, dan token warna.', harga: 79000, hargaCoret: 150000, stok: 50, kategori: 'UI/UX Kits', gambarId: '', penjualUsername: 'andu', createdAt: t(72) },
    { id: 'PRD-CONTOH05', nama: 'Dynamic QRIS & Virtual Account Webhook API', deskripsi: 'Mesin webhook pembayaran dengan verifikasi tanda tangan dan antrean ulang.', harga: 189000, hargaCoret: 299000, stok: 0, kategori: 'API & Tokens', gambarId: '', penjualUsername: 'andu', createdAt: t(96) },
    { id: 'PRD-CONTOH06', nama: 'Clean Architecture Boilerplate 2026', deskripsi: 'Kerangka proyek Android dengan Hilt, Room, dan Compose. Gratis untuk komunitas.', harga: 0, hargaCoret: 50000, stok: 999, kategori: 'Freebies', gambarId: '', penjualUsername: 'andu', createdAt: t(120) }
  ];
}

function tulis(file, isi) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, isi, 'utf8'); }

async function utama() {
  const mentah = await ambilSemua();
  if (!Array.isArray(mentah)) throw new Error('Respons tidak valid.');
  const dir = path.join(ROOT, '_produk');
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.md')) fs.unlinkSync(path.join(dir, f));

  const dipakai = new Set(); const daftar = [];
  for (const r of mentah) {
    if (!r || !/^[A-Za-z0-9_-]{3,40}$/.test(String(r.id)) || !r.nama) continue;
    const harga = Math.max(0, Number(r.harga) || 0), coret = Math.max(0, Number(r.hargaCoret) || 0);
    let slug = slugify(r.nama) + '-' + String(r.id).toLowerCase().replace(/^prd-/, '');
    if (dipakai.has(slug)) continue; dipakai.add(slug);
    const d = new Date(r.createdAt); const tgl = isNaN(d) ? new Date() : d;
    const gid = /^[A-Za-z0-9_-]{10,120}$/.test(String(r.gambarId || '')) ? String(r.gambarId) : '';
    const item = {
      id: String(r.id), slug, nama: String(r.nama), ringkas: potong(r.deskripsi, 140), deskripsi: String(r.deskripsi || ''),
      harga, harga_coret: coret > harga ? coret : 0, diskon: coret > harga ? Math.round((1 - harga / coret) * 100) : 0,
      stok: Math.max(0, Number(r.stok) || 0), kategori: String(r.kategori || 'Lainnya'), gambar_id: gid,
      penjual: String(r.penjualUsername || ''), tgl: tgl.toISOString()
    };
    daftar.push(item);
    tulis(path.join(dir, slug + '.md'), [
      '---', 'layout: produk',
      `id_produk: ${q(item.id)}`, `nama: ${q(item.nama)}`, `ringkas: ${q(item.ringkas)}`, `deskripsi: ${q(item.deskripsi)}`,
      `harga: ${item.harga}`, `harga_coret: ${item.harga_coret}`, `diskon: ${item.diskon}`, `stok: ${item.stok}`,
      `kategori: ${q(item.kategori)}`, `gambar_id: ${q(item.gambar_id)}`, `penjual: ${q(item.penjual)}`,
      `date: ${item.tgl}`, '---', ''].join('\n'));
  }
  daftar.sort((a, b) => (a.tgl < b.tgl ? 1 : -1));
  tulis(path.join(ROOT, '_data', 'produk.json'), JSON.stringify(daftar));
  tulis(path.join(ROOT, 'assets', 'data', 'produk.json'), JSON.stringify(daftar.map(({ deskripsi, ...ringan }) => ringan)));
  console.log(`Selesai: ${daftar.length} produk aktif${MODE_CONTOH ? ' (data contoh)' : ''}.`);
}
utama().catch((e) => { console.error('GALAT:', e.message); process.exit(1); });
