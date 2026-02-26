import { createContext, useContext } from 'react';
import { useOrdersWorklistStore, type PatientRow } from '../stores/ordersWorklistStore';

interface OrdersWorklistContextValue {
  getList: (shiftId: string | null) => PatientRow[];
  setList: (shiftId: string | null, list: PatientRow[]) => void;
}

const OrdersWorklistContext = createContext<OrdersWorklistContextValue | null>(null);

export function useOrdersWorklist() {
  const getList = useOrdersWorklistStore((state) => state.getList);
  const setList = useOrdersWorklistStore((state) => state.setList);
  return { getList, setList };
}
