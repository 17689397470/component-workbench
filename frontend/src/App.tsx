import React, { useState } from 'react';
import { FloatingHeader, ActiveTab } from './components/layout/FloatingHeader';
import { MobileBottomNav } from './components/layout/MobileBottomNav';
import { MobileFabScanner } from './components/scanner/MobileFabScanner';
import { ImmersiveScannerModal } from './components/scanner/ImmersiveScannerModal';
import { BackupModal } from './components/backup/BackupModal';
import { TaobaoImportModal } from './components/inventory/TaobaoImportModal';
import { Toast } from './components/ui/Toast';

import { InventoryView } from './views/InventoryView';
import { BomView } from './views/BomView';
import { BoxesView } from './views/BoxesView';
import { ProjectsView } from './views/ProjectsView';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('inventory');

  return (
    <div className="min-h-screen flex flex-col bg-canvas text-text-main pb-20 md:pb-6 transition-colors">
      {/* 桌面端微磨砂浮岛顶栏 */}
      <FloatingHeader activeTab={activeTab} onTabChange={setActiveTab} />

      {/* 主视图渲染 */}
      <main className="flex-1">
        {activeTab === 'inventory' && <InventoryView />}
        {activeTab === 'boxes' && <BoxesView />}
        {activeTab === 'bom' && <BomView />}
        {activeTab === 'projects' && <ProjectsView />}
      </main>

      {/* 移动端原生触感底部导航栏 */}
      <MobileBottomNav activeTab={activeTab} onTabChange={setActiveTab} />

      {/* 移动端右下角悬浮扫码药丸 */}
      <MobileFabScanner />

      {/* 全屏沉浸式扫码与拍标签 OCR 取景器 */}
      <ImmersiveScannerModal />

      {/* 数据安全与备份中心模态框 */}
      <BackupModal />

      {/* 淘宝订单批量导入模态框 */}
      <TaobaoImportModal />

      {/* 全局浮动提示 */}
      <Toast />
    </div>
  );
};
export default App;
