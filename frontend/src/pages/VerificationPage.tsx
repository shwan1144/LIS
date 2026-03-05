import { useCallback, useEffect, useMemo, useState, type Key } from 'react';
import {
  Button,
  Card,
  DatePicker,
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
  getDepartments,
  getWorklistOrderTests,
  getWorklistOrders,
  getWorklistStats,
  rejectResult,
  verifyMultipleResults,
  type DepartmentDto,
  type ResultFlag,
  type VerificationRowStatusFilter,
  type WorklistItem,
  type WorklistOrderModalDto,
  type WorklistOrderSummaryDto,
  type WorklistStats,
} from '../api/client';
import { WorklistStatusDashboard } from '../components/WorklistStatusDashboard';
import { useFillToViewportBottom } from '../hooks/useFillToViewportBottom';
import {
  buildWorklistOrderGroups,
  type WorklistOrderGroupSummary,
} from './worklistGrouping';
import './QueuePages.css';

const { Title, Text } = Typography;

const FLAG_COLOR: Record<ResultFlag, string> = {
  N: 'green',
  H: 'orange',
  L: 'blue',
  HH: 'red',
  LL: 'red',
  POS: 'red',
  NEG: 'green',
  ABN: 'purple',
};

const FLAG_LABEL: Record<ResultFlag, string> = {
  N: 'Normal',
  H: 'High',
  L: 'Low',
  HH: 'Critical High',
  LL: 'Critical Low',
  POS: 'Positive',
  NEG: 'Negative',
  ABN: 'Abnormal',
};

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
    const aOrder = a.panelSortOrder ?? 9999;
    const bOrder = b.panelSortOrder ?? 9999;
    if (aOrder !== bOrder) return aOrder - bOrder;
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
  if (currentGroup.groupKind === 'single') {
    return groups.find((group) => group.groupKind === 'single') ?? null;
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

export function VerificationPage() {
  const { containerRef, filledMinHeightPx } = useFillToViewportBottom();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<WorklistOrderSummaryDto[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<WorklistStats | null>(null);

  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<dayjs.Dayjs | null>(dayjs());
  const [departmentId, setDepartmentId] = useState<string | ''>('');
  const [departments, setDepartments] = useState<DepartmentDto[]>([]);
  const [page, setPage] = useState(1);
  const [size] = useState(25);
  const [verificationStatusFilter, setVerificationStatusFilter] =
    useState<VerificationRowStatusFilter>('unverified');

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
  }, []);

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
      setReviewOrder(payload);
      setReviewGroup(group);
      setReviewAppliedDepartmentId(appliedDepartmentId);
    },
    [],
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
          `Verified ${result.verified} result(s)${
            result.failed > 0 ? `, ${result.failed} failed` : ''
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
      message.success(`Rejected ${success} result(s)${failed > 0 ? `, ${failed} failed` : ''}`);
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
      setExpandedOrderKeys((previous) => {
        if (expanded) {
          if (previous.includes(record.orderId)) return previous;
          return [...previous, record.orderId];
        }
        return previous.filter((key) => key !== record.orderId);
      });
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
          <Text strong style={{ display: 'block', fontSize: 13, lineHeight: '16px' }}>
            {record.patientName}
          </Text>
          <Text type="secondary" style={{ fontSize: 11, lineHeight: '14px' }}>
            {record.patientAge != null ? `${record.patientAge}y` : '-'}
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
    if (visibleGroups.length === 0) {
      return (
        <div style={{ padding: '6px 8px' }}>
          <Text type="secondary">
            No fully entered groups available for verification
          </Text>
        </div>
      );
    }

    return (
      <div className="verification-group-shell">
        <div className="verification-group-shell-title">Review groups</div>
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
                className={`verification-group-item ${
                  group.groupKind === 'panel'
                    ? 'verification-group-item-panel'
                    : 'verification-group-item-single'
                }`}
                onClick={openGroup}
              >
              <div className="verification-group-main">
                <div className="verification-group-title-row">
                  <Text strong style={{ fontSize: 12 }}>
                    {group.label}
                  </Text>
                  {group.testsCount === 0 && (
                    <Tag color="warning" style={{ margin: 0 }}>
                      No child tests in this filter
                    </Tag>
                  )}
                </div>
                <Space size={[4, 4]} wrap>
                  <Tag style={{ margin: 0 }}>{group.testsCount} tests</Tag>
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

  return (
    <div>
      <style>{`
        .verification-orders-table .ant-table-thead > tr > th {
          font-weight: 700;
          font-size: 12px;
          padding-top: 4px !important;
          padding-bottom: 4px !important;
        }
        .verification-orders-table .ant-table-tbody > tr > td {
          padding-top: 4px !important;
          padding-bottom: 4px !important;
        }
        .verification-orders-table .ant-table-expanded-row > td {
          background: #f8fbff !important;
          border-top: none !important;
          padding: 8px 10px !important;
        }
        .verification-group-list {
          margin-top: 6px;
          margin-left: 22px;
          border-left: 2px dashed #c7d9ff;
          padding-left: 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .verification-group-shell {
          border: 1px solid #dbe8ff;
          border-radius: 10px;
          background: #f3f8ff;
          padding: 8px;
        }
        .verification-group-shell-title {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.2px;
          color: #1d4ed8;
          text-transform: uppercase;
        }
        .verification-group-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          border-radius: 8px;
          border: 1px solid #d9e8ff;
          padding: 8px 10px;
          cursor: pointer;
        }
        .verification-group-item-single {
          background: #eef5ff;
        }
        .verification-group-item-panel {
          background: #f5efff;
        }
        .verification-group-main {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .verification-group-title-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .verification-review-modal .ant-modal-header {
          padding: 5px 8px !important;
        }
        .verification-review-modal .ant-modal-body {
          padding: 5px 8px 6px !important;
          max-height: calc(100vh - 140px);
          overflow-y: auto;
        }
      `}</style>

      <Title level={4} style={{ marginTop: 0, marginBottom: 10 }}>
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
            <Space wrap>
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
              className="verification-orders-table"
              rowKey="orderId"
              columns={orderColumns}
              dataSource={rows}
              loading={loading}
              showHeader
              expandable={{
                expandedRowRender: renderExpandedRow,
                expandedRowKeys: expandedOrderKeys,
                expandRowByClick: false,
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
      >
        {reviewLoading ? (
          <div style={{ padding: 28, textAlign: 'center' }}>
            <Text type="secondary">Loading order tests...</Text>
          </div>
        ) : reviewOrder && reviewGroup ? (
          <div>
            <div
              style={{
                marginBottom: 6,
                padding: '6px 8px',
                borderRadius: 6,
                backgroundColor: '#fafafa',
                border: '1px solid #f0f0f0',
              }}
            >
              <Space direction="vertical" size={2} style={{ width: '100%' }}>
                <Text strong>{reviewOrder.patientName}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Order #{reviewOrder.orderNumber} | {dayjs(reviewOrder.registeredAt).format('YYYY-MM-DD HH:mm')}
                </Text>
              </Space>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: 6 }}>
              <Button
                icon={<CheckCircleOutlined />}
                loading={working}
                disabled={completedIdsInModal.length === 0}
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
              <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>
                Per-test Verify/Reject is available for single tests and keeps this modal open.
              </Text>
            )}

            <div
              style={{
                display: 'flex',
                backgroundColor: '#f5f5f5',
                borderRadius: '6px 6px 0 0',
                borderBottom: '1px solid #e8e8e8',
                fontWeight: 600,
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                padding: '2px 6px',
              }}
            >
              <div style={{ flex: '1 1 32%' }}>Test</div>
              <div style={{ flex: '1 1 18%' }}>Result</div>
              <div style={{ flex: '1 1 8%', textAlign: 'center' }}>Unit</div>
              <div style={{ flex: '1 1 9%', textAlign: 'center' }}>Flag</div>
              <div style={{ flex: '1 1 8%', textAlign: 'center' }}>Status</div>
              <div style={{ flex: '1 1 9%', textAlign: 'right' }}>Ref. Range</div>
              {reviewGroup.groupKind === 'single' ? (
                <div style={{ flex: '1 1 16%', textAlign: 'right' }}>Action</div>
              ) : null}
            </div>

            {orderedReviewItems.map((item, index) => {
              const isPanelRoot = item.testType === 'PANEL' && !item.parentOrderTestId;
              const isPanelChild = Boolean(item.parentOrderTestId);
              const perRowActionEnabled =
                reviewGroup.groupKind === 'single' &&
                item.testType !== 'PANEL' &&
                item.status === 'COMPLETED';

              return (
                <div key={item.id}>
                  {firstPanelIndex > 0 && index === firstPanelIndex && (
                    <div
                      style={{
                        borderTop: '1px dashed #91caff',
                        marginTop: 1,
                        paddingTop: 3,
                        marginBottom: 1,
                      }}
                    >
                      <Text strong style={{ fontSize: 11 }}>
                        Panel Tests
                      </Text>
                    </div>
                  )}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      padding: '1px 6px',
                      borderBottom:
                        index < orderedReviewItems.length - 1
                          ? '1px solid #f0f0f0'
                          : 'none',
                      backgroundColor: isPanelRoot ? 'rgba(114,46,209,0.08)' : 'transparent',
                    }}
                  >
                    <div style={{ flex: '1 1 32%', paddingRight: 8 }}>
                      <Space size={6}>
                        {isPanelRoot && (
                          <Tag color="purple" style={{ margin: 0, fontSize: 10 }}>
                            Panel
                          </Tag>
                        )}
                        {item.rejectionReason?.trim() && (
                          <Tag color="error" style={{ margin: 0, fontSize: 10 }}>
                            Rejected
                          </Tag>
                        )}
                      </Space>
                      <div style={{ marginTop: 1, paddingLeft: isPanelChild ? 10 : 0 }}>
                        <Text
                          strong={isPanelRoot}
                          style={{
                            fontSize: 11,
                            lineHeight: '13px',
                            display: 'block',
                            whiteSpace: 'normal',
                            wordBreak: 'break-word',
                          }}
                        >
                          {item.testName}
                        </Text>
                      </div>
                      {item.rejectionReason?.trim() && (
                        <Text type="danger" style={{ display: 'block', fontSize: 10 }}>
                          {item.rejectionReason}
                        </Text>
                      )}
                    </div>

                    <div style={{ flex: '1 1 18%', paddingRight: 8 }}>
                      <Text style={{ fontSize: 11 }}>{isPanelRoot ? 'Panel group' : formatResult(item)}</Text>
                    </div>

                    <div style={{ flex: '1 1 8%', textAlign: 'center', fontSize: 10 }}>
                      {item.testUnit || '-'}
                    </div>

                    <div style={{ flex: '1 1 9%', textAlign: 'center' }}>
                      {item.flag ? (
                        <Tag color={FLAG_COLOR[item.flag] || 'default'} style={{ margin: 0, fontSize: 10 }}>
                          {FLAG_LABEL[item.flag] || item.flag}
                        </Tag>
                      ) : (
                        <Text type="secondary" style={{ fontSize: 10 }}>
                          -
                        </Text>
                      )}
                    </div>

                    <div style={{ flex: '1 1 8%', textAlign: 'center' }}>
                      <Tag color={STATUS_COLOR[item.status] || 'default'} style={{ margin: 0, fontSize: 10 }}>
                        {item.status.replace('_', ' ')}
                      </Tag>
                    </div>

                    <div
                      style={{
                        flex: '1 1 9%',
                        textAlign: 'right',
                        fontSize: 10,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
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
                </div>
              );
            })}
          </div>
        ) : null}
      </Modal>

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
    </div>
  );
}
