import { create } from 'zustand';
import type { PatientDto, OrderDto } from '../api/client';

export interface PatientRow {
  rowId: string;
  patient: PatientDto;
  createdOrder: OrderDto | null;
}

type WorklistByShift = Record<string, PatientRow[]>;

interface OrdersWorklistState {
  worklistByShift: WorklistByShift;
  getList: (shiftId: string | null) => PatientRow[];
  setList: (shiftId: string | null, list: PatientRow[]) => void;
}

const shiftKey = (shiftId: string | null) => shiftId ?? '';

export const useOrdersWorklistStore = create<OrdersWorklistState>((set, get) => ({
  worklistByShift: {},
  getList: (shiftId: string | null) => {
    return get().worklistByShift[shiftKey(shiftId)] ?? [];
  },
  setList: (shiftId: string | null, list: PatientRow[]) => {
    set((state) => ({
      worklistByShift: {
        ...state.worklistByShift,
        [shiftKey(shiftId)]: list,
      },
    }));
  },
}));
