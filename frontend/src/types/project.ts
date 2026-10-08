export interface ProjectItem {
  id: number;
  name: string;
  description?: string;
  target_qty?: number;
  status: 'PREPARING' | 'READY' | 'BUILDING' | 'COMPLETED' | 'active' | 'completed' | 'archived';
  bom_filename?: string;
  lockedCount?: number;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  // 详情聚合字段
  total_items_count?: number;
  ready_items_count?: number;
  shortage_items_count?: number;
  readinessPercent?: number;
  totalPiecesDemand?: number;
  totalPiecesLocked?: number;
}

export interface ProjectItemDetail {
  id: number;
  project_id: number;
  component_id?: number | null;
  part_name: string;
  package: string;
  unit_demand_qty: number;
  total_demand_qty: number;
  locked_qty: number;
  designators?: string;
  status: 'READY' | 'PARTIAL' | 'SHORTAGE';
  // 关联库存字段
  comp_name?: string;
  comp_category?: string;
  comp_package?: string;
  comp_location?: string;
  comp_lcsc?: string;
  comp_total_stock?: number;
  other_locked_qty?: number;
  available_for_this?: number;
  shortage_qty?: number;
  is_ready?: boolean;
}

export interface ProjectDetail extends ProjectItem {
  items: ProjectItemDetail[];
}

export interface LockedComponent {
  id: number;
  component_id: number;
  project_id: number;
  name: string;
  package?: string;
  value?: string;
  locked_quantity: number;
  location: string;
}
