// 人脸特征提取：浏览器端本地推理（@vladmandic/face-api），照片不经任何第三方服务器上传。
// 模型与脚本从 CDN 按需加载；加载失败时返回 false，签到流程自动降级为「交学委人工复核」。
const FACE_API_VERSION = '1.7.15';
const FACE_API_URL = `https://cdn.jsdelivr.net/npm/@vladmandic/face-api@${FACE_API_VERSION}/dist/face-api.esm.js`;
const MODEL_URL = `https://cdn.jsdelivr.net/npm/@vladmandic/face-api@${FACE_API_VERSION}/model`;

let modelPromise = null;

// 预加载人脸模型：成功返回 true，失败返回 false（不抛出，便于调用方降级）
export async function ensureFaceModels() {
  if (!modelPromise) {
    modelPromise = (async () => {
      const mod = await import(/* @vite-ignore */ FACE_API_URL);
      const faceapi = mod.default || mod;
      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
      await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
      await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
      return faceapi;
    })();
    modelPromise.catch(() => {
      modelPromise = null;
    });
  }
  try {
    await modelPromise;
    return true;
  } catch {
    return false;
  }
}

function toImage(input) {
  if (typeof HTMLImageElement !== 'undefined' && input instanceof HTMLImageElement) {
    return Promise.resolve(input);
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('照片解码失败，请重拍'));
    img.src = input;
  });
}

// 提取 128 维人脸特征向量；要求画面中「恰好一张」清晰人脸
export async function extractDescriptor(input) {
  const ok = await ensureFaceModels();
  if (!ok) throw new Error('人脸识别组件加载失败');
  const faceapi = await modelPromise;
  const img = await toImage(input);
  const res = await faceapi
    .detectAllFaces(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptors();
  if (!res || res.length === 0) throw new Error('未检测到人脸，请正对镜头、光线充足后重拍');
  if (res.length > 1) throw new Error('画面中出现多张人脸，请确保只有你一人入镜');
  return Array.from(res[0].descriptor);
}
