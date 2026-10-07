import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// 播放 880Hz / 1200Hz 纯正 Apple 级扫码成功哔声
export function playBeep(highPitch = false) {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(highPitch ? 1200 : 880, ctx.currentTime);

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (highPitch ? 0.08 : 0.06));

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch (e) {
    // 忽略静音环境
  }
}

// 移动端轻量触觉震动
export function triggerHaptic() {
  if (navigator.vibrate) {
    try {
      navigator.vibrate(35);
    } catch (e) {
      // 忽略不支持
    }
  }
}

// 格式化元器件规格文字
export function formatSpec(item: {
  category?: string;
  value?: string;
  standard_value?: number | null;
  unit?: string;
  voltage?: number | null;
  tolerance?: string;
}) {
  if (item.value) return item.value;
  if (!item.standard_value && !item.voltage && !item.tolerance) return '-';
  const parts: string[] = [];
  if (item.standard_value != null) {
    parts.push(`${item.standard_value}${item.unit || ''}`);
  }
  if (item.voltage != null) {
    parts.push(`${item.voltage}V`);
  }
  if (item.tolerance) {
    parts.push(item.tolerance);
  }
  return parts.join(' ') || '-';
}

// 格式化电容容值
export function formatCapValue(item: { standard_value?: number | null; value?: string }) {
  if (item.value) return item.value;
  if (item.standard_value == null) return '-';
  const val = item.standard_value; // pF 为单位
  if (val >= 1000000) return `${val / 1000000}µF`;
  if (val >= 1000) return `${val / 1000}nF`;
  return `${val}pF`;
}

// 分类对应图标
export function getCategoryIcon(cat?: string) {
  const map: Record<string, string> = {
    '电阻': '⚡',
    '电容': '🔋',
    '芯片': '🔲',
    '二极管': '▲',
    '三极管/MOS': '◈',
    '接插件': '🔌',
    '模块': '📦',
    '电感': '🌀',
  };
  return cat && map[cat] ? map[cat] : '🔹';
}
