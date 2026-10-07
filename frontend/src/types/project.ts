export interface ProjectItem {
  id: number;
  name: string;
  description?: string;
  status: 'active' | 'completed' | 'archived';
  lockedCount?: number;
  created_at: string;
  updated_at: string;
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
