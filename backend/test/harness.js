/**
 * Simulasi layanan Google (Sheets, Drive, Cache, Properties, Lock, Utilities) di memori
 * untuk menjalankan Code.gs tanpa Apps Script. Dipakai oleh run.js dan integrasi.js.
 * Simulasi Sheets meniru perilaku asli: teks "0812" -> angka, string ISO -> tanggal,
 * awalan "'" disembunyikan, sehingga masalah tipe data ikut teruji.
 */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'), nodeCrypto = require('crypto');

// ---------- jam palsu ----------
let offsetMs = 0;
const realNow = Date.now.bind(Date);
class FakeDate extends Date {
  constructor(...a) { if (a.length === 0) super(realNow() + offsetMs); else super(...a); }
  static now() { return realNow() + offsetMs; }
}

// ---------- simulasi layanan Google ----------
const signed = (buf) => Array.from(buf, (b) => (b > 127 ? b - 256 : b));
const unsigned = (arr) => Buffer.from(arr.map((b) => (b + 256) % 256));
const toBuf = (x) => (typeof x === 'string' ? Buffer.from(x, 'utf8') : unsigned(x));

const Utilities = {
  getUuid: () => nodeCrypto.randomUUID(),
  computeHmacSha256Signature: (v, k) => signed(nodeCrypto.createHmac('sha256', k).update(toBuf(v)).digest()),
  base64Encode: (x) => toBuf(x).toString('base64'),
  base64EncodeWebSafe: (x) => toBuf(x).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
  base64Decode: (s) => signed(Buffer.from(String(s), 'base64')),
  base64DecodeWebSafe: (s) => signed(Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
  newBlob: (bytes, mime, name) => ({ bytes, getBytes: () => bytes, getDataAsString: () => unsigned(bytes).toString('utf8'), getContentType: () => mime, getName: () => name })
};

function normalizeCell(v) {
  if (typeof v === 'string') {
    if (v.startsWith("'")) return v.slice(1);
    if (v.startsWith('=')) return 'FORMULA:' + v;
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return new FakeDate(v);
  }
  return v;
}
function makeSheet(name) {
  const data = [];
  const sh = {
    name, data,
    getName: () => name,
    getLastRow: () => data.length,
    getLastColumn: () => (data[0] ? data[0].length : 0),
    setFrozenRows() {},
    appendRow(arr) { data.push(arr.map(normalizeCell)); },
    deleteRow(r) { data.splice(r - 1, 1); },
    getRange(r, c, nr = 1, nc = 1) {
      const range = {
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => {
          const row = data[r - 1 + i]; const v = row ? row[c - 1 + j] : undefined; return v === undefined ? '' : v; })),
        setValues(vals) {
          vals.forEach((row, i) => { while (data.length < r + i) data.push([]); row.forEach((v, j) => { data[r - 1 + i][c - 1 + j] = normalizeCell(v); }); });
          return range;
        },
        setValue(v) { return range.setValues([[v]]); },
        getValue: () => range.getValues()[0][0],
        setFontWeight: () => range
      };
      return range;
    }
  };
  return sh;
}
const sheets = {};
const SpreadsheetApp = { openById: () => ({
  getSheetByName: (n) => sheets[n] || null,
  insertSheet: (n) => (sheets[n] = makeSheet(n))
}) };

const props = {};
const PropertiesService = { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }) };
const cacheStore = new Map();
const CacheService = { getScriptCache: () => ({
  get: (k) => { const e = cacheStore.get(k); if (!e) return null; if (e.exp <= FakeDate.now()) { cacheStore.delete(k); return null; } return e.v; },
  put: (k, v, sec) => cacheStore.set(k, { v: String(v), exp: FakeDate.now() + (sec || 600) * 1000 }),
  remove: (k) => cacheStore.delete(k)
}) };
const LockService = { getScriptLock: () => { let held = false; return { waitLock() { held = true; }, releaseLock() { held = false; }, hasLock: () => held }; } };
const ContentService = { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ setMimeType() { return this; }, getContent: () => t }) };

const files = []; const subfolders = {};
function folder(name) {
  return {
    createFile(blob) { const f = { id: 'FILE' + (files.length + 1), blob, name: blob.getName(), mime: blob.getContentType(), shared: null, getId() { return this.id; }, setSharing(a, p) { this.shared = [a, p]; } }; files.push(f); return f; },
    getFoldersByName(n) { const hit = subfolders[n]; let used = false; return { hasNext: () => !!hit && !used, next: () => { used = true; return hit; } }; },
    createFolder(n) { return (subfolders[n] = folder(n)); }
  };
}
const rootFolder = folder('root');
const DriveApp = { getFolderById: () => rootFolder, Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' }, Permission: { VIEW: 'VIEW' } };
const logs = []; const Logger = { log: (m) => logs.push(String(m)) };

const ctx = vm.createContext({ Date: FakeDate, JSON, Math, Number, String, Array, Object, Set, Map, Error, parseInt, parseFloat, isFinite, isNaN, Buffer,
  Utilities, SpreadsheetApp, PropertiesService, CacheService, LockService, ContentService, DriveApp, Logger, console });
let code = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
code = code.replace("const SPREADSHEET_ID  = 'PASTE_SPREADSHEET_ID_ANDA';", "const SPREADSHEET_ID  = 'sheet-uji';").replace("const DRIVE_FOLDER_ID = 'PASTE_DRIVE_FOLDER_ID_ANDA';", "const DRIVE_FOLDER_ID = 'folder-uji';");
vm.runInContext(code, ctx, { filename: 'Code.gs' });

// ---------- ekspor ----------
function call(action, params = {}, method = 'POST') {
  const out = method === 'GET' ? ctx.doGet({ parameter: { action, ...params } }) : ctx.doPost({ postData: { contents: JSON.stringify({ action, ...params }) } });
  return JSON.parse(out.getContent());
}
module.exports = { ctx, call, sheets, files, logs, props, advance: (ms) => { offsetMs += ms; }, FakeDate };
