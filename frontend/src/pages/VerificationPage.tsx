import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Badge,
  Button,
  Card,
  DatePicker,
  Descriptions,
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
  UserOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import {
  getDepartments,
  getWorklist,
  getWorklistStats,
  rejectResult,
  verifyMultipleResults,
  verifyResult,
  type DepartmentDto,
  type WorklistItem,
  type WorklistStats,
  OrderTestStatus,
  ResultFlag,
} from '../api/client';
import { WorklistStatusDashboard } from '../components/WorklistStatusDashboard';
import { useFillToViewportBottom } from '../hooks/useFillToViewportBottom';
import './QueuePages.css';

const { Title, Text } = Typography;
const { Search } = Input;

const flagColors: Record<string, string> = {
  [ResultFlag.NORMAL]: 'green',
  [ResultFlag.HIGH]: 'orange',
  [ResultFlag.LOW]: 'blue',
  [ResultFlag.CRITICAL_HIGH]: 'red',
  [ResultFlag.CRITICAL_LOW]: 'red',
  [ResultFlag.POSITIVE]: 'red',
  [ResultFlag.NEGATIVE]: 'green',
  [ResultFlag.ABNORMAL]: 'purple',
};

const flagLabels: Record<string, string> = {
  [ResultFlag.NORMAL]: 'Normal',
  [ResultFlag.HIGH]: 'High',
  [ResultFlag.LOW]: 'Low',
  [ResultFlag.CRITICAL_HIGH]: 'Critical High',
  [ResultFlag.CRITICAL_LOW]: 'Critical Low',
  [ResultFlag.POSITIVE]: 'Positive',
  [ResultFlag.NEGATIVE]: 'Negative',
  [ResultFlag.ABNORMAL]: 'Abnormal',
};

const statusTagColor: Record<OrderTestStatus, string> = {
  PENDING: 'default',
  IN_PROGRESS: 'processing',
  COMPLETED: 'warning',
  VERIFIED: 'success',
  REJECTED: 'error',
};

interface VerificationOrderGroup {
  orderId: string;
  orderNumber: string;
  patientName: string;
  patientAge: number | null;
  patientSex: string | null;
  registeredAt: string;
  items: WorklistItem[];
}

interface PanelReviewContext {
  orderId: string;
  panelRootId: string;
}

interface ResolvedPanelReviewContext {
  group: VerificationOrderGroup;
  panelRoot: WorklistItem;
  children: WorklistItem[];
  hasPanelChildren: boolean;
}

const PANEL_PARAM_ROW_MARKER = '::param::';

function groupVerificationByOrder(items: WorklistItem[]): VerificationOrderGroup[] {
  const byOrder = new Map<string, WorklistItem[]>();
  for (const item of items) {
    const list = byOrder.get(item.orderId) ?? [];
    list.push(item);
    byOrder.set(item.orderId, list);
  }

  return Array.from(byOrder.entries())
    .map(([orderId, orderItems]) => {
      const first = orderItems[0];
      return {
        orderId,
        orderNumber: first.orderNumber,
        patientName: first.patientName,
        patientAge: first.patientAge,
        patientSex: first.patientSex,
        registeredAt: first.registeredAt,
        items: orderItems,
      };
    })
    .filter((group) => {
      // Exclude orders that don't have any visible top-level items
      return group.items.some((i) => !i.parentOrderTestId);
    });
}

function getRootTests(items: WorklistItem[]): WorklistItem[] {
  return items
    .filter((item) => !item.parentOrderTestId)
    .sort((a, b) => {
      if (a.testType !== b.testType) {
        return a.testType === 'PANEL' ? -1 : 1;
      }
      return a.testCode.localeCompare(b.testCode);
    });
}

function getPanelChildren(items: WorklistItem[], panelRootId: string): WorklistItem[] {
  return items
    .filter((item) => item.parentOrderTestId === panelRootId)
    .sort((a, b) => a.testCode.localeCompare(b.testCode));
}

function getPanelReviewTargets(items: WorklistItem[], panelRoot: WorklistItem): WorklistItem[] {
  const children = getPanelChildren(items, panelRoot.id);
  if (children.length > 0) return children;
  return [panelRoot];
}

function getVirtualPanelParameterRows(panelRoot: WorklistItem): WorklistItem[] {
  const definitions = panelRoot.parameterDefinitions ?? [];
  if (definitions.length === 0) return [];

  const values = panelRoot.resultParameters ?? {};

  return definitions.map((def, index) => ({
    ...panelRoot,
    id: `${panelRoot.id}${PANEL_PARAM_ROW_MARKER}${def.code || index}`,
    parentOrderTestId: panelRoot.id,
    testCode: def.code || panelRoot.testCode,
    testName: def.label || def.code || panelRoot.testName,
    testAbbreviation: def.label || def.code || panelRoot.testAbbreviation,
    resultValue: null,
    resultText: values[def.code] ?? '-',
    resultParameters: null,
    testUnit: null,
    normalMin: null,
    normalMax: null,
    normalText:
      def.normalOptions && def.normalOptions.length === 1 ? def.normalOptions[0] : null,
  }));
}

function getVerifiableIdsForOrder(group: VerificationOrderGroup): string[] {
  const ids: string[] = [];

  for (const root of getRootTests(group.items)) {
    if (root.testType === 'PANEL') {
      ids.push(
        ...getPanelReviewTargets(group.items, root)
          .filter((target) => target.status === OrderTestStatus.COMPLETED)
          .map((target) => target.id),
      );
      continue;
    }

    if (root.status === OrderTestStatus.COMPLETED) {
      ids.push(root.id);
    }
  }

  return Array.from(new Set(ids));
}

function getVerifiableIdsForPanelChildren(
  group: VerificationOrderGroup,
  panelRootId: string,
): string[] {
  const panelRoot = group.items.find(
    (item) =>
      item.id === panelRootId &&
      item.testType === 'PANEL' &&
      !item.parentOrderTestId,
  );
  if (!panelRoot) return [];

  return getPanelReviewTargets(group.items, panelRoot)
    .filter((target) => target.status === OrderTestStatus.COMPLETED)
    .map((target) => target.id);
}

/** Same eligibility as verify panel children: COMPLETED child IDs only. */
function getRejectableIdsForPanelChildren(
  group: VerificationOrderGroup,
  panelRootId: string,
): string[] {
  const panelRoot = group.items.find(
    (item) =>
      item.id === panelRootId &&
      item.testType === 'PANEL' &&
      !item.parentOrderTestId,
  );
  if (!panelRoot) return [];

  return getPanelReviewTargets(group.items, panelRoot)
    .filter((target) => target.status === OrderTestStatus.COMPLETED)
    .map((target) => target.id);
}

type RejectTarget =
  | { mode: 'single'; item: WorklistItem }
  | { mode: 'panel'; context: ResolvedPanelReviewContext; ids: string[] };

export function VerificationPage() {
  const { containerRef, filledMinHeightPx } = useFillToViewportBottom();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<WorklistItem[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<WorklistStats | null>(null);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<dayjs.Dayjs | null>(dayjs());
  const [departmentId, setDepartmentId] = useState<string | ''>('');
  const [departments, setDepartments] = useState<DepartmentDto[]>([]);
  const [page, setPage] = useState(1);
  const [size] = useState(50);

  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [expandedOrderIds, setExpandedOrderIds] = useState<string[]>([]);
  const [panelReviewContext, setPanelReviewContext] = useState<PanelReviewContext | null>(null);

  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<RejectTarget | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<WorklistItem | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getWorklist({
        status: [OrderTestStatus.COMPLETED],
        search: search.trim() || undefined,
        date: dateFilter?.format('YYYY-MM-DD'),
        departmentId: departmentId || undefined,
        page,
        size,
      });
      setData(result.items);
      setTotal(result.total);
    } catch {
      message.error('Failed to load verification queue');
    } finally {
      setLoading(false);
    }
  }, [search, dateFilter, departmentId, page, size]);

  const loadStats = useCallback(async () => {
    try {
      const result = await getWorklistStats();
      setStats(result);
    } catch {
      // Ignore stats load errors
    }
  }, []);

  const loadDepartments = useCallback(async () => {
    try {
      const depts = await getDepartments();
      setDepartments(depts);
    } catch {
      // Ignore departments load errors
    }
  }, []);

  const groupedData = useMemo(() => groupVerificationByOrder(data), [data]);

  const activePanelReview = useMemo<ResolvedPanelReviewContext | null>(() => {
    if (!panelReviewContext) return null;

    const group = groupedData.find((g) => g.orderId === panelReviewContext.orderId);
    if (!group) return null;

    const panelRoot = group.items.find(
      (item) =>
        item.id === panelReviewContext.panelRootId &&
        item.testType === 'PANEL' &&
        !item.parentOrderTestId,
    );
    if (!panelRoot) return null;

    const panelChildren = getPanelChildren(group.items, panelRoot.id);
    const virtualRows =
      panelChildren.length === 0 ? getVirtualPanelParameterRows(panelRoot) : [];
    const reviewTargets = panelChildren.length > 0
      ? panelChildren
      : virtualRows.length > 0
        ? virtualRows
        : [panelRoot];

    return {
      group,
      panelRoot,
      children: reviewTargets,
      hasPanelChildren: panelChildren.length > 0 || virtualRows.length > 0,
    };
  }, [groupedData, panelReviewContext]);

  const reloadQueueAndStats = useCallback(async () => {
    await Promise.all([loadData(), loadStats()]);
  }, [loadData, loadStats]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    void loadStats();
    void loadDepartments();
  }, [loadStats, loadDepartments]);

  useEffect(() => {
    if (expandedOrderIds.length === 0) return;
    const expandedId = expandedOrderIds[0];
    if (!groupedData.some((group) => group.orderId === expandedId)) {
      setExpandedOrderIds([]);
    }
  }, [expandedOrderIds, groupedData]);

  useEffect(() => {
    if (!panelReviewContext) return;
    if (activePanelReview) return;
    setPanelReviewContext(null);
  }, [panelReviewContext, activePanelReview]);

  useEffect(() => {
    setSelectedRowKeys((keys) =>
      keys.filter((key) => groupedData.some((group) => group.orderId === key)),
    );
  }, [groupedData]);

  const formatResult = (item: WorklistItem): string => {
    if (item.resultValue !== null) {
      return `${item.resultValue}${item.testUnit ? ` ${item.testUnit}` : ''}`;
    }
    if (item.resultText) {
      return item.resultText;
    }
    if (item.resultParameters && Object.keys(item.resultParameters).length > 0) {
      return Object.entries(item.resultParameters)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
    }
    return '-';
  };

  const formatNormalRange = (item: WorklistItem): string => {
    if (item.normalText) return item.normalText;
    if (item.normalMin != null && item.normalMax != null) {
      return `${item.normalMin}-${item.normalMax}`;
    }
    return '-';
  };

  const openRejectModal = (item: WorklistItem) => {
    setRejectTarget({ mode: 'single', item });
    setRejectReason('');
    setRejectModalOpen(true);
  };

  const openRejectAllPanelModal = (context: ResolvedPanelReviewContext) => {
    const ids = getRejectableIdsForPanelChildren(context.group, context.panelRoot.id);
    if (ids.length === 0) {
      message.warning(
        context.hasPanelChildren
          ? 'No completed child results to reject.'
          : 'No completed panel result to reject.',
      );
      return;
    }
    setRejectTarget({ mode: 'panel', context, ids });
    setRejectReason('');
    setRejectModalOpen(true);
  };

  const openDetailModal = (item: WorklistItem) => {
    setDetailItem(item);
    setDetailModalOpen(true);
  };

  const openPanelReviewModal = (group: VerificationOrderGroup, panelRoot: WorklistItem) => {
    setPanelReviewContext({ orderId: group.orderId, panelRootId: panelRoot.id });
  };

  const handleVerifySingle = async (id: string) => {
    try {
      await verifyResult(id);
      message.success('Result verified');
      await reloadQueueAndStats();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : 'Failed to verify';
      message.error(msg || 'Failed to verify');
    }
  };

  const handleVerifyMultiple = async (ids: string[], emptyMessage: string) => {
    if (ids.length === 0) {
      message.warning(emptyMessage);
      return null;
    }

    try {
      const result = await verifyMultipleResults(ids);
      message.success(
        `Verified ${result.verified} result(s)${result.failed > 0 ? `, ${result.failed} failed` : ''
        }`,
      );
      await reloadQueueAndStats();
      return result;
    } catch {
      message.error('Failed to verify results');
      return null;
    }
  };

  const handleVerifyOrder = async (group: VerificationOrderGroup) => {
    const ids = getVerifiableIdsForOrder(group);
    await handleVerifyMultiple(ids, 'No completed results to verify in this order');
  };

  const handleVerifyPanelChildren = async (
    context: ResolvedPanelReviewContext,
  ) => {
    const ids = getVerifiableIdsForPanelChildren(context.group, context.panelRoot.id);
    await handleVerifyMultiple(
      ids,
      context.hasPanelChildren
        ? 'No completed child results to verify in this panel'
        : 'No completed panel result to verify',
    );
  };

  const handleBatchVerify = async () => {
    if (selectedRowKeys.length === 0) return;

    const ids = groupedData
      .filter((group) => selectedRowKeys.includes(group.orderId))
      .flatMap((group) => getVerifiableIdsForOrder(group));

    const uniqueIds = Array.from(new Set(ids));
    const result = await handleVerifyMultiple(
      uniqueIds,
      'No completed results to verify in selected orders',
    );

    if (result) {
      setSelectedRowKeys([]);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget || !rejectReason.trim()) return;
    const reason = rejectReason.trim();

    if (rejectTarget.mode === 'single') {
      try {
        await rejectResult(rejectTarget.item.id, reason);
        message.success('Result rejected');
        setRejectModalOpen(false);
        setRejectTarget(null);
        setRejectReason('');
        await reloadQueueAndStats();
      } catch (err: unknown) {
        const msg =
          err && typeof err === 'object' && 'response' in err
            ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
            : 'Failed to reject';
        message.error(msg || 'Failed to reject');
      }
      return;
    }

    const { ids } = rejectTarget;
    const results = await Promise.allSettled(
      ids.map((id) => rejectResult(id, reason)),
    );
    const successCount = results.filter((r) => r.status === 'fulfilled').length;
    const failCount = results.filter((r) => r.status === 'rejected').length;
    message.success(
      `Rejected ${successCount} result(s)${failCount > 0 ? `, ${failCount} failed` : ''}`,
    );
    setRejectModalOpen(false);
    setRejectTarget(null);
    setRejectReason('');
    await reloadQueueAndStats();
  };

  const formatRootResultPreview = (
    root: WorklistItem,
    group: VerificationOrderGroup,
  ) => {
    if (root.testType !== 'PANEL') {
      return <Text style={{ fontSize: 12 }}>{formatResult(root)}</Text>;
    }

    const children = getPanelChildren(group.items, root.id);
    const total = children.length;
    const completed = children.filter(
      (child) =>
        child.status === OrderTestStatus.COMPLETED ||
        child.status === OrderTestStatus.VERIFIED,
    ).length;

    if (total === 0) {
      const parameterCount = root.parameterDefinitions?.length ?? 0;
      return (
        <Space size={[4, 2]} wrap>
          {parameterCount > 0 ? (
            <Text strong style={{ fontSize: 12 }}>
              {parameterCount} panel items
            </Text>
          ) : (
            <Text style={{ fontSize: 12 }}>{formatResult(root)}</Text>
          )}
          <Tag color="purple" style={{ margin: 0, fontSize: 10, lineHeight: '14px', paddingInline: 4 }}>
            Panel
          </Tag>
        </Space>
      );
    }

    return (
      <Space size={[4, 2]} wrap>
        <Text strong style={{ fontSize: 12 }}>
          {completed}/{total} done
        </Text>
        <Tag color="purple" style={{ margin: 0, fontSize: 10, lineHeight: '14px', paddingInline: 4 }}>
          Panel
        </Tag>
      </Space>
    );
  };

  const renderExpandedTests = (group: VerificationOrderGroup) => {
    const rootTests = getRootTests(group.items);
    const compactStyle = { paddingTop: 6, paddingBottom: 6, fontSize: 12 };

    return (
      <div className="verification-expanded-panel" style={{ padding: '4px 16px 12px' }}>
        <Table<WorklistItem>
          className="verification-subtests-table"
          size="small"
          rowKey="id"
          dataSource={rootTests}
          pagination={false}
          columns={[
            {
              title: 'Test',
              key: 'test',
              width: 280,
              render: (_: unknown, row) => (
                <div style={{ lineHeight: '14px' }}>
                  <Space size={6} style={{ marginBottom: 2 }}>
                    <Tag color="blue" style={{ margin: 0, fontSize: 10, lineHeight: '14px', paddingInline: 4 }}>
                      {row.testCode}
                    </Tag>
                    {row.testType === 'PANEL' && (
                      <Tag color="purple" style={{ margin: 0, fontSize: 10, lineHeight: '14px', paddingInline: 4 }}>
                        Panel
                      </Tag>
                    )}
                  </Space>
                  <Text strong style={{ display: 'block', fontSize: 12 }}>
                    {row.testAbbreviation || row.testName}
                  </Text>
                </div>
              ),
              onCell: () => ({ style: compactStyle }),
            },
            {
              title: 'Result',
              key: 'result',
              width: 210,
              render: (_: unknown, row) => formatRootResultPreview(row, group),
              onCell: () => ({ style: compactStyle }),
            },
            {
              title: 'Flag',
              key: 'flag',
              width: 120,
              render: (_: unknown, row) =>
                row.flag ? (
                  <Tag
                    color={flagColors[row.flag] || 'default'}
                    style={{ margin: 0, fontSize: 10, lineHeight: '14px', paddingInline: 4 }}
                  >
                    {flagLabels[row.flag] || row.flag}
                  </Tag>
                ) : (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    -
                  </Text>
                ),
              onCell: () => ({ style: compactStyle }),
            },
            {
              title: 'Status',
              key: 'status',
              width: 120,
              render: (_: unknown, row) => (
                <Tag
                  color={statusTagColor[row.status]}
                  style={{ margin: 0, fontSize: 10, lineHeight: '14px', paddingInline: 4 }}
                >
                  {row.status}
                </Tag>
              ),
              onCell: () => ({ style: compactStyle }),
            },
            {
              title: 'Actions',
              key: 'actions',
              width: 240,
              align: 'right',
              render: (_: unknown, row) => {
                if (row.testType === 'PANEL') {
                  return (
                    <Space size={6}>
                      <Button
                        size="small"
                        onClick={(event) => {
                          event.stopPropagation();
                          openPanelReviewModal(group, row);
                        }}
                      >
                        Review
                      </Button>
                      <Button
                        type="primary"
                        size="small"
                        icon={<CheckCircleOutlined />}
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleVerifyOrder(group);
                        }}
                      >
                        Verify
                      </Button>
                    </Space>
                  );
                }

                return (
                  <Space size={6}>
                    <Button
                      type="primary"
                      size="small"
                      icon={<CheckCircleOutlined />}
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleVerifySingle(row.id);
                      }}
                    >
                      Verify
                    </Button>
                    <Button
                      danger
                      size="small"
                      icon={<CloseCircleOutlined />}
                      onClick={(event) => {
                        event.stopPropagation();
                        openRejectModal(row);
                      }}
                    >
                      Reject
                    </Button>
                  </Space>
                );
              },
              onCell: () => ({ style: compactStyle }),
            },
          ]}
          scroll={{ x: 940 }}
        />
      </div>
    );
  };

  const orderColumns: ColumnsType<VerificationOrderGroup> = [
    {
      title: 'Patient',
      key: 'patient',
      width: 290,
      render: (_: unknown, group) => {
        const firstItem = group.items[0];
        return (
          <Space size={8} style={{ minWidth: 0 }}>
            <UserOutlined style={{ fontSize: 14, color: '#1677ff' }} />
            <div style={{ minWidth: 0 }}>
              <Text strong ellipsis style={{ display: 'block', fontSize: 13, lineHeight: '16px' }}>
                {group.patientName}
              </Text>
              <Space size={4} style={{ flexWrap: 'wrap' }}>
                <Button
                  type="link"
                  size="small"
                  style={{ padding: 0, height: 'auto' }}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (firstItem) openDetailModal(firstItem);
                  }}
                >
                  {group.orderNumber}
                </Button>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {group.patientAge ? `${group.patientAge}y` : '-'} {group.patientSex || '-'}
                </Text>
              </Space>
            </div>
          </Space>
        );
      },
    },
    {
      title: 'Summary',
      key: 'summary',
      width: 280,
      render: (_: unknown, group) => {
        const rootCount = getRootTests(group.items).length;
        const critical = group.items.filter(
          (item) => item.flag === ResultFlag.CRITICAL_HIGH || item.flag === ResultFlag.CRITICAL_LOW,
        ).length;
        const abnormal = group.items.filter(
          (item) =>
            item.flag === ResultFlag.HIGH ||
            item.flag === ResultFlag.LOW ||
            item.flag === ResultFlag.POSITIVE ||
            item.flag === ResultFlag.ABNORMAL,
        ).length;

        return (
          <Space size={[4, 4]} wrap>
            <Tag style={{ margin: 0 }}>{rootCount} root tests</Tag>
            {critical > 0 && <Tag color="red" style={{ margin: 0 }}>Critical {critical}</Tag>}
            {abnormal > 0 && <Tag color="orange" style={{ margin: 0 }}>Abnormal {abnormal}</Tag>}
            {critical === 0 && abnormal === 0 && <Tag color="green" style={{ margin: 0 }}>Normal</Tag>}
          </Space>
        );
      },
    },
    {
      title: 'Order',
      key: 'order',
      width: 190,
      render: (_: unknown, group) => (
        <Text type="secondary" style={{ fontSize: 11 }}>
          {group.orderNumber}
        </Text>
      ),
    },
    {
      title: 'Time',
      key: 'time',
      width: 180,
      render: (_: unknown, group) => (
        <Text type="secondary" style={{ fontSize: 11 }}>
          {dayjs(group.registeredAt).format('YYYY-MM-DD HH:mm')}
        </Text>
      ),
    },
  ];

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys as string[]),
    getCheckboxProps: (record: VerificationOrderGroup) => ({
      disabled: getVerifiableIdsForOrder(record).length === 0,
    }),
  };

  const panelReviewColumns: ColumnsType<WorklistItem> = [
    {
      title: 'Test',
      key: 'test',
      width: 340,
      render: (_: unknown, row) => (
        <Text strong style={{ display: 'block', fontSize: 12, lineHeight: '16px' }}>
          {row.testName || '-'}
        </Text>
      ),
    },
    {
      title: 'Result',
      key: 'result',
      render: (_: unknown, row) => (
        <Text style={{ fontSize: 12 }}>{formatResult(row)}</Text>
      ),
    },
    {
      title: 'Range',
      key: 'range',
      width: 140,
      render: (_: unknown, row) => (
        <Text style={{ fontSize: 12 }}>{formatNormalRange(row)}</Text>
      ),
    },
    {
      title: 'Flag',
      key: 'flag',
      width: 110,
      render: (_: unknown, row) =>
        row.flag ? (
          <Tag
            color={flagColors[row.flag] || 'default'}
            style={{ margin: 0, fontSize: 10, lineHeight: '14px', paddingInline: 4 }}
          >
            {flagLabels[row.flag] || row.flag}
          </Tag>
        ) : (
          <Tag style={{ margin: 0, fontSize: 10, lineHeight: '14px', paddingInline: 4 }}>-</Tag>
        ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 110,
      render: (_: unknown, row) => (
        <Tag
          color={statusTagColor[row.status]}
          style={{ margin: 0, fontSize: 10, lineHeight: '14px', paddingInline: 4 }}
        >
          {row.status}
        </Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 190,
      align: 'right' as const,
      render: (_: unknown, row) => (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button
            type="link"
            size="small"
            icon={<CheckCircleOutlined />}
            onClick={(event) => {
              event.stopPropagation();
              const targetId =
                row.id.includes(PANEL_PARAM_ROW_MARKER) && row.parentOrderTestId
                  ? row.parentOrderTestId
                  : row.id;
              void handleVerifySingle(targetId);
            }}
          >
            Verify
          </Button>
          <Button
            type="link"
            danger
            size="small"
            icon={<CloseCircleOutlined />}
            onClick={(event) => {
              event.stopPropagation();
              const targetId =
                row.id.includes(PANEL_PARAM_ROW_MARKER) && row.parentOrderTestId
                  ? row.parentOrderTestId
                  : row.id;
              openRejectModal(targetId === row.id ? row : { ...row, id: targetId });
            }}
          >
            Reject
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <style>{`
        .verification-orders-table .ant-table-thead > tr > th {
          padding-top: 5px !important;
          padding-bottom: 5px !important;
        }
        .verification-orders-table .ant-table-tbody > tr > td {
          padding-top: 5px !important;
          padding-bottom: 5px !important;
        }
        .verification-orders-table .verification-order-row-expanded > td {
          background: #f7fbff !important;
        }
        .verification-orders-table .ant-table-expanded-row > td {
          padding: 4px 10px 8px !important;
          background: transparent !important;
        }
        .verification-subtests-table .ant-table-thead > tr > th {
          padding-top: 3px !important;
          padding-bottom: 3px !important;
          font-size: 11px;
        }
        .verification-subtests-table .ant-table-tbody > tr > td {
          padding-top: 3px !important;
          padding-bottom: 3px !important;
        }
        .verification-review-table .ant-table-thead > tr > th {
          padding-top: 3px !important;
          padding-bottom: 3px !important;
          font-size: 11px;
        }
        .verification-review-table .ant-table-tbody > tr > td {
          padding-top: 3px !important;
          padding-bottom: 3px !important;
        }
        .verification-review-modal .ant-modal {
          max-width: calc(100vw - 24px) !important;
        }
        .verification-review-modal .ant-modal-content {
          border-radius: 14px;
          overflow: hidden;
        }
        .verification-review-modal .ant-modal-header {
          padding: 10px 14px;
          margin-bottom: 0;
        }
        .verification-review-modal .ant-modal-body {
          padding: 8px 12px 10px !important;
          max-height: calc(100vh - 72px);
          overflow-y: auto;
        }
        .verification-review-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .verification-review-table .ant-table-container {
          border: 1px solid #d6e4f3;
          border-radius: 8px;
          overflow: hidden;
        }
        @media (max-width: 992px) {
          .verification-review-modal .ant-modal {
            margin: 12px auto;
          }
          .verification-review-modal .ant-modal-body {
            max-height: calc(100vh - 110px);
            padding: 8px 10px 10px !important;
          }
        }
      `}</style>
      <Title level={2} style={{ marginTop: 0, marginBottom: 10 }}>
        Verification Queue
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
              <Search
                placeholder="Search patient or order..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onSearch={() => {
                  void loadData();
                }}
                style={{ width: 250 }}
                allowClear
              />
              <DatePicker
                value={dateFilter}
                onChange={setDateFilter}
                allowClear
                placeholder="Filter by date"
              />
              <Select
                placeholder="Department"
                value={departmentId || undefined}
                onChange={(v) => setDepartmentId(v || '')}
                allowClear
                style={{ width: 150 }}
                options={[
                  { value: '', label: 'All departments' },
                  ...departments.map((d) => ({ value: d.id, label: d.name || d.code })),
                ]}
              />
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  void loadData();
                }}
              >
                Refresh
              </Button>
              {selectedRowKeys.length > 0 && (
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  onClick={() => {
                    void handleBatchVerify();
                  }}
                >
                  Verify Selected ({selectedRowKeys.length})
                </Button>
              )}
            </Space>
          </div>

          <div className="queue-table-block">
            <Table<VerificationOrderGroup>
              className="verification-orders-table"
              columns={orderColumns}
              dataSource={groupedData}
              rowKey="orderId"
              loading={loading}
              rowSelection={rowSelection}
              rowClassName={(record) =>
                expandedOrderIds.includes(record.orderId)
                  ? 'verification-order-row-expanded'
                  : ''
              }
              expandable={{
                expandedRowRender: (record) => renderExpandedTests(record),
                expandRowByClick: true,
                showExpandColumn: false,
                expandedRowKeys: expandedOrderIds,
                onExpand: (expanded, record) => {
                  setExpandedOrderIds(expanded ? [record.orderId] : []);
                },
              }}
              pagination={{
                current: page,
                pageSize: size,
                total,
                onChange: (p) => setPage(p),
                showSizeChanger: false,
                showTotal: (t) => `${t} order(s) awaiting verification`,
              }}
              scroll={{ x: 1060 }}
              size="small"
            />
          </div>
        </Card>
      </div>

      <Modal
        title={
          activePanelReview
            ? `${activePanelReview.panelRoot.testCode} - ${activePanelReview.panelRoot.testName}`
            : 'Review Panel'
        }
        open={Boolean(activePanelReview)}
        onCancel={() => {
          setPanelReviewContext(null);
        }}
        footer={null}
        width={1280}
        className="verification-review-modal"
        style={{ top: 16 }}
      >
        {activePanelReview && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div
              className="verification-review-toolbar"
            >
              <Space size={[6, 6]} wrap>
                <Tag style={{ margin: 0 }}>
                  {activePanelReview.hasPanelChildren
                    ? `${activePanelReview.children.length} child tests`
                    : 'Panel result'}
                </Tag>
                <Text strong>{activePanelReview.group.patientName}</Text>
                <Text type="secondary">Order {activePanelReview.group.orderNumber}</Text>
                <Text type="secondary">
                  {dayjs(activePanelReview.group.registeredAt).format('YYYY-MM-DD HH:mm')}
                </Text>
              </Space>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
                <Button
                  danger
                  icon={<CloseCircleOutlined />}
                  onClick={() => openRejectAllPanelModal(activePanelReview)}
                >
                  {activePanelReview.hasPanelChildren ? 'Reject All' : 'Reject panel result'}
                </Button>
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  onClick={() => {
                    void handleVerifyPanelChildren(activePanelReview);
                  }}
                >
                  {activePanelReview.hasPanelChildren ? 'Verify panel children' : 'Verify panel result'}
                </Button>
              </div>
            </div>

            <Table<WorklistItem>
              className="verification-review-table"
              size="small"
              pagination={false}
              rowKey={(row) => row.id}
              dataSource={activePanelReview.children}
              columns={panelReviewColumns}
              tableLayout="fixed"
            />
          </Space>
        )}
      </Modal>

      <Modal
        title={
          rejectTarget?.mode === 'panel'
            ? rejectTarget.context.hasPanelChildren
              ? 'Reject All Panel Results'
              : 'Reject Panel Result'
            : 'Reject Result'
        }
        open={rejectModalOpen}
        onCancel={() => {
          setRejectModalOpen(false);
          setRejectTarget(null);
          setRejectReason('');
        }}
        onOk={() => {
          void handleReject();
        }}
        okText={
          rejectTarget?.mode === 'panel'
            ? rejectTarget.context.hasPanelChildren
              ? 'Reject All'
              : 'Reject Panel'
            : 'Reject'
        }
        okButtonProps={{ danger: true, disabled: !rejectReason.trim() }}
      >
        {rejectTarget?.mode === 'single' && (
          <div>
            <p>
              <strong>Test:</strong> {rejectTarget.item.testCode} - {rejectTarget.item.testName}
            </p>
            <p>
              <strong>Patient:</strong> {rejectTarget.item.patientName}
            </p>
            <p>
              <strong>Result:</strong> {formatResult(rejectTarget.item)}
            </p>
            <Input.TextArea
              placeholder="Enter rejection reason..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              style={{ marginTop: 16 }}
            />
          </div>
        )}
        {rejectTarget?.mode === 'panel' && (
          <div>
            <p>
              <strong>Panel:</strong> {rejectTarget.context.panelRoot.testCode} -{' '}
              {rejectTarget.context.panelRoot.testName}
            </p>
            <p>
              <strong>Patient:</strong> {rejectTarget.context.group.patientName}
            </p>
            <p>
              <strong>Order #:</strong> {rejectTarget.context.group.orderNumber}
            </p>
            <p>
              <strong>Rejecting:</strong>{' '}
              {rejectTarget.context.hasPanelChildren
                ? `${rejectTarget.ids.length} child result(s)`
                : 'Panel result'}
            </p>
            <Input.TextArea
              placeholder={
                rejectTarget.context.hasPanelChildren
                  ? 'Enter rejection reason (applies to all child results)...'
                  : 'Enter rejection reason for panel result...'
              }
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              style={{ marginTop: 16 }}
            />
          </div>
        )}
      </Modal>

      <Modal
        title="Result Details"
        open={detailModalOpen}
        onCancel={() => {
          setDetailModalOpen(false);
          setDetailItem(null);
        }}
        footer={
          detailItem ? (
            <Space>
              <Button onClick={() => setDetailModalOpen(false)}>Close</Button>
              <Button
                danger
                onClick={() => {
                  setDetailModalOpen(false);
                  openRejectModal(detailItem);
                }}
              >
                Reject
              </Button>
              <Button
                type="primary"
                onClick={() => {
                  if (detailItem.testType === 'PANEL') {
                    const group = groupedData.find((g) => g.orderId === detailItem.orderId);
                    if (group) {
                      void handleVerifyOrder(group);
                    }
                  } else {
                    void handleVerifySingle(detailItem.id);
                  }
                  setDetailModalOpen(false);
                }}
              >
                Verify
              </Button>
            </Space>
          ) : null
        }
        width={600}
      >
        {detailItem && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="Order #">{detailItem.orderNumber}</Descriptions.Item>
            <Descriptions.Item label="Patient">{detailItem.patientName}</Descriptions.Item>
            <Descriptions.Item label="Age/Sex">
              {detailItem.patientAge ? `${detailItem.patientAge}y` : '-'} / {detailItem.patientSex || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Test Code">{detailItem.testCode}</Descriptions.Item>
            <Descriptions.Item label="Test Name">{detailItem.testName}</Descriptions.Item>
            <Descriptions.Item label="Result" span={2}>
              <Badge
                status={
                  detailItem.flag === ResultFlag.CRITICAL_HIGH || detailItem.flag === ResultFlag.CRITICAL_LOW
                    ? 'error'
                    : detailItem.flag === ResultFlag.HIGH ||
                      detailItem.flag === ResultFlag.LOW ||
                      detailItem.flag === ResultFlag.POSITIVE ||
                      detailItem.flag === ResultFlag.ABNORMAL
                      ? 'warning'
                      : 'success'
                }
                text={
                  <Text strong style={{ fontSize: 16 }}>
                    {formatResult(detailItem)}
                    {detailItem.flag && (
                      <Tag color={flagColors[detailItem.flag]} style={{ marginLeft: 8 }}>
                        {flagLabels[detailItem.flag]}
                      </Tag>
                    )}
                  </Text>
                }
              />
            </Descriptions.Item>
            <Descriptions.Item label="Normal Range">
              {formatNormalRange(detailItem)}
            </Descriptions.Item>
            <Descriptions.Item label="Unit">{detailItem.testUnit || '-'}</Descriptions.Item>
            <Descriptions.Item label="Department">
              {detailItem.departmentName || detailItem.departmentCode || '-'}
            </Descriptions.Item>
            <Descriptions.Item label="Tube Type">{detailItem.tubeType || '-'}</Descriptions.Item>
            <Descriptions.Item label="Registered">
              {dayjs(detailItem.registeredAt).format('YYYY-MM-DD HH:mm')}
            </Descriptions.Item>
            <Descriptions.Item label="Resulted">
              {detailItem.resultedAt ? dayjs(detailItem.resultedAt).format('YYYY-MM-DD HH:mm') : '-'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
}
