import { useCallback, useEffect, useMemo, useState, type Key } from 'react';
import {
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import {
  downloadResultDocument,
  getAntibiotics,
  getDepartments,
  getWorklistOrderTests,
  getWorklistOrders,
  getWorklistStats,
  rejectResult,
  verifyMultipleResults,
  type AntibioticDto,
  type DepartmentDto,
  type VerificationRowStatusFilter,
  type WorklistItem,
  type WorklistOrderModalDto,
  type WorklistOrderSummaryDto,
  type WorklistStats,
} from '../api/client';
import { CultureSensitivityEditor } from '../components/CultureSensitivityEditor';
import { WorklistStatusDashboard } from '../components/WorklistStatusDashboard';
import { useFillToViewportBottom } from '../hooks/useFillToViewportBottom';
import {
  buildWorklistOrderGroups,
  type WorklistOrderGroupSummary,
} from './worklistGrouping';
import { useTheme } from '../contexts/ThemeContext';
import {
  buildCultureAntibioticOptions,
  formatCultureResultSummary,
  normalizeCultureResultForForm,
} from '../utils/culture-sensitivity';
import {
  RESULT_FLAG_COLOR as FLAG_COLOR,
  RESULT_FLAG_LABEL as FLAG_LABEL,
} from '../utils/result-flag';
import './QueuePages.css';

const { Title, Text } = Typography;

const STATUS_COLOR: Record<WorklistItem['status'], string> = {
  PENDING: 'default',
  IN_PROGRESS: 'processing',
  COMPLETED: 'warning',
  VERIFIED: 'success',
  REJECTED: 'error',
};

interface GroupedOrderCache {
  order: WorklistOrderModalDto;
  groups: WorklistOrderGroupSummary[];
  appliedDepartmentId: string | null;
}

function formatResult(item: WorklistItem): string {
  if (item.resultDocument?.fileName) {
    return 'External PDF attached';
  }
  const cultureSummary = formatCultureResultSummary(item.cultureResult);
  if (cultureSummary) {
    return cultureSummary;
  }
  if (item.resultValue !== null && item.resultValue !== undefined) {
    return `${item.resultValue}${item.testUnit ? ` ${item.testUnit}` : ''}`;
  }
  if (item.resultText?.trim()) {
    return item.resultText.trim();
  }
  if (item.resultParameters && Object.keys(item.resultParameters).length > 0) {
    return Object.entries(item.resultParameters)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
  }
  return '-';
}

function openBlobInNewTab(blob: Blob): void {
  const objectUrl = URL.createObjectURL(blob);
  const popup = window.open(objectUrl, '_blank', 'noopener');
  if (!popup) {
    URL.revokeObjectURL(objectUrl);
    throw new Error('Popup blocked');
  }
  const revoke = () => URL.revokeObjectURL(objectUrl);
  popup.addEventListener('beforeunload', revoke, { once: true });
  window.setTimeout(revoke, 60_000);
}

function downloadBlob(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

function formatReferenceRange(item: WorklistItem): string {
  if (item.normalText && item.normalText.length > 0) return item.normalText;
  if (item.normalMin != null || item.normalMax != null) {
    return `${item.normalMin ?? '-'} - ${item.normalMax ?? '-'}${item.testUnit ? ` ${item.testUnit}` : ''}`;
  }
  return '-';
}

function sortModalItems(items: WorklistItem[]): WorklistItem[] {
  const roots = items.filter((item) => !item.parentOrderTestId);
  const rootIds = new Set(roots.map((item) => item.id));
  const children = items.filter((item) => Boolean(item.parentOrderTestId));

  const sortByOrder = (a: WorklistItem, b: WorklistItem) => {
    const aPanelOrder = a.panelSortOrder ?? Number.MAX_SAFE_INTEGER;
    const bPanelOrder = b.panelSortOrder ?? Number.MAX_SAFE_INTEGER;
    if (aPanelOrder !== bPanelOrder) return aPanelOrder - bPanelOrder;
    const aSortOrder = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const bSortOrder = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
    if (aSortOrder !== bSortOrder) return aSortOrder - bSortOrder;
    return a.testCode.localeCompare(b.testCode);
  };

  const singleRoots = roots.filter((item) => item.testType !== 'PANEL').sort(sortByOrder);
  const panelRoots = roots.filter((item) => item.testType === 'PANEL').sort(sortByOrder);

  const childrenByParent = new Map<string, WorklistItem[]>();
  for (const child of children) {
    const parentId = child.parentOrderTestId;
    if (!parentId) continue;
    const list = childrenByParent.get(parentId) ?? [];
    list.push(child);
    childrenByParent.set(parentId, list);
  }
  for (const list of childrenByParent.values()) {
    list.sort(sortByOrder);
  }

  const ordered: WorklistItem[] = [...singleRoots];
  for (const panelRoot of panelRoots) {
    ordered.push(panelRoot);
    ordered.push(...(childrenByParent.get(panelRoot.id) ?? []));
  }

  const orphanChildren = children
    .filter((item) => !rootIds.has(item.parentOrderTestId ?? ''))
    .sort(sortByOrder);
  ordered.push(...orphanChildren);

  return ordered;
}

function collectCompletedIds(items: WorklistItem[]): string[] {
  return items
    .filter((item) => item.testType !== 'PANEL' && item.status === 'COMPLETED')
    .map((item) => item.id);
}

function resolveGroupByIdentity(
  groups: WorklistOrderGroupSummary[],
  currentGroup: WorklistOrderGroupSummary | null,
): WorklistOrderGroupSummary | null {
  if (groups.length === 0) return null;
  if (!currentGroup) return groups[0] ?? null;
  if (currentGroup.groupKind === 'single' || currentGroup.groupKind === 'culture') {
    return (
      groups.find((group) => group.groupKind === currentGroup.groupKind) ?? null
    );
  }
  if (currentGroup.panelRootId) {
    return (
      groups.find(
        (group) =>
          group.groupKind === 'panel' &&
          group.panelRootId === currentGroup.panelRootId,
      ) ?? null
    );
  }
  return groups.find((group) => group.groupId === currentGroup.groupId) ?? null;
}

function buildHiddenWorklistReviewMessage(groups: WorklistOrderGroupSummary[]): string | null {
  const pendingGroups = groups.filter((group) => !group.isFullyEntered && group.pending > 0);
  const rejectedGroups = groups.filter((group) => !group.isFullyEntered && group.rejected > 0);
  const messages: string[] = [];

  if (pendingGroups.length > 0) {
    const totalPendingChildren = pendingGroups.reduce((sum, group) => sum + group.pending, 0);
    if (pendingGroups.length === 1) {
      messages.push(
        totalPendingChildren === 1
          ? '1 group is still hidden because it has 1 pending child test in Worklist.'
          : `1 group is still hidden because it has ${totalPendingChildren} pending child tests in Worklist.`,
      );
    } else {
      messages.push(
        totalPendingChildren === 1
          ? `${pendingGroups.length} groups are still hidden because they have 1 pending child test in Worklist.`
          : `${pendingGroups.length} groups are still hidden because they have ${totalPendingChildren} pending child tests in Worklist.`,
      );
    }
  }

  if (rejectedGroups.length > 0) {
    const totalRejectedTests = rejectedGroups.reduce((sum, group) => sum + group.rejected, 0);
    if (rejectedGroups.length === 1) {
      messages.push(
        totalRejectedTests === 1
          ? '1 group was returned to Worklist because it has 1 rejected test that must be reviewed again.'
          : `1 group was returned to Worklist because it has ${totalRejectedTests} rejected tests that must be reviewed again.`,
      );
    } else {
      messages.push(
        totalRejectedTests === 1
          ? `${rejectedGroups.length} groups were returned to Worklist because they have 1 rejected test that must be reviewed again.`
          : `${rejectedGroups.length} groups were returned to Worklist because they have ${totalRejectedTests} rejected tests that must be reviewed again.`,
      );
    }
  }

  return messages.length > 0 ? messages.join(' ') : null;
}

export function VerificationPage() {
  const isDark = useTheme().theme === 'dark';
  const { containerRef, filledMinHeightPx } = useFillToViewportBottom();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<WorklistOrderSummaryDto[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<WorklistStats | null>(null);

  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<dayjs.Dayjs | null>(dayjs());
  const [departmentId, setDepartmentId] = useState<string | ''>('');
  const [departments, setDepartments] = useState<DepartmentDto[]>([]);
  const [antibiotics, setAntibiotics] = useState<AntibioticDto[]>([]);
  const [page, setPage] = useState(1);
  const [size] = useState(25);
  const [verificationStatusFilter, setVerificationStatusFilter] =
    useState<VerificationRowStatusFilter>('unverified');
  const [reviewForm] = Form.useForm<any>();

  const [expandedOrderKeys, setExpandedOrderKeys] = useState<Key[]>([]);
  const [groupsByOrderKey, setGroupsByOrderKey] = useState<
    Record<string, GroupedOrderCache>
  >({});
  const [expandingOrderId, setExpandingOrderId] = useState<string | null>(null);
  const [openingGroupKey, setOpeningGroupKey] = useState<string | null>(null);

  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewOrder, setReviewOrder] = useState<WorklistOrderModalDto | null>(null);
  const [reviewGroup, setReviewGroup] = useState<WorklistOrderGroupSummary | null>(
    null,
  );
  const [reviewAppliedDepartmentId, setReviewAppliedDepartmentId] = useState<
    string | null
  >(null);
  const [working, setWorking] = useState(false);
  const [resultDocumentBusyTargetId, setResultDocumentBusyTargetId] = useState<string | null>(
    null,
  );

  const [rejectReason, setRejectReason] = useState('');
  const [rejectContext, setRejectContext] = useState<{
    ids: string[];
    closeOnSuccess: boolean;
  } | null>(null);

  const orderCacheKey = useCallback(
    (orderId: string, appliedDepartmentId?: string | null) =>
      `${orderId}::${appliedDepartmentId ?? (departmentId || 'all')}`,
    [departmentId],
  );

  const closeReviewModal = useCallback(() => {
    setReviewModalOpen(false);
    setReviewOrder(null);
    setReviewGroup(null);
    setReviewAppliedDepartmentId(null);
    setRejectContext(null);
    setRejectReason('');
    reviewForm.resetFields();
  }, [reviewForm]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getWorklistOrders({
        mode: 'verify',
        search: search.trim() || undefined,
        date: dateFilter?.format('YYYY-MM-DD'),
        departmentId: departmentId || undefined,
        page,
        size,
        verificationStatus: verificationStatusFilter,
      });
      setRows(result.items ?? []);
      setTotal(Number(result.total ?? 0));
    } catch {
      message.error('Failed to load verification queue');
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [dateFilter, departmentId, page, search, size, verificationStatusFilter]);

  const loadStats = useCallback(async () => {
    try {
      const result = await getWorklistStats();
      setStats(result);
    } catch {
      setStats(null);
    }
  }, []);

  useEffect(() => {
    void getDepartments()
      .then(setDepartments)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void getAntibiotics(true)
      .then(setAntibiotics)
      .catch(() => setAntibiotics([]));
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    setExpandedOrderKeys([]);
  }, [departmentId, page, verificationStatusFilter]);

  const loadOrderGroups = useCallback(
    async (
      orderId: string,
      options?: { force?: boolean; departmentOverride?: string | null },
    ): Promise<GroupedOrderCache | null> => {
      const appliedDepartmentId =
        options?.departmentOverride !== undefined
          ? options.departmentOverride
          : (departmentId || null);
      const key = orderCacheKey(orderId, appliedDepartmentId);
      const cached = groupsByOrderKey[key];
      if (!options?.force && cached) {
        return cached;
      }

      setExpandingOrderId(orderId);
      try {
        const payload = await getWorklistOrderTests(orderId, {
          mode: 'verify',
          departmentId: appliedDepartmentId ?? undefined,
        });
        const nextCache: GroupedOrderCache = {
          order: payload,
          groups: buildWorklistOrderGroups(payload.items),
          appliedDepartmentId,
        };
        setGroupsByOrderKey((previous) => ({ ...previous, [key]: nextCache }));
        return nextCache;
      } catch {
        message.error('Failed to load order review');
        return null;
      } finally {
        setExpandingOrderId((current) => (current === orderId ? null : current));
      }
    },
    [departmentId, groupsByOrderKey, orderCacheKey],
  );

  const getCachedGroupsForOrder = useCallback(
    (orderId: string) => groupsByOrderKey[orderCacheKey(orderId)] ?? null,
    [groupsByOrderKey, orderCacheKey],
  );

  const reloadAll = useCallback(async () => {
    await Promise.all([loadRows(), loadStats()]);
  }, [loadRows, loadStats]);

  const hydrateReviewModal = useCallback(
    (
      payload: WorklistOrderModalDto,
      group: WorklistOrderGroupSummary,
      appliedDepartmentId: string | null,
    ) => {
      reviewForm.resetFields();
      const cultureFormValues: Record<string, unknown> = {};
      for (const item of group.items) {
        if (
          item.testType === 'PANEL' ||
          item.resultEntryType !== 'CULTURE_SENSITIVITY'
        ) {
          continue;
        }
        cultureFormValues[item.id] = {
          cultureResult: normalizeCultureResultForForm(item.cultureResult),
        };
      }
      if (Object.keys(cultureFormValues).length > 0) {
        reviewForm.setFieldsValue(cultureFormValues);
      }
      setReviewOrder(payload);
      setReviewGroup(group);
      setReviewAppliedDepartmentId(appliedDepartmentId);
    },
    [reviewForm],
  );

  const orderedReviewItems = useMemo(
    () => sortModalItems(reviewGroup?.items ?? []),
    [reviewGroup],
  );

  const firstPanelIndex = useMemo(
    () =>
      orderedReviewItems.findIndex(
        (item) => item.testType === 'PANEL' && !item.parentOrderTestId,
      ),
    [orderedReviewItems],
  );

  const completedIdsInModal = useMemo(
    () => collectCompletedIds(orderedReviewItems),
    [orderedReviewItems],
  );

  const getCultureOptionsForTarget = useCallback(
    (target: WorklistItem) =>
      buildCultureAntibioticOptions(
        antibiotics,
        target.cultureAntibioticIds,
      ),
    [antibiotics],
  );

  const openReviewModalForGroup = useCallback(
    async (orderId: string, group: WorklistOrderGroupSummary) => {
      setOpeningGroupKey(`${orderId}:${group.groupId}`);
      setReviewLoading(true);
      try {
        const cached = await loadOrderGroups(orderId);
        if (!cached) return;
        let nextPayload = cached.order;
        let nextAppliedDepartmentId = cached.appliedDepartmentId;
        let nextGroup = resolveGroupByIdentity(cached.groups, group);
        if (!nextGroup) {
          message.warning('This group is no longer available in current filter');
          return;
        }
        if (nextGroup.groupKind === 'panel' && nextGroup.testsCount === 0) {
          if (cached.appliedDepartmentId) {
            const fullPayload = await getWorklistOrderTests(orderId, {
              mode: 'verify',
            });
            const fullGroups = buildWorklistOrderGroups(fullPayload.items);
            const resolvedFullGroup = resolveGroupByIdentity(fullGroups, nextGroup);
            if (resolvedFullGroup && resolvedFullGroup.testsCount > 0) {
              const fullKey = orderCacheKey(orderId, null);
              setGroupsByOrderKey((previous) => ({
                ...previous,
                [fullKey]: {
                  order: fullPayload,
                  groups: fullGroups,
                  appliedDepartmentId: null,
                },
              }));
              nextPayload = fullPayload;
              nextAppliedDepartmentId = null;
              nextGroup = resolvedFullGroup;
              message.info(
                'Loaded this panel from all departments because current filter has no panel children.',
              );
            } else {
              message.warning('This panel has no child tests in this order.');
            }
          } else {
            message.warning('This panel has no child tests in this order.');
          }
        }
        hydrateReviewModal(nextPayload, nextGroup, nextAppliedDepartmentId);
        setReviewModalOpen(true);
      } finally {
        setReviewLoading(false);
        setOpeningGroupKey(null);
      }
    },
    [hydrateReviewModal, loadOrderGroups, orderCacheKey],
  );

  const refreshReviewAfterMutation = useCallback(
    async (closeOnSuccess: boolean) => {
      await reloadAll();
      if (!reviewOrder) return;
      const refreshed = await loadOrderGroups(reviewOrder.orderId, {
        force: true,
        departmentOverride: reviewAppliedDepartmentId,
      });
      if (!refreshed) {
        if (closeOnSuccess) closeReviewModal();
        return;
      }
      if (closeOnSuccess) {
        closeReviewModal();
        return;
      }
      const nextGroup = resolveGroupByIdentity(refreshed.groups, reviewGroup);
      if (!nextGroup) {
        closeReviewModal();
        return;
      }
      hydrateReviewModal(
        refreshed.order,
        nextGroup,
        refreshed.appliedDepartmentId,
      );
    },
    [
      closeReviewModal,
      hydrateReviewModal,
      loadOrderGroups,
      reloadAll,
      reviewAppliedDepartmentId,
      reviewGroup,
      reviewOrder,
    ],
  );

  const verifyIds = useCallback(
    async (ids: string[], emptyMessage: string, closeOnSuccess: boolean) => {
      if (ids.length === 0) {
        message.warning(emptyMessage);
        return;
      }
      setWorking(true);
      try {
        const result = await verifyMultipleResults(Array.from(new Set(ids)));
        message.success(
          `Verified ${result.verified} result(s)${result.failed > 0 ? `, ${result.failed} failed` : ''
          }`,
        );
        await refreshReviewAfterMutation(closeOnSuccess);
      } catch {
        message.error('Failed to verify results');
      } finally {
        setWorking(false);
      }
    },
    [refreshReviewAfterMutation],
  );

  const openRejectDialog = (ids: string[], closeOnSuccess: boolean) => {
    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length === 0) {
      message.warning('No completed results to reject');
      return;
    }
    setRejectContext({
      ids: uniqueIds,
      closeOnSuccess,
    });
    setRejectReason('');
  };

  const runReject = async () => {
    if (!rejectContext || rejectContext.ids.length === 0 || !rejectReason.trim()) return;
    setWorking(true);
    try {
      const reason = rejectReason.trim();
      const results = await Promise.allSettled(
        rejectContext.ids.map((id) => rejectResult(id, reason)),
      );
      const success = results.filter((result) => result.status === 'fulfilled').length;
      const failed = results.filter((result) => result.status === 'rejected').length;
      message.success(
        `Rejected ${success} result(s)${failed > 0 ? `, ${failed} failed` : ''}. Returned to Worklist for review.`,
      );
      setRejectContext(null);
      setRejectReason('');
      await refreshReviewAfterMutation(rejectContext.closeOnSuccess);
    } catch {
      message.error('Failed to reject results');
    } finally {
      setWorking(false);
    }
  };

  const handleSearch = () => {
    setPage(1);
    void loadRows();
  };

  const handleExpandRow = useCallback(
    (expanded: boolean, record: WorklistOrderSummaryDto) => {
      setExpandedOrderKeys(expanded ? [record.orderId] : []);
      if (expanded) {
        void loadOrderGroups(record.orderId);
      }
    },
    [loadOrderGroups],
  );

  const orderColumns: ColumnsType<WorklistOrderSummaryDto> = [
    {
      title: 'Patient',
      key: 'patient',
      width: 280,
      render: (_: unknown, record) => (
        <div>
          <Text strong style={{ display: 'block', fontSize: 16, lineHeight: '20px', fontFamily: "'Noto Sans Arabic', sans-serif" }}>
            {record.patientName}
          </Text>
          <Text type="secondary" style={{ fontSize: 11, lineHeight: '14px' }}>
            {record.patientAgeDisplay || '-'}
          </Text>
        </div>
      ),
    },
    {
      title: 'Progress',
      key: 'progress',
      width: 350,
      render: (_: unknown, record) => (
        <Space size={[4, 4]} wrap>
          <Tag style={{ margin: 0 }}>{record.progressTotalRoot} tests</Tag>
          {record.progressPending > 0 && <Tag style={{ margin: 0 }}>Pending {record.progressPending}</Tag>}
          {record.progressCompleted > 0 && (
            <Tag color="processing" style={{ margin: 0 }}>
              Completed {record.progressCompleted}
            </Tag>
          )}
          {record.progressVerified > 0 && (
            <Tag color="success" style={{ margin: 0 }}>
              Verified {record.progressVerified}
            </Tag>
          )}
          {record.progressRejected > 0 && (
            <Tag color="error" style={{ margin: 0 }}>
              Rejected {record.progressRejected}
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Order Number',
      key: 'orderNumber',
      width: 180,
      render: (_: unknown, record) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {record.orderNumber}
        </Text>
      ),
    },
    {
      title: 'Order Time',
      key: 'registeredAt',
      width: 180,
      render: (_: unknown, record) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {dayjs(record.registeredAt).format('YYYY-MM-DD HH:mm')}
        </Text>
      ),
    },
    {
      title: 'Action',
      key: 'action',
      width: 130,
      render: (_: unknown, record) => {
        const expanded = expandedOrderKeys.includes(record.orderId);
        return (
          <Button
            size="small"
            loading={expandingOrderId === record.orderId}
            onClick={(event) => {
              event.stopPropagation();
              handleExpandRow(!expanded, record);
            }}
          >
            {expanded ? 'Hide groups' : 'Groups'}
          </Button>
        );
      },
    },
  ];

  const renderExpandedRow = (record: WorklistOrderSummaryDto) => {
    const cached = getCachedGroupsForOrder(record.orderId);
    if (!cached) {
      return (
        <div style={{ padding: '6px 8px' }}>
          {expandingOrderId === record.orderId ? (
            <Text type="secondary">Loading groups...</Text>
          ) : (
            <Button
              size="small"
              onClick={() => {
                void loadOrderGroups(record.orderId);
              }}
            >
              Load groups
            </Button>
          )}
        </div>
      );
    }

    const visibleGroups = cached.groups.filter((group) => group.isFullyEntered);
    const hiddenPendingPanelMessage = buildHiddenWorklistReviewMessage(cached.groups);
    if (visibleGroups.length === 0) {
      return (
        <div style={{ padding: '6px 8px' }}>
          <Text type="secondary">
            {hiddenPendingPanelMessage
              ? `No fully entered groups available for verification. ${hiddenPendingPanelMessage}`
              : 'No fully entered groups available for verification'}
          </Text>
        </div>
      );
    }

    return (
      <div className="verification-group-shell">
        <div className="verification-group-shell-title">Review groups</div>
        {hiddenPendingPanelMessage ? (
          <div style={{ marginBottom: 6 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {hiddenPendingPanelMessage}
            </Text>
          </div>
        ) : null}
        <div className="verification-group-list">
          {visibleGroups.map((group) => {
            const isEmptyPanel = group.groupKind === 'panel' && group.testsCount === 0;
            const openGroup = () => {
              if (isEmptyPanel) {
                message.warning(
                  'This panel has no configured child tests. Configure panel components in Test Management.',
                );
                return;
              }
              void openReviewModalForGroup(record.orderId, group);
            };

            return (
              <div
                key={group.groupId}
                className={`verification-group-item ${group.groupKind === 'panel'
                  ? 'verification-group-item-panel'
                  : group.groupKind === 'culture'
                    ? 'verification-group-item-culture'
                    : 'verification-group-item-single'
                  }`}
                onClick={openGroup}
              >
                <div className="verification-group-main">
                  <div className="verification-group-title-row">
                    <Text strong>
                      {group.label}
                    </Text>
                    {group.testsCount === 0 && (
                      <Tag color="warning" style={{ margin: 0 }}>
                        No child tests in this filter
                      </Tag>
                    )}
                  </div>
                  <Space size={[4, 4]} wrap>
                    {group.groupKind !== 'panel' && (
                      <Tag style={{ margin: 0 }}>{group.testsCount} tests</Tag>
                    )}
                    {group.completed > 0 && (
                      <Tag color="processing" style={{ margin: 0 }}>
                        Completed {group.completed}
                      </Tag>
                    )}
                    {group.verified > 0 && (
                      <Tag color="success" style={{ margin: 0 }}>
                        Verified {group.verified}
                      </Tag>
                    )}
                    {group.rejected > 0 && (
                      <Tag color="error" style={{ margin: 0 }}>
                        Rejected {group.rejected}
                      </Tag>
                    )}
                  </Space>
                </div>
                <Button
                  type="primary"
                  size="small"
                  className="verification-group-action-btn"
                  disabled={isEmptyPanel}
                  loading={openingGroupKey === `${record.orderId}:${group.groupId}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    openGroup();
                  }}
                >
                  Review
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const handlePreviewResultDocument = useCallback(async (item: WorklistItem) => {
    if (!item.resultDocument) return;
    setResultDocumentBusyTargetId(item.id);
    try {
      const blob = await downloadResultDocument(item.id);
      openBlobInNewTab(blob);
    } catch {
      message.error('Failed to open result PDF');
    } finally {
      setResultDocumentBusyTargetId((current) => (current === item.id ? null : current));
    }
  }, []);

  const handleDownloadResultDocument = useCallback(async (item: WorklistItem) => {
    if (!item.resultDocument) return;
    setResultDocumentBusyTargetId(item.id);
    try {
      const blob = await downloadResultDocument(item.id, { download: true });
      downloadBlob(blob, item.resultDocument.fileName || 'result.pdf');
    } catch {
      message.error('Failed to download result PDF');
    } finally {
      setResultDocumentBusyTargetId((current) => (current === item.id ? null : current));
    }
  }, []);

  return (
    <div>
      <style>{`
        .verification-orders-table .verification-order-row > td {
          cursor: pointer;
          transition:
            background-color 0.18s ease,
            border-color 0.18s ease;
        }
        .verification-orders-table .verification-order-row:hover > td {
          background: ${isDark ? 'rgba(148,163,184,0.12)' : '#f5f7fb'} !important;
        }
        .verification-orders-table .verification-order-row-expanded > td {
          background: ${isDark ? 'rgba(59,130,246,0.1)' : '#f3f8ff'} !important;
          border-top: none !important;
          border-bottom: 0 !important;
        }
        .verification-orders-table .verification-order-row-expanded > td:first-child {
          border-left: 2px solid ${isDark ? '#3b82f6' : '#2563eb'} !important;
        }
        .verification-orders-table .verification-order-row-expanded > td:last-child {
          border-right: 1px solid ${isDark ? 'rgba(96,165,250,0.48)' : '#bfdbfe'} !important;
        }
        .verification-orders-table .ant-table-expanded-row > td {
          padding: 12px 16px 16px !important;
          background: ${isDark ? 'rgba(15,23,42,0.2)' : '#f8fafc'} !important;
          border-left: 2px solid ${isDark ? '#3b82f6' : '#2563eb'} !important;
          border-right: 1px solid ${isDark ? 'rgba(96,165,250,0.48)' : '#bfdbfe'} !important;
          border-bottom: 1px solid ${isDark ? 'rgba(96,165,250,0.48)' : '#bfdbfe'} !important;
        }
        .verification-group-list {
          margin-top: 12px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .verification-group-shell {
          border: 1px solid ${isDark ? 'rgba(148,163,184,0.15)' : '#e2e8f0'};
          border-radius: 12px;
          background: ${isDark ? 'rgba(15,23,42,0.6)' : '#ffffff'};
          padding: 16px;
          margin: 6px 0;
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05);
        }
        .verification-group-shell-title {
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.5px;
          color: ${isDark ? 'rgba(148,163,184,0.9)' : '#64748b'};
          text-transform: uppercase;
          margin-bottom: 4px;
        }
        .verification-group-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-radius: 8px;
          border: 1px solid ${isDark ? 'rgba(34,197,94,0.3)' : '#bbf7d0'};
          background: ${isDark ? 'rgba(20,83,45,0.15)' : '#f0fdf4'};
          padding: 8px 16px;
          cursor: pointer;
          position: relative;
          overflow: hidden;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .verification-group-item:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px -4px rgba(0, 0, 0, 0.08);
          border-color: ${isDark ? 'rgba(34,197,94,0.5)' : '#86efac'};
          background: ${isDark ? 'rgba(20,83,45,0.3)' : '#dcfce7'};
        }
        .verification-group-item::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 5px;
          background-color: ${isDark ? '#22c55e' : '#16a34a'};
        }
        .verification-group-main {
          min-width: 0;
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 16px;
          flex: 1;
        }
        .verification-group-title-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          width: 220px;
          flex-shrink: 0;
        }
        .verification-group-title-row > span.ant-typography.ant-typography-strong {
          font-size: 15px !important;
          color: ${isDark ? '#f8fafc' : '#0f172a'};
          letter-spacing: -0.2px;
        }
        .verification-group-action-btn.ant-btn {
          border-radius: 6px;
          font-weight: 500;
          padding: 4px 20px;
          height: 36px;
        }
        .verification-review-modal .ant-modal-header {
          padding: 8px 10px !important;
        }
        .verification-review-modal .ant-modal-body {
          padding: 6px 10px 8px !important;
          max-height: calc(100vh - 140px);
          overflow-y: auto;
        }
        .verification-review-summary {
          margin-bottom: 4px;
          padding: 6px 8px;
          border-radius: 6px;
        }
        .verification-review-actions {
          display: flex;
          justify-content: flex-end;
          gap: 4px;
          margin-bottom: 4px;
        }
        .verification-review-note {
          display: block;
          margin-bottom: 4px;
          font-size: 10px !important;
        }
        .verification-review-grid-head {
          display: flex;
          padding: 3px 6px;
          border-radius: 4px 4px 0 0;
          background: ${isDark ? 'rgba(255,255,255,0.04)' : '#f3f4f6'};
          border-bottom: 1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#d1d5db'};
          font-weight: 600;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .verification-review-row {
          display: flex;
          align-items: center;
          padding: 3px 6px;
          border-radius: 4px;
        }
        .verification-review-panel-break {
          margin-top: 1px;
          margin-bottom: 1px;
          padding-top: 2px;
        }
        .verification-review-culture {
          margin: 0 6px 6px;
          padding: 6px;
          border-radius: 6px;
        }
        .verification-review-modal .ant-btn-sm {
          height: 26px;
          padding-inline: 7px;
          font-size: 12px;
        }
        .verification-review-modal .ant-tag {
          font-size: 10px;
          line-height: 16px;
          padding-inline: 6px;
        }
      `}</style>

      <Title level={2} className="queue-page-title">
        Verification
      </Title>
      <WorklistStatusDashboard stats={stats} style={{ marginBottom: 12 }} />

      <div
        ref={containerRef}
        className="queue-pane-shell"
        style={{ minHeight: filledMinHeightPx }}
      >
        <Card className="queue-main-card">
          <div className="queue-filters-block">
            <Space wrap size={[10, 10]} className="queue-filter-toolbar">
              <Input
                placeholder="Search order #, patient, test..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onPressEnter={handleSearch}
                style={{ width: 250 }}
                allowClear
              />
              <Select
                placeholder="Department"
                value={departmentId || undefined}
                onChange={(value) => setDepartmentId(value ?? '')}
                style={{ width: 200 }}
                allowClear
                options={departments.map((department) => ({
                  label: `${department.code} - ${department.name}`,
                  value: department.id,
                }))}
              />
              <Select
                value={verificationStatusFilter}
                style={{ width: 160 }}
                options={[
                  { label: 'Unverified', value: 'unverified' },
                  { label: 'Verified', value: 'verified' },
                ]}
                onChange={(value) => {
                  setVerificationStatusFilter(value as VerificationRowStatusFilter);
                  setPage(1);
                }}
              />
              <DatePicker
                value={dateFilter}
                onChange={setDateFilter}
                allowClear
                placeholder="Filter by date"
              />
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
                Search
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  void Promise.all([loadRows(), loadStats()]);
                }}
              >
                Refresh
              </Button>
            </Space>
          </div>

          <div className="queue-table-block">
            <Table<WorklistOrderSummaryDto>
              className="verification-orders-table queue-orders-table"
              rowKey="orderId"
              columns={orderColumns}
              dataSource={rows}
              loading={loading}
              showHeader
              rowClassName={(record) =>
                expandedOrderKeys.includes(record.orderId)
                  ? 'verification-order-row verification-order-row-expanded'
                  : 'verification-order-row'
              }
              expandable={{
                expandedRowRender: renderExpandedRow,
                expandedRowKeys: expandedOrderKeys,
                expandRowByClick: true,
                showExpandColumn: false,
                onExpand: handleExpandRow,
              }}
              pagination={{
                current: page,
                pageSize: size,
                total,
                showSizeChanger: false,
                showTotal: (value) => `Total ${value} orders`,
                onChange: (nextPage) => setPage(nextPage),
              }}
              scroll={{ x: 1040 }}
              size="small"
            />
          </div>
        </Card>
      </div>

      <Modal
        title={
          <Space size={8}>
            <span style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.2 }}>
              Review Results
            </span>
            {reviewOrder && (
              <Tag color="blue" style={{ margin: 0 }}>
                {reviewOrder.orderNumber}
              </Tag>
            )}
            {reviewGroup && (
              <Tag color="purple" style={{ margin: 0 }}>
                {reviewGroup.label}
              </Tag>
            )}
          </Space>
        }
        open={reviewModalOpen}
        onCancel={() => {
          closeReviewModal();
        }}
        footer={null}
        width={1050}
        className="verification-review-modal"
        styles={{
          header: {
            borderBottom: isDark
              ? '1px solid rgba(255,255,255,0.08)'
              : '1px solid #f0f0f0',
          },
        }}
      >
        {reviewLoading ? (
          <div style={{ padding: 28, textAlign: 'center' }}>
            <Text type="secondary">Loading order tests...</Text>
          </div>
        ) : reviewOrder && reviewGroup ? (
          <div>
            <div
              className="verification-review-summary"
              style={{
                marginBottom: 6,
                padding: '6px 8px',
                borderRadius: 6,
                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#fafafa',
                border: isDark
                  ? '1px solid rgba(255,255,255,0.08)'
                  : '1px solid #f0f0f0',
              }}
            >
              <Space direction="vertical" size={2} style={{ width: '100%' }}>
                <Text strong>{reviewOrder.patientName}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Order #{reviewOrder.orderNumber} | {dayjs(reviewOrder.registeredAt).format('YYYY-MM-DD HH:mm')}
                </Text>
              </Space>
            </div>

            <div className="verification-review-actions">
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                loading={working}
                disabled={completedIdsInModal.length === 0}
                style={{
                  backgroundColor: '#16a34a',
                  borderColor: '#16a34a',
                  color: '#ffffff',
                }}
                onClick={() => {
                  void verifyIds(
                    completedIdsInModal,
                    'No completed results to verify',
                    true,
                  );
                }}
              >
                Verify All
              </Button>
              <Button
                type="primary"
                danger
                icon={<CloseCircleOutlined />}
                loading={working}
                disabled={completedIdsInModal.length === 0}
                onClick={() => openRejectDialog(completedIdsInModal, true)}
              >
                Reject All
              </Button>
            </div>

            {reviewGroup.groupKind === 'single' && (
              <Text type="secondary" className="verification-review-note">
                Per-test Verify/Reject is available for single tests and keeps this modal open.
              </Text>
            )}

            <div
              className="verification-review-grid-head"
              style={{
                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f3f4f6',
              }}
            >
              <div style={{ flex: '1 1 29%', textAlign: 'center' }}>Test</div>
              <div style={{ flex: '1 1 15%', textAlign: 'center' }}>Result</div>
              <div style={{ flex: '1 1 7%', textAlign: 'center' }}>Unit</div>
              <div style={{ flex: '1 1 9%', textAlign: 'center' }}>Flag</div>
              <div style={{ flex: '1 1 8%', textAlign: 'center' }}>Status</div>
              <div style={{ flex: '1 1 16%', textAlign: 'left', paddingLeft: 8 }}>Ref. Range</div>
              {reviewGroup.groupKind === 'single' ? (
                <div style={{ flex: '1 1 16%', textAlign: 'right' }}>Action</div>
              ) : null}
            </div>

            <Form form={reviewForm} component={false}>
              {orderedReviewItems.map((item, index) => {
                const isPanelRoot = item.testType === 'PANEL' && !item.parentOrderTestId;
                const isPanelChild = Boolean(item.parentOrderTestId);
                const isCultureEntry =
                  item.testType !== 'PANEL' &&
                  item.resultEntryType === 'CULTURE_SENSITIVITY';
                const hasPdfDocument = Boolean(item.resultDocument?.fileName);
                const perRowActionEnabled =
                  reviewGroup.groupKind === 'single' &&
                  item.testType !== 'PANEL' &&
                  item.status === 'COMPLETED';

                return (
                  <div key={item.id}>
                    {firstPanelIndex > 0 && index === firstPanelIndex && (
                      <div
                        className="verification-review-panel-break"
                        style={{
                          borderTop: isDark
                            ? '1px dashed rgba(145,202,255,0.65)'
                            : '1px dashed #91caff',
                        }}
                      >
                        <Text strong style={{ fontSize: 11 }}>
                          Panel Tests
                        </Text>
                      </div>
                    )}
                    <div
                      className="verification-review-row"
                      style={{
                        borderBottom:
                          index < orderedReviewItems.length - 1
                            ? isDark
                              ? '1px solid rgba(255,255,255,0.05)'
                              : '1px solid #f0f0f0'
                            : 'none',
                        backgroundColor: isPanelRoot
                          ? isDark
                            ? 'rgba(114,46,209,0.14)'
                            : 'rgba(114,46,209,0.08)'
                          : 'transparent',
                      }}
                    >
                      <div style={{ flex: '1 1 29%', paddingRight: 8, textAlign: 'center' }}>
                        <Space size={6}>
                          {isPanelRoot && (
                            <Tag color="purple" style={{ margin: 0, fontSize: 11 }}>
                              Panel
                            </Tag>
                          )}
                          {item.rejectionReason?.trim() && (
                            <Tag color="error" style={{ margin: 0, fontSize: 11 }}>
                              Rejected
                            </Tag>
                          )}
                        </Space>
                        <div style={{ marginTop: 1, paddingLeft: isPanelChild ? 10 : 0 }}>
                          <Text
                            strong={isPanelRoot}
                            style={{
                              fontSize: 12,
                              lineHeight: '14px',
                              display: 'block',
                              whiteSpace: 'normal',
                              wordBreak: 'break-word',
                            }}
                          >
                            {item.testName}
                          </Text>
                        </div>
                        {item.rejectionReason?.trim() && (
                          <Text type="danger" style={{ display: 'block', fontSize: 11 }}>
                            {item.rejectionReason}
                          </Text>
                        )}
                      </div>

                      <div style={{ flex: '1 1 15%', paddingRight: 8, textAlign: 'center' }}>
                        <Space direction="vertical" size={4} style={{ width: '100%' }}>
                          <Text style={{ fontSize: 12 }}>
                            {isPanelRoot
                              ? 'Panel group'
                              : isCultureEntry
                                ? 'Culture details'
                                : formatResult(item)}
                          </Text>
                          {hasPdfDocument ? (
                            <Space size={4} wrap style={{ justifyContent: 'center' }}>
                              <Button
                                size="small"
                                type="link"
                                disabled={resultDocumentBusyTargetId === item.id}
                                onClick={() => {
                                  void handlePreviewResultDocument(item);
                                }}
                              >
                                Preview PDF
                              </Button>
                              <Button
                                size="small"
                                type="link"
                                disabled={resultDocumentBusyTargetId === item.id}
                                onClick={() => {
                                  void handleDownloadResultDocument(item);
                                }}
                              >
                                Download
                              </Button>
                            </Space>
                          ) : null}
                        </Space>
                      </div>

                      <div style={{ flex: '1 1 7%', textAlign: 'center', fontSize: 12 }}>
                        {item.testUnit || '-'}
                      </div>

                      <div style={{ flex: '1 1 9%', textAlign: 'center' }}>
                        {item.flag ? (
                          <Tag color={FLAG_COLOR[item.flag] || 'default'} style={{ margin: 0, fontSize: 11 }}>
                            {FLAG_LABEL[item.flag] || item.flag}
                          </Tag>
                        ) : (
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            -
                          </Text>
                        )}
                      </div>

                      <div style={{ flex: '1 1 8%', textAlign: 'center' }}>
                        <Tag color={STATUS_COLOR[item.status] || 'default'} style={{ margin: 0, fontSize: 11 }}>
                          {item.status.replace('_', ' ')}
                        </Tag>
                      </div>

                      <div
                        style={{
                          flex: '1 1 16%',
                          textAlign: 'left',
                          fontSize: 12,
                          whiteSpace: 'pre-line',
                          lineHeight: '16px',
                          wordBreak: 'break-word',
                          paddingLeft: 8,
                        }}
                      >
                        {formatReferenceRange(item)}
                      </div>

                      {reviewGroup.groupKind === 'single' ? (
                        <div style={{ flex: '1 1 16%', textAlign: 'right' }}>
                          <Space size={6} style={{ justifyContent: 'flex-end' }}>
                            <Button
                              type="link"
                              size="small"
                              icon={<CheckCircleOutlined />}
                              disabled={!perRowActionEnabled || working}
                              onClick={() => {
                                void verifyIds(
                                  [item.id],
                                  'Only completed results can be verified',
                                  false,
                                );
                              }}
                            >
                              Verify
                            </Button>
                            <Button
                              type="link"
                              danger
                              size="small"
                              icon={<CloseCircleOutlined />}
                              disabled={!perRowActionEnabled || working}
                              onClick={() => {
                                openRejectDialog([item.id], false);
                              }}
                            >
                              Reject
                            </Button>
                          </Space>
                        </div>
                      ) : null}
                    </div>
                    {isCultureEntry && (
                      <div
                        className="verification-review-culture"
                        style={{
                          border: isDark
                            ? '1px solid rgba(148,163,184,0.2)'
                            : '1px solid #dbeafe',
                          background: isDark ? 'rgba(2,6,23,0.24)' : '#f8fbff',
                        }}
                      >
                        <CultureSensitivityEditor
                          baseName={[item.id, 'cultureResult']}
                          antibioticOptions={getCultureOptionsForTarget(item)}
                          interpretationOptions={
                            item.cultureConfig?.interpretationOptions ?? ['S', 'I', 'R']
                          }
                          micUnit={item.cultureConfig?.micUnit ?? null}
                          disabled
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </Form>
          </div >
        ) : null}
      </Modal >

      <Modal
        title="Reject reason"
        open={Boolean(rejectContext)}
        onCancel={() => {
          setRejectContext(null);
          setRejectReason('');
        }}
        onOk={() => {
          void runReject();
        }}
        okText="Reject"
        okButtonProps={{ danger: true, loading: working, disabled: !rejectReason.trim() }}
      >
        <Input.TextArea
          value={rejectReason}
          onChange={(event) => setRejectReason(event.target.value)}
          rows={4}
          placeholder="Enter rejection reason"
          maxLength={300}
        />
      </Modal>
    </div >
  );
}
