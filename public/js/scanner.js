/**
 * 手机摄像头扫码与音频震动触觉反馈驱动模块 (public/js/scanner.js)
 * 支持原生摄像头流调取、原生 BarcodeDetector 硬件加速解码、
 * 扫码成功发出电子哔声 (880Hz Beep) 与震动反馈。
 */

let videoStream = null;
let scanningInterval = null;
let barcodeDetector = null;

// 初始化 Web Audio API 蜂鸣器 (免任何音频文件依赖)
let audioCtx = null;
function playBeep() {
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
    osc.frequency.setValueAtTime(880, audioCtx.currentTime); // 880Hz 经典扫码哔声
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);

    // 手机短震动
    if (navigator.vibrate) {
      navigator.vibrate(60);
    }
  } catch (e) {
    console.warn('Audio feedback failed:', e);
  }
}

/**
 * 启动摄像头扫码
 */
async function startScanner(onDetectCallback) {
  const container = document.getElementById('scanner-container');
  const video = document.getElementById('scanner-video');

  if (videoStream) {
    stopScanner();
    return;
  }

  try {
    // 检查 BarcodeDetector 支持
    if ('BarcodeDetector' in window) {
      const formats = await BarcodeDetector.getSupportedFormats();
      barcodeDetector = new BarcodeDetector({
        formats: formats.length > 0 ? formats : ['qr_code', 'code_128', 'ean_13', 'data_matrix']
      });
    }

    const constraints = {
      video: {
        facingMode: 'environment', // 优先后置摄像头
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };

    videoStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = videoStream;
    await video.play();
    container.style.display = 'block';

    // 启动帧检测轮询 (每 150ms 扫描一次)
    scanningInterval = setInterval(async () => {
      if (!barcodeDetector || video.readyState < 2) return;
      try {
        const barcodes = await barcodeDetector.detect(video);
        if (barcodes && barcodes.length > 0) {
          const rawValue = barcodes[0].rawValue;
          if (rawValue) {
            playBeep();
            stopScanner();
            if (onDetectCallback) {
              onDetectCallback(rawValue);
            }
          }
        }
      } catch (err) {
        // 忽略单帧识别异常
      }
    }, 150);

  } catch (err) {
    alert(`无法调取摄像头: ${err.message || '请确保在 HTTPS 或局域网环境中，并授予相机权限'}`);
    stopScanner();
  }
}

/**
 * 停止并释放摄像头
 */
function stopScanner() {
  const container = document.getElementById('scanner-container');
  const video = document.getElementById('scanner-video');

  if (scanningInterval) {
    clearInterval(scanningInterval);
    scanningInterval = null;
  }

  if (videoStream) {
    videoStream.getTracks().forEach(track => track.stop());
    videoStream = null;
  }

  if (video) {
    video.srcObject = null;
  }

  if (container) {
    container.style.display = 'none';
  }
}

window.startScanner = startScanner;
window.stopScanner = stopScanner;
window.playBeep = playBeep;
