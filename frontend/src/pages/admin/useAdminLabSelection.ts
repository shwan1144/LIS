import { useCallback, useEffect, useState } from 'react';
import type { AdminLabDto } from '../../api/client';
import { ADMIN_LAB_SCOPE_EVENT, ADMIN_SELECTED_LAB_KEY } from '../../utils/admin-ui';
import { loadAdminLabs } from '../../utils/admin-labs-cache';

export function useAdminLabSelection() {
  const [labs, setLabs] = useState<AdminLabDto[]>([]);
  const [selectedLabId, setSelectedLabId] = useState<string | null>(null);
  const [loadingLabs, setLoadingLabs] = useState(false);

  const loadLabs = useCallback(async (force = false) => {
    setLoadingLabs(true);
    try {
      const items = await loadAdminLabs({ force });
      setLabs(items);
      if (items.length === 0) {
        setSelectedLabId(null);
        localStorage.removeItem(ADMIN_SELECTED_LAB_KEY);
        window.dispatchEvent(new CustomEvent(ADMIN_LAB_SCOPE_EVENT, { detail: { labId: null } }));
        return;
      }
      const stored = localStorage.getItem(ADMIN_SELECTED_LAB_KEY);
      const fallback = items[0].id;
      const next = stored && items.some((lab) => lab.id === stored) ? stored : fallback;
      setSelectedLabId(next);
      localStorage.setItem(ADMIN_SELECTED_LAB_KEY, next);
      window.dispatchEvent(new CustomEvent(ADMIN_LAB_SCOPE_EVENT, { detail: { labId: next } }));
    } finally {
      setLoadingLabs(false);
    }
  }, []);

  useEffect(() => {
    void loadLabs();
  }, [loadLabs]);

  const selectLab = useCallback((labId: string) => {
    setSelectedLabId(labId);
    localStorage.setItem(ADMIN_SELECTED_LAB_KEY, labId);
    window.dispatchEvent(new CustomEvent(ADMIN_LAB_SCOPE_EVENT, { detail: { labId } }));
  }, []);

  const selectedLab = labs.find((lab) => lab.id === selectedLabId) ?? null;

  return {
    labs,
    selectedLab,
    selectedLabId,
    loadingLabs,
    selectLab,
    reloadLabs: (force = false) => loadLabs(force),
  };
}
