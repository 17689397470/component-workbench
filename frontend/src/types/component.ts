export type ComponentCategory =
  | '电阻'
  | '电容'
  | '芯片'
  | '二极管'
  | '三极管/MOS'
  | '接插件'
  | '模块'
  | '电感'
  | '其他';

export interface ComponentItem {
  id: number;
  name: string;
  category: ComponentCategory | string;
  package?: string;
  value?: string;
  standard_value?: number | null;
  unit?: string;
  voltage?: number | null;
  tolerance?: string;
  quantity: number;
  location: string;
  lcsc_part?: string;
  manufacturer?: string | null;
  image_url?: string | null;
  datasheet_url?: string | null;
  tags?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  min_stock?: number | null;
  effective_min_stock?: number;
  is_low_stock?: number;
  locked_quantity?: number;
  available_quantity?: number;
}

export type ViewMode = 'table' | 'grid';
export type GridDensity = 'single' | 'double';

export interface InventoryStats {
  totalTypes: number;
  totalPieces: number;
  boxesCount: number;
  lowStockCount: number;
  categoryDistribution: { category: string; count: number; percentage: number }[];
}

export interface ComponentSubstituteItem extends ComponentItem {
  rule_id?: number;
  rule_note?: string;
  pinned_at?: string;
  match_reasons?: string[];
}

export interface SubstitutesResponse {
  pinned: ComponentSubstituteItem[];
  auto: ComponentSubstituteItem[];
}

export interface ProjectAllocationItem {
  item_id: number;
  project_id: number;
  part_name: string;
  package: string;
  unit_demand_qty: number;
  total_demand_qty: number;
  locked_qty: number;
  item_status: string;
  designators?: string;
  project_name: string;
  project_status: string;
  project_desc?: string;
  target_qty: number;
  project_created_at: string;
}

export interface StockLogItem {
  id: number;
  component_id: number;
  component_name: string;
  change_qty: number;
  balance_qty: number;
  action_type: string;
  note: string;
  created_at: string;
}

