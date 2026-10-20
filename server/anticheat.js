import crypto from 'node:crypto';
import { haversineMeters } from './geo.js';
import { checkPasscode, now, uid, deviceIndex, studentById } from './store.js';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

export const FLAGS = {
  SESSION_CLOSED: 'SESSION_CLOSED',
  PASSCODE_INVALID: 'PASSCODE_INVALID',
  DEVICE_REUSE: 'DEVICE_REUSE',
  DEVICE_BOUND_OTHER: 'DEVICE_BOUND_OTHER',
  NO_LOCATION: 'NO_LOCATION',
  GEO_OUT_OF_RANGE: 'GEO_OUT_OF_RANGE',
  GEO_LOW_ACCURACY: 'GEO_LOW_ACCURACY',
  GEO_MOCK_SUSPECT: 'GEO_MOCK_SUSPECT',
  GEO_UNREALISTIC_ACCURACY: 'GEO_UNREALISTIC_ACCURACY',
  GEO_FROZEN: 'GEO_FROZEN',
  GEO_API_TAMPER: 'GEO_API_TAMPER',
  GEO_IP_MISMATCH: 'GEO_IP_MISMATCH',
  LIVENESS_FAIL: 'LIVENESS_FAIL',
  PHOTO_MISSING: 'PHOTO_MISSING',
  PHOTO_REUSED: 'PHOTO_REUSED',
  FACE_MISMATCH: 'FACE_MISMATCH',
  FACE_NOT_ENROLLED: 'FACE_NOT_ENROLLED',
  FACE_NOT_DETECTED: 'FACE_NOT_DETECTED',
};

// 硬性拒绝：直接判为 rejected，不可计入出勤
const HARD = new Set([
  FLAGS.SESSION_CLOSED,
  FLAGS.PASSCODE_INVALID,
  FLAGS.DEVICE_REUSE,
  FLAGS.DEVICE_BOUND_OTHER,
  FLAGS.NO_LOCATION,
  FLAGS.GEO_OUT_OF_RANGE,
  FLAGS.GEO_API_TAMPER,
  FLAGS.LIVENESS_FAIL,
  FLAGS.PHOTO_MISSING,
  FLAGS.PHOTO_REUSED,
  FLAGS.FACE_MISMATCH,
]);

// 人脸 1:1 比对阈值：face-api 的 128 维描述子，欧氏距离大于该值视为「不是本人」
// 0.6 为其官方推荐的分界线（同人通常 <0.5，不同人通常 >0.6）
const FACE_DISTANCE_THRESHOLD = Number(process.env.FACE_THRESHOLD || 0.6);

function faceDistanceOf(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

// 反虚拟定位：坐标与网络 IP 归属地相距超过该值即提示异常（IP 只到城市级，阈值取大一些防误判）
const IP_MISMATCH_METERS = 300000;

// 多次采样坐标完全一致 + 精度又好，才判定为「坐标冻结」（真实 GPS 会有轻微漂移）
const FROZEN_BEST_ACCURACY = 10;

// 活体阈值：帧间平均变化率下限（低于该值视为静态照片/翻拍）
const MOTION_THRESHOLD = 0.01;

/**
 * 核心防作弊校验。
 * @returns {{ record: object, distance: number|null }}
 */
export function verify(session, p) {
  const t = now();

  // 1) 重复签到：已出勤（present）或已提交待复核（flagged）的学生不再接受二次提交，
  //    直接返回已有记录，不产生新记录（避免把已签到学生冲成“已拒绝”）
  const prev = session.records.find(
    (r) => r.studentId === p.studentId && (r.status === 'present' || r.status === 'flagged'),
  );
  if (prev) return { already: true, record: prev, distance: prev.distance ?? null };

  const flags = [];

  // 2) 场次有效性
  if (session.status !== 'active' || t > session.endAt) flags.push(FLAGS.SESSION_CLOSED);

  // 3) 动态口令（防口令外泄、群内转发）
  if (!checkPasscode(session, p.passcode, t)) flags.push(FLAGS.PASSCODE_INVALID);

  // 4) 设备指纹（防同设备代多人签到）
  const dev = (p.deviceFingerprint || 'unknown').slice(0, 128);
  const owner = session.deviceMap.get(dev);
  if (owner && owner !== p.studentId) flags.push(FLAGS.DEVICE_REUSE);
  // 全局设备—学号绑定：该设备历史上已为其他同学签过到 → 视为代签设备，直接拒绝
  const owners = deviceIndex.get(dev);
  if (owners && [...owners].some((sid) => sid !== p.studentId)) flags.push(FLAGS.DEVICE_BOUND_OTHER);

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

  // 6) 拍照：取消「纯定位签到」，所有签到都必须现场拍照，无人脸照片一律拒绝
  //    （纯定位无法绑定身份，是备用机代签的主要入口）
  if (!p.photo) flags.push(FLAGS.PHOTO_MISSING);
  // 采用系统相机时客户端只上传单张照片、不提供帧间运动量，
  // 因此仅当客户端确实提供了运动数据时才做活体判定，避免误判为活体失败。
  if (p.motionScore != null && !(Number(p.motionScore) >= MOTION_THRESHOLD)) flags.push(FLAGS.LIVENESS_FAIL);
  if (p.photo) {
    const h = sha(p.photo);
    const holder = session.photoHashes.get(h);
    if (holder && holder !== p.studentId) flags.push(FLAGS.PHOTO_REUSED);
  }

  // 7) 人脸 1:1 核验：把「设备在教室」升级为「你就是你」，从根上挡住备用机代签
  const stu = studentById(p.studentId);
  const enrolled = stu && Array.isArray(stu.faceDescriptor) && stu.faceDescriptor.length;
  let faceDistance = null;
  if (!enrolled) {
    // 尚未采集人脸底照：无法比对，交由学委人工复核
    flags.push(FLAGS.FACE_NOT_ENROLLED);
  } else if (Array.isArray(p.faceDescriptor) && p.faceDescriptor.length === stu.faceDescriptor.length) {
    faceDistance = faceDistanceOf(stu.faceDescriptor, p.faceDescriptor);
    if (faceDistance > FACE_DISTANCE_THRESHOLD) flags.push(FLAGS.FACE_MISMATCH);
  } else {
    // 已采集底照，但本次没能提取到人脸特征（如画面里没有人脸）→ 交由学委复核
    flags.push(FLAGS.FACE_NOT_DETECTED);
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
    faceDistance: faceDistance == null ? null : Number(faceDistance.toFixed(4)),
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
