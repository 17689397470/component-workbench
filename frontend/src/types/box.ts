export interface StorageBox {
  name: string;
  totalTypes: number;
  totalPieces: number;
  lowStockTypes: number;
  topCategories: string[];
}

export interface BoxComponentDetail {
  id: number;
  name: string;
  category: string;
  package?: string;
  value?: string;
  quantity: number;
  lcsc_part?: string;
  notes?: string;
}
