// 地理围栏计算：Haversine 距离（米）
export function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// 粗略判断：两点是否完全一致（配合 accuracy<=0 作为疑似虚拟定位信号）
export function isSamePoint(a, b) {
  return !!a && !!b && a.lat === b.lat && a.lng === b.lng;
}
