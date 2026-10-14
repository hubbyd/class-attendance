import crypto from 'node:crypto';
import { haversineMeters } from './geo.js';
import { checkPasscode, now, uid, deviceIndex } from './store.js';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

export const FLAGS = {
  SESSION_CLOSED: 'SESSION_CLOSED',
  ALREADY_CHECKED: 'ALREADY_CHECKED',
  PASSCODE_INVALID: 'PASSCODE_INVALID',
  DEVICE_REUSE: 'DEVICE_REUSE',
  NO_LOCATION: 'NO_LOCATION',
  GEO_OUT_OF_RANGE: 'GEO_OUT_OF_RANGE',
  GEO_LOW_ACCURACY: 'GEO_LOW_ACCURACY',
  GEO_MOCK_SUSPECT: 'GEO_MOCK_SUSPECT',
  LIVENESS_FAIL: 'LIVENESS_FAIL',
  PHOTO_MISSING: 'PHOTO_MISSING',
  PHOTO_REUSED: 'PHOTO_REUSED',
};

// 硬性拒绝：直接判为 rejected，不可计入出勤
const HARD = new Set([
  FLAGS.SESSION_CLOSED,
  FLAGS.ALREADY_CHECKED,
  FLAGS.PASSCODE_INVALID,
  FLAGS.DEVICE_REUSE,
  FLAGS.NO_LOCATION,
  FLAGS.GEO_OUT_OF_RANGE,
  FLAGS.LIVENESS_FAIL,
  FLAGS.PHOTO_MISSING,
  FLAGS.PHOTO_REUSED,
]);

// 活体阈值：帧间平均变化率下限（低于该值视为静态照片/翻拍）
const MOTION_THRESHOLD = 0.01;

/**
 * 核心防作弊校验。
 * @returns {{ record: object, distance: number|null }}
 */
export function verify(session, p) {
  const flags = [];
  const t = now();

  // 1) 场次有效性
  if (session.status !== 'active' || t > session.endAt) flags.push(FLAGS.SESSION_CLOSED);

  // 2) 重复签到（仅 present/flagged 视为已占位，rejected 可重试）
  const prev = session.records.find(
    (r) => r.studentId === p.studentId && (r.status === 'present' || r.status === 'flagged'),
  );
  if (prev) flags.push(FLAGS.ALREADY_CHECKED);

  // 3) 动态口令（防口令外泄、群内转发）
  if (!checkPasscode(session, p.passcode, t)) flags.push(FLAGS.PASSCODE_INVALID);

  // 4) 设备指纹（防同设备代多人签到）
  const dev = (p.deviceFingerprint || 'unknown').slice(0, 128);
  const owner = session.deviceMap.get(dev);
  if (owner && owner !== p.studentId) flags.push(FLAGS.DEVICE_REUSE);

  // 5) GPS 定位围栏（防远程/异地签到）
  const loc = p.location;
  let distance = null;
  if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') {
    flags.push(FLAGS.NO_LOCATION);
  } else {
    distance = haversineMeters(session.center, { lat: loc.lat, lng: loc.lng });
    if (distance > session.radiusMeters) flags.push(FLAGS.GEO_OUT_OF_RANGE);
    const acc = Number(loc.accuracy);
    if (!isFinite(acc) || acc <= 0) flags.push(FLAGS.GEO_MOCK_SUSPECT);
    else if (acc > 150) flags.push(FLAGS.GEO_LOW_ACCURACY);
  }

  // 6) 拍照（防照片/同图复用）
  // 采用系统相机时客户端只上传单张照片、不提供帧间运动量，
  // 因此仅当客户端确实提供了运动数据时才做活体判定，避免误判为活体失败。
  if (p.checkinType === 'photo') {
    if (!p.photo) flags.push(FLAGS.PHOTO_MISSING);
    if (p.motionScore != null && !(Number(p.motionScore) >= MOTION_THRESHOLD)) flags.push(FLAGS.LIVENESS_FAIL);
    if (p.photo) {
      const h = sha(p.photo);
      const holder = session.photoHashes.get(h);
      if (holder && holder !== p.studentId) flags.push(FLAGS.PHOTO_REUSED);
    }
  }

  const hardHit = flags.some((f) => HARD.has(f));
  let status = 'present';
  if (hardHit) status = 'rejected';
  else if (flags.length) status = 'flagged';

  const record = {
    id: uid('r_'),
    studentId: p.studentId,
    name: p.name,
    studentNo: p.studentNo,
    checkinType: p.checkinType === 'photo' ? 'photo' : 'gps',
    status, // present | flagged | rejected
    flags,
    distance: distance == null ? null : Math.round(distance),
    location: loc || null,
    deviceFingerprint: dev,
    photo: p.photo || null,
    motionScore: p.motionScore == null ? null : Number(p.motionScore),
    createdAt: t,
  };
  session.records.push(record);

  // 仅在非硬性拒绝时登记设备/照片，避免误伤后占用
  if (status !== 'rejected') {
    session.deviceMap.set(dev, p.studentId);
    if (p.photo) session.photoHashes.set(sha(p.photo), p.studentId);
    if (!deviceIndex.has(dev)) deviceIndex.set(dev, new Set());
    deviceIndex.get(dev).add(p.studentId);
  }

  return { record, distance };
}

// 教师复核：通过 / 拒绝
export function review(session, recordId, action) {
  const r = session.records.find((x) => x.id === recordId);
  if (!r) return null;
  r.status = action === 'approve' ? 'present' : 'rejected';
  r.reviewedAt = now();
  if (r.status === 'present') {
    session.deviceMap.set(r.deviceFingerprint, r.studentId);
    if (r.photo) session.photoHashes.set(sha(r.photo), r.studentId);
  }
  return r;
}
