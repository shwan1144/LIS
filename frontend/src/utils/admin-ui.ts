export type AdminDatePreset = 'today' | '7d' | '30d' | 'custom';

export interface StoredAdminDateRange {
  preset: AdminDatePreset;
  start: string;
  end: string;
}

export const ADMIN_SELECTED_LAB_KEY = 'admin.selectedLabId';
export const ADMIN_LAB_SCOPE_EVENT = 'admin-lab-scope-change';
export const ADMIN_DATE_RANGE_KEY = 'admin.globalDateRange';
export const ADMIN_DATE_RANGE_EVENT = 'admin-date-range-change';
