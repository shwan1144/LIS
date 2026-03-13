import type { WorklistItem } from '../../api/client';
import type { WorklistOrderGroupSummary } from '../../pages/worklistGrouping';

export interface ResultEntryRowModel {
  target: WorklistItem;
  isReadOnly: boolean;
  isCultureEntry: boolean;
  hasParameters: boolean;
}

export interface ResultEntrySection {
  id: string;
  kind: 'single' | 'panel' | 'culture';
  title: string;
  subtitle: string;
  panelRoot: WorklistItem | null;
  rows: ResultEntryRowModel[];
}

function buildRowModel(
  item: WorklistItem,
  canAdminEditVerified: boolean,
): ResultEntryRowModel {
  return {
    target: item,
    isReadOnly:
      item.testType === 'PANEL' ||
      (item.status === 'VERIFIED' && !canAdminEditVerified),
    isCultureEntry: item.resultEntryType === 'CULTURE_SENSITIVITY',
    hasParameters: (item.parameterDefinitions?.length ?? 0) > 0,
  };
}

export function buildResultEntrySections(
  group: WorklistOrderGroupSummary | null,
  orderedItems: WorklistItem[],
  canAdminEditVerified: boolean,
): ResultEntrySection[] {
  if (!group || orderedItems.length === 0) {
    return [];
  }

  if (group.groupKind === 'panel') {
    const panelRoot =
      orderedItems.find(
        (item) => item.testType === 'PANEL' && !item.parentOrderTestId,
      ) ?? null;
    const rows = orderedItems
      .filter((item) => item.id !== panelRoot?.id)
      .map((item) => buildRowModel(item, canAdminEditVerified));

    return [
      {
        id: group.groupId,
        kind: 'panel',
        title: panelRoot?.testName ?? group.label,
        subtitle: `${rows.length} component test${rows.length === 1 ? '' : 's'}`,
        panelRoot,
        rows,
      },
    ];
  }

  const rows = orderedItems.map((item) => buildRowModel(item, canAdminEditVerified));
  const title = group.groupKind === 'culture' ? 'Culture Tests' : 'Single Tests';
  const subtitle = `${rows.length} test${rows.length === 1 ? '' : 's'}`;

  return [
    {
      id: group.groupId,
      kind: group.groupKind,
      title,
      subtitle,
      panelRoot: null,
      rows,
    },
  ];
}
