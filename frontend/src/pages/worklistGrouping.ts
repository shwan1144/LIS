import type { WorklistItem } from '../api/client';

export interface WorklistOrderGroupSummary {
  groupId: string;
  groupKind: 'single' | 'culture' | 'panel';
  panelRootId?: string;
  label: string;
  testsCount: number;
  pending: number;
  completed: number;
  verified: number;
  rejected: number;
  isFullyEntered: boolean;
  completedTargetIds: string[];
  items: WorklistItem[];
}

function sortByOrder(a: WorklistItem, b: WorklistItem): number {
  const aPanelOrder = a.panelSortOrder ?? Number.MAX_SAFE_INTEGER;
  const bPanelOrder = b.panelSortOrder ?? Number.MAX_SAFE_INTEGER;
  if (aPanelOrder !== bPanelOrder) return aPanelOrder - bPanelOrder;
  const aSortOrder = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
  const bSortOrder = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
  if (aSortOrder !== bSortOrder) return aSortOrder - bSortOrder;
  return a.testCode.localeCompare(b.testCode);
}

function buildGroupCounters(actionableItems: WorklistItem[]) {
  const pending = actionableItems.filter(
    (item) => item.status === 'PENDING' || item.status === 'IN_PROGRESS',
  ).length;
  const completed = actionableItems.filter((item) => item.status === 'COMPLETED').length;
  const verified = actionableItems.filter((item) => item.status === 'VERIFIED').length;
  const rejected = actionableItems.filter((item) => item.status === 'REJECTED').length;
  const completedTargetIds = actionableItems
    .filter((item) => item.status === 'COMPLETED')
    .map((item) => item.id);

  return {
    pending,
    completed,
    verified,
    rejected,
    completedTargetIds,
    isFullyEntered: actionableItems.length > 0 && pending === 0 && rejected === 0,
  };
}

export function buildWorklistOrderGroups(items: WorklistItem[]): WorklistOrderGroupSummary[] {
  const roots = items.filter((item) => !item.parentOrderTestId).sort(sortByOrder);
  const singleRoots = roots.filter(
    (item) =>
      item.testType !== 'PANEL' && item.resultEntryType !== 'CULTURE_SENSITIVITY',
  );
  const cultureRoots = roots.filter(
    (item) =>
      item.testType !== 'PANEL' && item.resultEntryType === 'CULTURE_SENSITIVITY',
  );
  const panelRoots = roots.filter((item) => item.testType === 'PANEL');

  const childrenByParent = new Map<string, WorklistItem[]>();
  for (const item of items) {
    if (!item.parentOrderTestId) continue;
    const list = childrenByParent.get(item.parentOrderTestId) ?? [];
    list.push(item);
    childrenByParent.set(item.parentOrderTestId, list);
  }
  for (const list of childrenByParent.values()) {
    list.sort(sortByOrder);
  }

  const groups: WorklistOrderGroupSummary[] = [];

  if (singleRoots.length > 0) {
    const counters = buildGroupCounters(singleRoots);
    groups.push({
      groupId: 'single',
      groupKind: 'single',
      label: `Single tests (${singleRoots.length})`,
      testsCount: singleRoots.length,
      pending: counters.pending,
      completed: counters.completed,
      verified: counters.verified,
      rejected: counters.rejected,
      isFullyEntered: counters.isFullyEntered,
      completedTargetIds: counters.completedTargetIds,
      items: singleRoots,
    });
  }

  if (cultureRoots.length > 0) {
    const counters = buildGroupCounters(cultureRoots);
    groups.push({
      groupId: 'culture',
      groupKind: 'culture',
      label: `Culture tests (${cultureRoots.length})`,
      testsCount: cultureRoots.length,
      pending: counters.pending,
      completed: counters.completed,
      verified: counters.verified,
      rejected: counters.rejected,
      isFullyEntered: counters.isFullyEntered,
      completedTargetIds: counters.completedTargetIds,
      items: cultureRoots,
    });
  }

  for (const panelRoot of panelRoots) {
    const children = childrenByParent.get(panelRoot.id) ?? [];
    const nonPanelChildren = children.filter((item) => item.testType !== 'PANEL');
    const actionableItems = nonPanelChildren;
    const counters = buildGroupCounters(actionableItems);
    const testsCount =
      nonPanelChildren.length > 0 ? nonPanelChildren.length : actionableItems.length;
    groups.push({
      groupId: `panel:${panelRoot.id}`,
      groupKind: 'panel',
      panelRootId: panelRoot.id,
      label: `Panel: ${panelRoot.testName} (${testsCount})`,
      testsCount,
      pending: counters.pending,
      completed: counters.completed,
      verified: counters.verified,
      rejected: counters.rejected,
      isFullyEntered: counters.isFullyEntered,
      completedTargetIds: counters.completedTargetIds,
      items: [panelRoot, ...children],
    });
  }

  return groups;
}
