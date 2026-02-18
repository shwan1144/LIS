import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import type { PatientDto, OrderDto } from '../api/client';

export interface PatientRow {
  rowId: string;
  patient: PatientDto;
  createdOrder: OrderDto | null;
}

type WorklistByShift = Record<string, PatientRow[]>;

interface OrdersWorklistContextValue {
  getList: (shiftId: string | null) => PatientRow[];
  setList: (shiftId: string | null, list: PatientRow[]) => void;
}

const OrdersWorklistContext = createContext<OrdersWorklistContextValue | null>(null);

export function OrdersWorklistProvider({ children }: { children: ReactNode }) {
  const [worklistByShift, setWorklistByShift] = useState<WorklistByShift>({});

  const shiftKey = (shiftId: string | null) => shiftId ?? '';

  const getList = useCallback(
    (shiftId: string | null) => worklistByShift[shiftKey(shiftId)] ?? [],
    [worklistByShift]
  );

  const setList = useCallback((shiftId: string | null, list: PatientRow[]) => {
    setWorklistByShift((prev) => ({ ...prev, [shiftKey(shiftId)]: list }));
  }, []);

  return (
    <OrdersWorklistContext.Provider value={{ getList, setList }}>
      {children}
    </OrdersWorklistContext.Provider>
  );
}

export function useOrdersWorklist() {
  const ctx = useContext(OrdersWorklistContext);
  if (!ctx) return null;
  return ctx;
}
