// 学委端本地自动备份：免费云部署的容器文件系统是临时的，重新部署/重启会清库，
// 这里把全量数据留在学委自己的设备（IndexedDB）里，清库后可在学委端一键恢复。
import { api } from './api.js';

const DB_NAME = 'attendance-backup';
const STORE = 'kv';
const KEY_META = 'meta'; // { rev, savedAt, counts }
const KEY_SNAPSHOT = 'snapshot'; // 全量数据

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('当前浏览器不支持本地备份'));
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE);
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function idbGet(key) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
      }),
  );
}

function idbPut(key, val) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(val, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      }),
  );
}

export const countsOf = (p) => ({
  classes: (p?.classes || []).length,
  sessions: (p?.sessions || []).length,
  records: (p?.sessions || []).reduce((n, s) => n + ((s.records || []).length), 0),
});

export const readLocalMeta = () => idbGet(KEY_META);
export const readLocalSnapshot = () => idbGet(KEY_SNAPSHOT);

// 拉取服务端全量数据并写入本机
export async function snapshotToLocal() {
  const payload = await api.backup();
  await idbPut(KEY_SNAPSHOT, payload);
  const meta = { rev: payload.rev, savedAt: Date.now(), counts: countsOf(payload) };
  await idbPut(KEY_META, meta);
  return meta;
}

// 轮询用：仅当服务端数据版本变化时才重新拉取（避免反复传输大体积备份）
export async function syncIfChanged() {
  try {
    const { rev } = await api.backupRev();
    const meta = await readLocalMeta();
    if (meta && meta.rev === rev) return meta;
    return await snapshotToLocal();
  } catch {
    return null;
  }
}

// 一键恢复：把本机备份放回服务端，随后立即备份一次以对齐版本号
export async function restoreFromLocal() {
  const payload = await readLocalSnapshot();
  if (!payload) throw new Error('本机没有可用备份');
  const stats = await api.restore(payload);
  const meta = await snapshotToLocal();
  return { stats, meta };
}
