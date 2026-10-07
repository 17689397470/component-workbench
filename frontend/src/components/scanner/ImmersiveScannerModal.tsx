import React, { useEffect, useRef, useState } from 'react';
import { useScannerStore } from '../../store/useScannerStore';
import { useInventoryStore } from '../../store/useInventoryStore';
import { useToastStore } from '../../store/useToastStore';
import { scanApi } from '../../api/scanApi';
import { componentApi } from '../../api/componentApi';
import { playBeep, triggerHaptic } from '../../lib/utils';
import { X, Zap, ZapOff, Camera, Plus, Minus, Check, ChevronRight } from 'lucide-react';
import { createWorker } from 'tesseract.js';

export const ImmersiveScannerModal: React.FC = () => {
  const {
    isOpen,
    closeScanner,
    torchOn,
    toggleTorch,
    scanCount,
    incrementScanCount,
    activeSheet,
    setActiveSheet,
    isLocked,
    setIsLocked,
  } = useScannerStore();

  const { fetchComponents, fetchStats } = useInventoryStore();
  const { showToast } = useToastStore();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [sheetProgress, setSheetProgress] = useState(100);
  const [customQty, setCustomQty] = useState(100);
  const [selectedLocation, setSelectedLocation] = useState('默认电阻盒');
  const timerRef = useRef<any>(null);

  // 启动/停止相机
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    startCamera();

    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err: any) {
      showToast('无法访问相机: ' + err.message, 'error');
      closeScanner();
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    clearAutoSaveTimer();
  };

  // 手电筒切换
  useEffect(() => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track && (track.getCapabilities as any)?.()?.torch) {
      track.applyConstraints({
        advanced: [{ torch: torchOn } as any],
      });
    }
  }, [torchOn]);

  // 处理扫码/OCR成功后的浮窗展示
  const handleScanResolved = (result: any) => {
    playBeep(false);
    triggerHaptic();
    setIsLocked(true);
    setActiveSheet(result);
    setCustomQty(result.data?.quantity || 100);
    setSelectedLocation(result.targetLocation || '默认电阻盒');

    // 开启 3 秒平滑倒计时自动存入
    startAutoSaveTimer(result);
  };

  const clearAutoSaveTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startAutoSaveTimer = (currentResult: any) => {
    clearAutoSaveTimer();
    setSheetProgress(100);
    const totalDuration = 3000;
    const interval = 50;
    const step = (interval / totalDuration) * 100;
    let current = 100;

    timerRef.current = setInterval(() => {
      current -= step;
      if (current <= 0) {
        clearAutoSaveTimer();
        setSheetProgress(0);
        executeSave(currentResult);
      } else {
        setSheetProgress(current);
      }
    }, interval);
  };

  // 拍照进行 OCR 标签识字
  const handleCaptureOcr = async () => {
    if (isOcrProcessing || isLocked || !videoRef.current) return;
    setIsOcrProcessing(true);
    triggerHaptic();

    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('无法创建 Canvas 上下文');

      // 截帧
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // 灰度二值化预处理提升 OCR 精度
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114 > 128) ? 255 : 0;
        d[i] = v;
        d[i + 1] = v;
        d[i + 2] = v;
      }
      ctx.putImageData(imgData, 0, 0);

      // Tesseract OCR 识别
      const worker = await createWorker('eng');
      const ret = await worker.recognize(canvas);
      await worker.terminate();

      const text = ret.data.text;
      if (!text || text.trim().length === 0) {
        showToast('未能识别出清晰文字，请对准标签重新拍', 'warn');
        setIsOcrProcessing(false);
        return;
      }

      // 服务端智能解析
      const resolveRes = await scanApi.resolveScan(text, 'ocr');
      if (resolveRes.success && resolveRes.data) {
        handleScanResolved(resolveRes);
      } else {
        showToast('未识别到立创型号 (C编号)', 'warn');
      }
    } catch (err: any) {
      showToast('OCR 识别异常: ' + err.message, 'error');
    } finally {
      setIsOcrProcessing(false);
    }
  };

  // 立即确认存入
  const executeSave = async (resultToSave = activeSheet) => {
    if (!resultToSave || !resultToSave.data) return;
    clearAutoSaveTimer();

    try {
      const itemData = resultToSave.data;
      if (resultToSave.isExisting && resultToSave.existingItem) {
        // 增量调整
        await componentApi.adjustQuantity(resultToSave.existingItem.id, customQty, '扫码连录入库');
      } else {
        // 创建新物料
        await componentApi.create({
          ...itemData,
          quantity: customQty,
          location: selectedLocation,
        });
      }

      playBeep(true);
      incrementScanCount();
      showToast(`✅ 已存入: ${itemData.name} x${customQty} [${selectedLocation}]`, 'success');
      fetchComponents();
      fetchStats();
    } catch (err: any) {
      showToast('入库失败: ' + err.message, 'error');
    } finally {
      dismissSheet();
    }
  };

  const dismissSheet = () => {
    clearAutoSaveTimer();
    setActiveSheet(null);
    setIsLocked(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col select-none overflow-hidden">
      {/* 视频流 */}
      <video
        ref={videoRef}
        playsInline
        autoPlay
        muted
        className="w-full h-full object-cover"
      />

      {/* 顶部控制栏 */}
      <div className="absolute top-0 inset-x-0 h-16 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between px-5 z-20">
        <button
          type="button"
          onClick={closeScanner}
          className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-md text-white flex items-center justify-center active:scale-95"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-1.5 px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-white text-xs font-semibold">
          <span>📦 已录入</span>
          <span className="text-emerald-400 font-bold font-mono">{scanCount}</span>
          <span>袋</span>
        </div>

        <button
          type="button"
          onClick={toggleTorch}
          className="w-9 h-9 rounded-full bg-white/20 backdrop-blur-md text-white flex items-center justify-center active:scale-95"
        >
          {torchOn ? <Zap className="w-5 h-5 text-amber-400" /> : <ZapOff className="w-5 h-5" />}
        </button>
      </div>

      {/* 居中取景瞄准框 */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
        <div className="relative w-64 h-64 border-2 border-white/50 rounded-2xl overflow-hidden shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
          {/* 四个白角 */}
          <div className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 border-white rounded-tl-xl" />
          <div className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 border-white rounded-tr-xl" />
          <div className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 border-white rounded-bl-xl" />
          <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-white rounded-br-xl" />
          {/* 激光扫描动态线 */}
          <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent animate-pulse top-1/2" />
        </div>
      </div>

      {/* 底部快门拍标签 OCR 按钮 */}
      {!activeSheet && (
        <div className="absolute bottom-8 inset-x-0 flex flex-col items-center gap-2 z-20">
          <button
            type="button"
            disabled={isOcrProcessing || isLocked}
            onClick={handleCaptureOcr}
            className="w-16 h-16 rounded-full border-4 border-white flex items-center justify-center bg-white/20 backdrop-blur-md active:scale-95 transition-all shadow-xl"
            title="拍照识别印字标签"
          >
            <Camera className="w-7 h-7 text-white" />
          </button>
          <span className="text-white/80 text-xs tracking-tight bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm">
            {isOcrProcessing ? '正在 OCR 智能识字中...' : '对准立创标签条形码自动扫 · 无码点快门识字'}
          </span>
        </div>
      )}

      {/* 3 秒自动入库平滑倒计时确认浮窗 */}
      {activeSheet && (
        <div className="absolute bottom-0 inset-x-0 bg-surface/95 backdrop-blur-xl border-t border-border-subtle rounded-t-3xl p-5 z-30 shadow-2xl animate-in slide-in-from-bottom duration-200">
          {/* 横向平滑进度条 */}
          <div className="h-1 bg-subtle rounded-full overflow-hidden mb-3">
            <div
              className="h-full bg-accent transition-all duration-75"
              style={{ width: `${sheetProgress}%` }}
            />
          </div>

          {/* 物料信息卡 */}
          <div className="flex items-center gap-3 mb-4">
            {activeSheet.data?.image_url ? (
              <img
                src={activeSheet.data.image_url}
                alt=""
                className="w-14 h-14 rounded-xl border border-border-subtle object-contain bg-white flex-shrink-0"
              />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-subtle border border-border-subtle flex items-center justify-center text-xl flex-shrink-0">
                📦
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-text-main truncate">
                {activeSheet.data?.name || '未知物料'}
              </div>
              <div className="text-xs text-text-muted mt-0.5 flex items-center gap-2">
                <span>{activeSheet.data?.package || '-'}</span>
                <span>·</span>
                <span>{activeSheet.data?.value || '-'}</span>
                {activeSheet.data?.lcsc_part && (
                  <span className="text-[11px] font-mono text-accent">
                    {activeSheet.data.lcsc_part}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 目标盒位与数量微调 */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div
              onClick={() => {
                const next = prompt('修改目标收纳盒:', selectedLocation);
                if (next && next.trim()) setSelectedLocation(next.trim());
              }}
              className="bg-subtle p-2.5 rounded-xl cursor-pointer hover:bg-surface-hover border border-border-subtle"
            >
              <div className="text-[10px] text-text-dim">🗄️ 目标收纳盒</div>
              <div className="text-xs font-semibold text-text-main flex items-center justify-between mt-0.5">
                <span className="truncate">{selectedLocation}</span>
                <ChevronRight className="w-3.5 h-3.5 text-text-dim" />
              </div>
            </div>

            <div className="bg-subtle p-2.5 rounded-xl border border-border-subtle flex items-center justify-between">
              <div>
                <div className="text-[10px] text-text-dim">入库件数</div>
                <div className="text-base font-bold font-mono text-text-main">{customQty}</div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCustomQty((q) => Math.max(1, q - 10))}
                  className="w-6 h-6 rounded-md bg-surface flex items-center justify-center text-text-muted shadow-sm"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setCustomQty((q) => q + 10)}
                  className="w-6 h-6 rounded-md bg-surface flex items-center justify-center text-text-muted shadow-sm"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={dismissSheet}
              className="px-4 py-2.5 text-xs font-medium text-text-muted bg-subtle hover:bg-surface-hover rounded-xl"
            >
              跳过
            </button>
            <button
              type="button"
              onClick={() => executeSave()}
              className="flex-1 py-2.5 bg-accent text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm active:scale-98"
            >
              <Check className="w-4 h-4" />
              <span>立即存入 (无需等待)</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
