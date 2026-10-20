export const FLAG_LABEL = {
  SESSION_CLOSED: '签到已结束',
  PASSCODE_INVALID: '口令错误或已过期',
  DEVICE_REUSE: '同一设备为他人代签',
  DEVICE_BOUND_OTHER: '该设备曾为其他同学签到（疑似代签）',
  NO_LOCATION: '未获取到定位',
  GEO_OUT_OF_RANGE: '超出教室电子围栏',
  GEO_LOW_ACCURACY: '定位精度过低',
  GEO_MOCK_SUSPECT: '疑似虚拟定位 / 模拟器',
  LIVENESS_FAIL: '活体检测未通过（疑似静态照片）',
  PHOTO_MISSING: '未上传人脸照片',
  PHOTO_REUSED: '照片被复用',
  FACE_MISMATCH: '人脸与本人不符（疑似代签）',
  FACE_NOT_ENROLLED: '未采集人脸底照，需学委复核',
  FACE_NOT_DETECTED: '未识别到人脸特征，需学委复核',
};

export const SOFT_FLAGS = ['GEO_LOW_ACCURACY', 'GEO_MOCK_SUSPECT', 'FACE_NOT_ENROLLED', 'FACE_NOT_DETECTED'];

export const STATUS_LABEL = {
  present: '出勤',
  late: '迟到',
  leave: '请假',
  absent: '缺勤',
  proxy: '代签',
  flagged: '待复核',
  rejected: '已拒绝',
};

// 学委可手动设置的状态（用于请假、迟到、缺勤、代签等人工标记）
export const MANUAL_STATUS_OPTIONS = [
  { value: 'present', label: '出勤' },
  { value: 'late', label: '迟到' },
  { value: 'leave', label: '请假' },
  { value: 'absent', label: '缺勤' },
  { value: 'proxy', label: '代签' },
];
