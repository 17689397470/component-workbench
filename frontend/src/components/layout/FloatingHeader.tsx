import React, { useState } from 'react';
import { useThemeStore } from '../../store/useThemeStore';
import { useInventoryStore } from '../../store/useInventoryStore';
import {
  Package,
  Layers,
  FileSpreadsheet,
  Hammer,
  Plus,
  Sun,
  Moon,
  QrCode,
  Database,
  ShoppingCart,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Modal } from '../ui/Modal';
import QRCode from 'qrcode';

export type ActiveTab = 'boxes' | 'projects' | 'inventory' | 'bom';

interface FloatingHeaderProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
}

export const FloatingHeader: React.FC<FloatingHeaderProps> = ({ activeTab, onTabChange }) => {
  const { theme, toggleTheme } = useThemeStore();
  const { setEntryDrawerOpen, setTaobaoModalOpen, setBackupModalOpen } = useInventoryStore();
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  const openQrModal = async () => {
    try {
      const url = window.location.href;
      const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 220 });
      setQrDataUrl(dataUrl);
      setQrModalOpen(true);
    } catch (e) {
      // 忽略
    }
  };

  const navItems = [
    { key: 'boxes', label: '物理收纳', icon: Layers },
    { key: 'projects', label: '工程与 BOM', icon: Hammer },
    { key: 'inventory', label: '我的库存', icon: Package },
  ] as const;

  return (
    <>
      <header className="sticky top-0 z-40 h-14 bg-surface/85 backdrop-blur-xl border-b border-border-subtle px-4 md:px-6 flex items-center justify-between transition-colors">
        {/* 左侧 Logo */}
        <div
          onClick={() => onTabChange('inventory')}
          className="flex items-center gap-2.5 font-semibold text-[15px] tracking-tight text-text-main cursor-pointer select-none hover:opacity-85 transition-opacity"
        >
          <div className="w-7 h-7 rounded-lg bg-text-main text-surface flex items-center justify-center font-bold text-xs shadow-sm">
            ⚡
          </div>
          <span>元件工坊</span>
        </div>

        {/* 桌面端居中药丸分段导航 (移动端自动隐藏) */}
        <nav className="hidden md:flex items-center bg-subtle p-1 rounded-full border border-border-subtle gap-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onTabChange(item.key)}
                className={cn(
                  'flex items-center gap-1.5 px-3.5 py-1 text-[13px] font-medium rounded-full transition-all duration-200 whitespace-nowrap',
                  isActive
                    ? 'bg-surface text-text-main font-semibold shadow-sm'
                    : 'text-text-muted hover:text-text-main'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* 右侧工具组 */}
        <div className="flex items-center gap-2">
          {/* 导入淘宝订单 */}
          <button
            type="button"
            onClick={() => setTaobaoModalOpen(true)}
            className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-accent bg-accent/5 border border-accent/25 hover:bg-accent/10 px-3 py-1.5 rounded-full transition-colors"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>导入淘宝订单</span>
          </button>

          {/* ＋ 记一笔 主操作按钮 */}
          <button
            type="button"
            onClick={() => setEntryDrawerOpen(true)}
            className="flex items-center gap-1.5 text-xs font-semibold bg-text-main text-surface hover:opacity-90 active:scale-95 px-3.5 py-1.5 rounded-full shadow-sm transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>记一笔</span>
          </button>

          {/* 备份与还原 */}
          <button
            type="button"
            onClick={() => setBackupModalOpen(true)}
            title="数据安全与快照备份中心"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-text-main hover:bg-subtle transition-colors"
          >
            <Database className="w-4 h-4" />
          </button>

          {/* 主题切换 */}
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === 'dark' ? '切换为温润米白纸质' : '切换为深空石墨灰'}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-text-main hover:bg-subtle transition-colors"
          >
            {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>

          {/* 手机扫码访问二维码 */}
          <button
            type="button"
            onClick={openQrModal}
            title="手机扫码在局域网中访问"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-text-main hover:bg-subtle transition-colors"
          >
            <QrCode className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 手机扫码弹窗 */}
      <Modal isOpen={qrModalOpen} onClose={() => setQrModalOpen(false)} title="📱 手机扫码打开" maxWidth="max-w-sm">
        <div className="text-center py-2">
          <p className="text-xs text-text-muted mb-4">
            确保手机连接同一局域网 Wi-Fi，用手机相机扫描下方二维码：
          </p>
          {qrDataUrl && (
            <div className="bg-white p-3 rounded-xl inline-block border border-border-subtle shadow-sm mb-3">
              <img src={qrDataUrl} alt="QR Code" className="w-48 h-48 mx-auto" />
            </div>
          )}
          <p className="text-[11px] text-text-dim break-all px-2 font-mono">
            {window.location.href}
          </p>
        </div>
      </Modal>
    </>
  );
};
