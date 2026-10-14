export const FLAG_LABEL = {
  SESSION_CLOSED: '签到已结束',
  ALREADY_CHECKED: '已签到，重复提交',
  PASSCODE_INVALID: '口令错误或已过期',
  DEVICE_REUSE: '同一设备为他人代签',
  NO_LOCATION: '未获取到定位',
  GEO_OUT_OF_RANGE: '超出教室电子围栏',
  GEO_LOW_ACCURACY: '定位精度过低',
  GEO_MOCK_SUSPECT: '疑似虚拟定位 / 模拟器',
  LIVENESS_FAIL: '活体检测未通过（疑似静态照片）',
  PHOTO_MISSING: '未上传人脸照片',
  PHOTO_REUSED: '照片被复用',
};

export const SOFT_FLAGS = ['GEO_LOW_ACCURACY', 'GEO_MOCK_SUSPECT'];

export const STATUS_LABEL = {
  present: '已签到',
  flagged: '待复核',
  rejected: '已拒绝',
  absent: '未签到',
};
