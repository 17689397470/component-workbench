/**
 * 手机沉浸式摄像头扫码、防重扫、快门截帧与 OCR 文字识别驱动 (public/js/scanner.js)
 * 支持：
 * - 880Hz 经典扫码哔声与触觉震动反馈
 * - 原生 BarcodeDetector 硬件加速解码 (QR码、Code128、EAN13)
 * - 立创/嘉立创物料袋二维码专属协议解析 (LCSC QR Protocol)
 * - 3.5 秒防重扫锁定保护 (连扫防误触)
 * - 取景框高清截帧与图像二值化增强 (提升热敏标签识别率)
 * - Tesseract.js 客户端免依赖 OCR 识字
 */

let videoStream = null;
let scanningInterval = null;
let barcodeDetector = null;
let isScanLocked = false;
let lastScannedText = '';
let lastScannedTime = 0;
let ocrWorker = null;
let isOcrLoading = false;

// 1. Web Audio API 蜂鸣器 (880Hz Beep) 与触觉震动
let audioCtx = null;
function playBeep(isSuccess = true) {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    const freq = isSuccess ? 880 : 440; // 成功 880Hz, 提示 440Hz
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.12);

    if (navigator.vibrate) {
      navigator.vibrate(isSuccess ? 60 : [40, 40, 40]);
    }
  } catch (e) {
    console.warn('Audio feedback failed:', e);
  }
}

/**
 * 2. 立创/嘉立创物料袋专属条码解析器 (LCSC Protocol)
 */
function parseLcscRawCode(raw) {
  if (!raw || typeof raw !== 'string') return { lcsc_part: null, quantity: null, cleanText: '' };
  const text = raw.trim();

  // 场景 A: JSON 字符串 (如 {"pc":"C2057","qty":100})
  if (text.startsWith('{') && text.endsWith('}')) {
    try {
      const obj = JSON.parse(text);
      const pc = obj.pc || obj.productCode || obj.c_part || obj.part_no || null;
      const qty = parseInt(obj.qty || obj.quantity || obj.number || obj.count, 10) || null;
      if (pc) {
        return { lcsc_part: String(pc).toUpperCase(), quantity: qty, cleanText: `${pc} QTY:${qty || ''}` };
      }
    } catch (e) {}
  }

  // 场景 B: 立创官方 URL (https://item.szlcsc.com/2057.html)
  const urlMatch = text.match(/szlcsc\.com\/(?:product\/details_|)?(\d+)\.html/i);
  if (urlMatch) {
    const lcscId = `C${urlMatch[1]}`;
    return { lcsc_part: lcscId, quantity: null, cleanText: lcscId };
  }

  // 场景 C: 包含立创 C编号 (C2057)
  const cMatch = text.match(/\b(C\d{3,8})\b/i);
  const lcscPart = cMatch ? cMatch[1].toUpperCase() : null;

  // 提取数量
  let qty = null;
  const qm = text.match(/(?:qty|数量|pcs|只|片|个|x|数量:)\s*[:：=\s]*(\d+)/i) || text.match(/\b(\d+)\s*(?:只|片|个|pcs)\b/i);
  if (qm) {
    const parsedQ = parseInt(qm[1], 10);
    if (!isNaN(parsedQ) && parsedQ > 0) qty = parsedQ;
  }

  return {
    lcsc_part: lcscPart,
    quantity: qty,
    cleanText: lcscPart ? `${lcscPart} ${qty ? 'QTY:' + qty : ''}`.trim() : text
  };
}

/**
 * 3. 启动摄像头视频流
 * @param {HTMLVideoElement} videoElement
 * @param {Function} onCodeDetected
 */
async function startImmersiveCamera(videoElement, onCodeDetected) {
  if (videoStream) {
    stopImmersiveCamera();
  }

  // 初始化 BarcodeDetector
  if ('BarcodeDetector' in window) {
    try {
      const formats = await BarcodeDetector.getSupportedFormats();
      barcodeDetector = new BarcodeDetector({
        formats: formats.length > 0 ? formats : ['qr_code', 'code_128', 'ean_13', 'data_matrix']
      });
    } catch (e) {
      barcodeDetector = null;
    }
  }

  const constraints = {
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1920, min: 1280 },
      height: { ideal: 1080, min: 720 }
    }
  };

  try {
    videoStream = await navigator.mediaDevices.getUserMedia(constraints);
    videoElement.srcObject = videoStream;
    await videoElement.play();

    // 启动帧检测轮询 (每 180ms 检测一次)
    scanningInterval = setInterval(async () => {
      if (!barcodeDetector || videoElement.readyState < 2) return;
      if (isScanLocked) return; // 处于锁定/倒计时状态时暂停主动识别

      try {
        const barcodes = await barcodeDetector.detect(videoElement);
        if (barcodes && barcodes.length > 0) {
          const rawValue = (barcodes[0].rawValue || '').trim();
          if (!rawValue) return;

          const now = Date.now();
          // 3.5秒防重扫锁定
          if (rawValue === lastScannedText && (now - lastScannedTime) < 3500) {
            return;
          }

          lastScannedText = rawValue;
          lastScannedTime = now;
          isScanLocked = true; // 锁定镜头触发

          playBeep(true);

          if (onCodeDetected) {
            onCodeDetected(rawValue, 'qrcode');
          }
        }
      } catch (err) {
        // 忽略单帧异常
      }
    }, 180);

    return true;
  } catch (err) {
    console.error('Camera access failed:', err);
    throw err;
  }
}

/**
 * 4. 释放防重扫锁定 (由上层浮窗存入完成或重置后调用)
 */
function unlockScanner() {
  isScanLocked = false;
  // 重置最近扫描标记，允许扫下一个袋子
  setTimeout(() => {
    lastScannedText = '';
  }, 1000);
}

/**
 * 5. 停止并释放摄像头
 */
function stopImmersiveCamera() {
  if (scanningInterval) {
    clearInterval(scanningInterval);
    scanningInterval = null;
  }
  if (videoStream) {
    videoStream.getTracks().forEach(track => track.stop());
    videoStream = null;
  }
  isScanLocked = false;
}

/**
 * 6. 开关闪光灯 (Torch)
 */
async function toggleTorch(enabled) {
  if (!videoStream) return false;
  const track = videoStream.getVideoTracks()[0];
  if (!track) return false;
  const capabilities = track.getCapabilities ? track.getCapabilities() : {};
  if (!capabilities.torch) return false;

  try {
    await track.applyConstraints({
      advanced: [{ torch: !!enabled }]
    });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 7. 实时截帧快门与图像二值化增强 (提升热敏标签文字对比度)
 * @param {HTMLVideoElement} videoElement
 * @returns {string} base64 DataURL
 */
function captureEnhancedFrame(videoElement) {
  if (!videoElement || videoElement.videoWidth === 0) return null;

  const vw = videoElement.videoWidth;
  const vh = videoElement.videoHeight;

  // 截取中央 70% 瞄准区域，排除外围无关背景
  const cropW = Math.floor(vw * 0.72);
  const cropH = Math.floor(vh * 0.55);
  const cropX = Math.floor((vw - cropW) / 2);
  const cropY = Math.floor((vh - cropH) / 2);

  const canvas = document.createElement('canvas');
  canvas.width = cropW;
  canvas.height = cropH;
  const ctx = canvas.getContext('2d');

  // 绘制裁剪区域
  ctx.drawImage(videoElement, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  // 图像二值化与对比度增强
  try {
    const imgData = ctx.getImageData(0, 0, cropW, cropH);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      // 灰度化: ITU-R BT.601
      const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      // 阈值增强: 白纸黑字对比拉开 (让淡灰色打印字变深黑，背景变纯白)
      const enhanced = gray > 145 ? 255 : (gray < 85 ? 0 : (gray - 85) * 4);
      d[i] = enhanced;
      d[i + 1] = enhanced;
      d[i + 2] = enhanced;
    }
    ctx.putImageData(imgData, 0, 0);
  } catch (e) {
    // 跨域或安全限制时退回原始图
  }

  return canvas.toDataURL('image/jpeg', 0.85);
}

/**
 * 8. 轻量 OCR 文本提取引擎 (结合 Tesseract.js / 本地回退)
 * @param {string} imageBase64 - 截取的增强图像
 * @param {Function} onProgress - 进度回调
 */
async function recognizeLabelText(imageBase64, onProgress) {
  // 确保 Tesseract.js 已载入
  if (typeof Tesseract === 'undefined') {
    if (onProgress) onProgress('正在载入轻量 OCR 引擎...');
    await loadTesseractScript();
  }

  if (onProgress) onProgress('正在分析标签印刷文字...');

  try {
    const result = await Tesseract.recognize(
      imageBase64,
      'chi_sim+eng', // 简体中文 + 英文数字
      {
        logger: (m) => {
          if (m.status === 'recognizing text' && onProgress) {
            onProgress(`正在识字: ${Math.round((m.progress || 0) * 100)}%`);
          }
        }
      }
    );

    const fullText = (result && result.data && result.data.text) ? result.data.text.trim() : '';
    // 过滤换行与多余空格
    const cleanText = fullText.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');
    return cleanText;
  } catch (err) {
    console.error('OCR Recognition error:', err);
    throw new Error('OCR 识字失败: ' + err.message);
  }
}

/**
 * 动态引入 Tesseract.js 脚本 (CDN 异步加载)
 */
function loadTesseractScript() {
  return new Promise((resolve, reject) => {
    if (typeof Tesseract !== 'undefined') return resolve();
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('无法载入 OCR 引擎脚本，请检查网络连接'));
    document.head.appendChild(script);
  });
}

// 导出全局接口
window.startImmersiveCamera = startImmersiveCamera;
window.stopImmersiveCamera = stopImmersiveCamera;
window.unlockScanner = unlockScanner;
window.toggleTorch = toggleTorch;
window.captureEnhancedFrame = captureEnhancedFrame;
window.recognizeLabelText = recognizeLabelText;
window.parseLcscRawCode = parseLcscRawCode;
window.playBeep = playBeep;
