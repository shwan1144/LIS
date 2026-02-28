import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  SearchOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  CheckOutlined,
  UserOutlined,
  EditOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import {
  getWorklist,
  getWorklistStats,
  enterResult,
  verifyResult,
  verifyMultipleResults,
  rejectResult,
  getDepartments,
  type WorklistItem,
  type WorklistStats,
  type OrderTestStatus,
  type ResultFlag,
  type DepartmentDto,
} from '../api/client';
import { useTheme } from '../contexts/ThemeContext';
import { WorklistStatusDashboard } from '../components/WorklistStatusDashboard';
import { useFillToViewportBottom } from '../hooks/useFillToViewportBottom';
import './QueuePages.css';

const { Title, Text } = Typography;

const STATUS_OPTIONS = [
  { label: 'All statuses', value: 'ALL' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Verified', value: 'VERIFIED' },
  { label: 'Rejected', value: 'REJECTED' },
];

const getFlagColor = (flag: ResultFlag | null): string => {
  switch (flag) {
    case 'HH':
      return '#ff4d4f';
    case 'H':
      return '#fa8c16';
    case 'LL':
      return '#ff4d4f';
    case 'L':
      return '#1890ff';
    case 'N':
      return '#52c41a';
    case 'POS':
      return '#ff4d4f';
    case 'NEG':
      return '#52c41a';
    case 'ABN':
      return '#722ed1';
    default:
      return '#d9d9d9';
  }
};

const getFlagLabel = (flag: ResultFlag | null): string => {
  switch (flag) {
    case 'HH':
      return 'Critical High';
    case 'H':
      return 'High';
    case 'LL':
      return 'Critical Low';
    case 'L':
      return 'Low';
    case 'N':
      return 'Normal';
    case 'POS':
      return 'Positive';
    case 'NEG':
      return 'Negative';
    case 'ABN':
      return 'Abnormal';
    default:
      return '';
  }
};

/** One row per order; items are the worklist tests for that order */
interface WorklistOrderGroup {
  orderId: string;
  orderNumber: string;
  patientName: string;
  patientAge: number | null;
  patientSex: string | null;
  registeredAt: string;
  items: WorklistItem[];
}

function groupWorklistByOrder(items: WorklistItem[]): WorklistOrderGroup[] {
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
      // (e.g. they only contain rejected panel child tests)
      return group.items.some((i) => !i.parentOrderTestId);
    })
    .sort((a, b) => {
      const aTop = a.items.filter((i) => !i.parentOrderTestId);
      const bTop = b.items.filter((i) => !i.parentOrderTestId);
      const aHasRejected = aTop.some((i) => i.status === 'REJECTED');
      const bHasRejected = bTop.some((i) => i.status === 'REJECTED');
      if (aHasRejected !== bHasRejected) return aHasRejected ? -1 : 1;
      return dayjs(b.registeredAt).valueOf() - dayjs(a.registeredAt).valueOf();
    });
}

export function WorklistPage() {
  const isDark = useTheme().theme === 'dark';
  const { containerRef, filledMinHeightPx } = useFillToViewportBottom();
  const [data, setData] = useState<WorklistItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<WorklistStats | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderTestStatus | 'ALL'>('ALL');
  const [dateFilter, setDateFilter] = useState<dayjs.Dayjs | null>(dayjs());
  const [departmentId, setDepartmentId] = useState<string | ''>('');
  const [departments, setDepartments] = useState<DepartmentDto[]>([]);
  const [page, setPage] = useState(1);
  const [size] = useState(50);

  // Selection for batch verify
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [expandedOrderIds, setExpandedOrderIds] = useState<string[]>([]);

  // Result entry modal
  const [resultModalOpen, setResultModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<WorklistItem | null>(null);
  const [resultForm] = Form.useForm<any>();
  const [submitting, setSubmitting] = useState(false);

  // Reject modal
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectingItem, setRejectingItem] = useState<WorklistItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getWorklist({
        status: statusFilter === 'ALL' ? undefined : [statusFilter],
        search: search.trim() || undefined,
        date: dateFilter?.format('YYYY-MM-DD'),
        departmentId: departmentId || undefined,
        page,
        size,
      });
      setData(result.items);
      setTotal(result.total);
    } catch {
      message.error('Failed to load worklist');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, dateFilter, departmentId, page, size]);

  const loadStats = useCallback(async () => {
    try {
      const result = await getWorklistStats();
      setStats(result);
    } catch {
      // Silently fail for stats
    }
  }, []);

  const groupedData = useMemo(() => groupWorklistByOrder(data), [data]);

  useEffect(() => {
    getDepartments().then(setDepartments).catch(() => { });
  }, []);

  useEffect(() => {
    loadData();
    loadStats();
  }, [loadData, loadStats]);

  useEffect(() => {
    if (expandedOrderIds.length === 0) return;
    const expandedId = expandedOrderIds[0];
    if (!groupedData.some((group) => group.orderId === expandedId)) {
      setExpandedOrderIds([]);
    }
  }, [expandedOrderIds, groupedData]);

  const handleSearch = () => {
    setPage(1);
    loadData();
  };

  const resolveResultModalTargets = useCallback(
    (item: WorklistItem): WorklistItem[] => {
      if (item.testType !== 'PANEL') {
        return [item];
      }

      if (item.id.startsWith('group-')) {
        return data.filter((entry) => entry.orderId === item.orderId);
      }

      const panelChildren = data
        .filter(
          (entry) => entry.orderId === item.orderId && entry.parentOrderTestId === item.id,
        )
        .sort((a, b) => {
          const aOrder = a.panelSortOrder ?? 9999;
          const bOrder = b.panelSortOrder ?? 9999;
          if (aOrder !== bOrder) return aOrder - bOrder;
          return a.testCode.localeCompare(b.testCode);
        });
      return panelChildren.length > 0 ? panelChildren : [item];
    },
    [data],
  );


  const handleOpenResultModal = (item: WorklistItem) => {
    const targets = resolveResultModalTargets(item);
    setEditingItem(item);

    const formValues: any = {};

    targets.forEach((target) => {
      const existingParams = target.resultParameters ?? {};
      const defsByCode = new Map(
        (target.parameterDefinitions ?? []).map((definition) => [
          definition.code,
          definition,
        ]),
      );

      const resultParametersInitial: Record<string, string> = {};
      const resultParametersCustomInitial: Record<string, string> = {};
      const defaults: Record<string, string> = {};

      (target.parameterDefinitions ?? []).forEach((def) => {
        if (def.defaultValue != null && def.defaultValue.trim() !== '' && (existingParams[def.code] == null || String(existingParams[def.code]).trim() === '')) {
          defaults[def.code] = def.defaultValue.trim();
        }
      });

      for (const [code, rawValue] of Object.entries(existingParams)) {
        const value = rawValue != null ? String(rawValue).trim() : '';
        if (!value) continue;
        const definition = defsByCode.get(code);
        if (definition?.type === 'select') {
          const known = new Set(
            (definition.options ?? []).map((option) => option.trim().toLowerCase()),
          );
          if (known.size > 0 && !known.has(value.toLowerCase())) {
            resultParametersInitial[code] = '__other__';
            resultParametersCustomInitial[code] = value;
            continue;
          }
        }
        resultParametersInitial[code] = value;
      }

      const qualitativeOptions = target.resultTextOptions ?? [];
      const defaultQualitativeOption =
        qualitativeOptions.find((option) => option.isDefault)?.value ??
        qualitativeOptions[0]?.value;
      const knownOptionValues = new Set(
        qualitativeOptions.map((option) => option.value.trim().toLowerCase()),
      );

      let initialResultText = target.resultText ?? undefined;
      let customResultText: string | undefined;

      if (target.resultEntryType === 'QUALITATIVE') {
        if (!initialResultText && defaultQualitativeOption) {
          initialResultText = defaultQualitativeOption;
        }
        if (
          initialResultText &&
          target.allowCustomResultText &&
          !knownOptionValues.has(initialResultText.trim().toLowerCase())
        ) {
          customResultText = initialResultText;
          initialResultText = '__other__';
        }
      }

      formValues[target.id] = {
        resultValue: target.resultEntryType === 'QUALITATIVE' || target.resultEntryType === 'TEXT'
          ? undefined
          : target.resultValue,
        resultText: initialResultText,
        customResultText,
        resultParameters: { ...defaults, ...resultParametersInitial },
        resultParametersCustom: resultParametersCustomInitial,
      };
    });

    resultForm.setFieldsValue(formValues);
    setResultModalOpen(true);
  };

  const handleCloseResultModal = () => {
    setResultModalOpen(false);
    setEditingItem(null);
    resultForm.resetFields();
  };

  const handleSubmitResult = async (values: any) => {
    if (!editingItem) return;

    const isPanel = editingItem.testType === 'PANEL';
    const targets = resolveResultModalTargets(editingItem);

    setSubmitting(true);
    try {
      const savePromises = targets.map(async (target) => {
        const itemValues = values[target.id] || {};
        const resultParamsEntries: [string, string][] = [];
        const rawParams = itemValues.resultParameters ?? {};
        const rawCustomParams = itemValues.resultParametersCustom ?? {};

        for (const [code, rawValue] of Object.entries(rawParams)) {
          const value = rawValue != null ? String(rawValue).trim() : '';
          if (!value) continue;
          if (value === '__other__') {
            const customValue = rawCustomParams[code] != null ? String(rawCustomParams[code]).trim() : '';
            if (!customValue) continue;
            resultParamsEntries.push([code, customValue]);
            continue;
          }
          resultParamsEntries.push([code, value]);
        }

        const resultParams = Object.fromEntries(resultParamsEntries);
        const selectedResultText = itemValues.resultText?.trim() || '';
        const finalResultText =
          selectedResultText === '__other__'
            ? itemValues.customResultText?.trim() || ''
            : selectedResultText;

        const isQualitative = target.resultEntryType === 'QUALITATIVE';
        const isTextOnly = target.resultEntryType === 'TEXT';

        return enterResult(target.id, {
          resultValue: isQualitative || isTextOnly ? null : itemValues.resultValue ?? null,
          resultText: finalResultText || null,
          resultParameters: Object.keys(resultParams).length > 0 ? resultParams : null,
        });
      });

      await Promise.all(savePromises);
      message.success(isPanel ? 'Panel results saved' : 'Result saved');
      handleCloseResultModal();
      loadData();
      loadStats();
    } catch {
      message.error('Failed to save result(s)');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async (id: string) => {
    try {
      await verifyResult(id);
      message.success('Result verified');
      loadData();
      loadStats();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : 'Failed to verify';
      message.error(msg || 'Failed to verify');
    }
  };

  const handleBatchVerify = async () => {
    if (selectedRowKeys.length === 0) return;
    const idsToVerify = groupedData
      .filter((g) => selectedRowKeys.includes(g.orderId))
      .flatMap((g) => g.items.filter((i) => i.status === 'COMPLETED').map((i) => i.id));
    if (idsToVerify.length === 0) {
      message.warning('No completed results to verify in selected orders');
      return;
    }
    try {
      const result = await verifyMultipleResults(idsToVerify);
      message.success(`Verified ${result.verified} result(s)${result.failed > 0 ? `, ${result.failed} failed` : ''}`);
      setSelectedRowKeys([]);
      loadData();
      loadStats();
    } catch {
      message.error('Failed to verify results');
    }
  };

  const handleOpenRejectModal = (item: WorklistItem) => {
    setRejectingItem(item);
    setRejectReason('');
    setRejectModalOpen(true);
  };

  const handleReject = async () => {
    if (!rejectingItem || !rejectReason.trim()) return;

    try {
      await rejectResult(rejectingItem.id, rejectReason);
      message.success('Result rejected');
      setRejectModalOpen(false);
      setRejectingItem(null);
      loadData();
      loadStats();
    } catch {
      message.error('Failed to reject result');
    }
  };

  const queueGridTemplate = 'minmax(220px, 1.8fr) minmax(180px, 1.4fr) 120px 140px';

  const orderColumns: ColumnsType<WorklistOrderGroup> = [
    {
      title: (
        <div className="worklist-queue-header" style={{ gridTemplateColumns: queueGridTemplate }}>
          <span className="worklist-queue-header-item worklist-queue-header-item-patient">Patient</span>
          <span className="worklist-queue-header-item">Progress</span>
          <span className="worklist-queue-header-item">Order #</span>
          <span className="worklist-queue-header-item">Date/Time</span>
        </div>
      ),
      key: 'queue',
      render: (_, g) => {
        const topLevelItems = g.items.filter((i) => !i.parentOrderTestId);
        const pending = topLevelItems.filter((i) => i.status === 'PENDING' || i.status === 'IN_PROGRESS').length;
        const completed = topLevelItems.filter((i) => i.status === 'COMPLETED').length;
        const verified = topLevelItems.filter((i) => i.status === 'VERIFIED').length;
        const rejected = topLevelItems.filter((i) => i.status === 'REJECTED').length;
        const firstRejectedReason = topLevelItems.find(
          (i) => i.status === 'REJECTED' && i.rejectionReason?.trim(),
        )?.rejectionReason;

        return (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: queueGridTemplate,
              alignItems: 'center',
              columnGap: 8,
            }}
          >
            <Space size={8} style={{ minWidth: 0 }}>
              <UserOutlined style={{ fontSize: 14, color: '#1677ff' }} />
              <div style={{ minWidth: 0 }}>
                <Text strong ellipsis style={{ display: 'block', fontSize: 13, lineHeight: '16px' }}>
                  {g.patientName}
                </Text>
                <Text type="secondary" style={{ fontSize: 11, lineHeight: '14px' }}>
                  {g.patientAge !== null ? `${g.patientAge}y` : '-'} {g.patientSex || '-'}
                </Text>
              </div>
            </Space>

            <Space size={[4, 4]} wrap>
              <Tag style={{ margin: 0 }}>{topLevelItems.length} test{topLevelItems.length !== 1 ? 's' : ''}</Tag>
              {pending > 0 && <Tag color="default" style={{ margin: 0 }}>Pending {pending}</Tag>}
              {completed > 0 && <Tag color="processing" style={{ margin: 0 }}>Completed {completed}</Tag>}
              {verified > 0 && <Tag color="success" style={{ margin: 0 }}>Verified {verified}</Tag>}
              {rejected > 0 && <Tag color="error" style={{ margin: 0 }}>Rejected {rejected}</Tag>}
              {firstRejectedReason && (
                <Text type="danger" style={{ fontSize: 11 }}>
                  Reason: {firstRejectedReason}
                </Text>
              )}
            </Space>

            <Text type="secondary" style={{ fontSize: 12 }}>
              {g.orderNumber}
            </Text>

            <Text type="secondary" style={{ fontSize: 12 }}>
              {dayjs(g.registeredAt).format('YYYY-MM-DD HH:mm')}
            </Text>
          </div>
        );
      },
    },
  ];

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys as string[]),
    getCheckboxProps: (record: WorklistOrderGroup) => {
      const topLevel = record.items.filter((i) => !i.parentOrderTestId);
      return { disabled: !topLevel.some((i) => i.status === 'COMPLETED') };
    },
  };

  const formatWorklistResultPreview = (item: WorklistItem, allItems: WorklistItem[]): React.ReactNode => {
    if (item.testType === 'PANEL') {
      const children = allItems.filter(i => i.parentOrderTestId === item.id);
      const total = children.length;
      const completed = children.filter(i => i.status === 'COMPLETED' || i.status === 'VERIFIED').length;
      if (total === 0) return <Text type="secondary" italic>No tests</Text>;
      const percent = Math.round((completed / total) * 100);
      return (
        <Space size={4}>
          <Text strong={completed > 0} style={{ fontSize: 12 }}>
            {completed}/{total} done
          </Text>
          {completed > 0 && <Text type="secondary" style={{ fontSize: 11 }}>({percent}%)</Text>}
        </Space>
      );
    }

    if (item.resultValue !== null) {
      return (
        <Space size={4}>
          <Text strong style={{ fontSize: 12 }}>{item.resultValue}</Text>
          {item.testUnit && <Text type="secondary" style={{ fontSize: 11 }}>{item.testUnit}</Text>}
        </Space>
      );
    }
    if (item.resultText) {
      return <Text style={{ fontSize: 12 }} ellipsis title={item.resultText}>{item.resultText}</Text>;
    }
    return <Text type="secondary" style={{ fontSize: 12 }}>-</Text>;
  };

  const handleOpenOrderResultModal = (group: WorklistOrderGroup) => {
    // Create a virtual "panel" item to trigger the modal logic for the whole group
    const virtualItem: WorklistItem = {
      ...group.items[0],
      id: `group-${group.orderId}`,
      testType: 'PANEL',
      testName: 'Order Results',
      testCode: 'ORDER',
    };

    setEditingItem(virtualItem);
    const formValues: any = {};
    group.items.forEach((target) => {
      const existingParams = target.resultParameters ?? {};
      const defsByCode = new Map((target.parameterDefinitions ?? []).map((d) => [d.code, d]));
      const resultParametersInitial: Record<string, string> = {};
      const resultParametersCustomInitial: Record<string, string> = {};
      const defaults: Record<string, string> = {};

      (target.parameterDefinitions ?? []).forEach((def) => {
        if (
          def.defaultValue != null &&
          def.defaultValue.trim() !== '' &&
          (existingParams[def.code] == null || String(existingParams[def.code]).trim() === '')
        ) {
          defaults[def.code] = def.defaultValue.trim();
        }
      });

      for (const [code, rawValue] of Object.entries(existingParams)) {
        const value = rawValue != null ? String(rawValue).trim() : '';
        if (!value) continue;
        const definition = defsByCode.get(code);
        if (definition?.type === 'select') {
          const known = new Set((definition.options ?? []).map((o) => o.trim().toLowerCase()));
          if (known.size > 0 && !known.has(value.toLowerCase())) {
            resultParametersInitial[code] = '__other__';
            resultParametersCustomInitial[code] = value;
            continue;
          }
        }
        resultParametersInitial[code] = value;
      }

      let initialResultText = target.resultText ?? undefined;
      let customResultText: string | undefined;
      if (target.resultEntryType === 'QUALITATIVE') {
        const qualitativeOptions = target.resultTextOptions ?? [];
        const defaultOpt = qualitativeOptions.find((o) => o.isDefault)?.value ?? qualitativeOptions[0]?.value;
        const known = new Set(qualitativeOptions.map((o) => o.value.trim().toLowerCase()));
        if (!initialResultText && defaultOpt) initialResultText = defaultOpt;
        if (initialResultText && target.allowCustomResultText && !known.has(initialResultText.trim().toLowerCase())) {
          customResultText = initialResultText;
          initialResultText = '__other__';
        }
      }

      formValues[target.id] = {
        resultValue:
          target.resultEntryType === 'QUALITATIVE' || target.resultEntryType === 'TEXT'
            ? undefined
            : target.resultValue,
        resultText: initialResultText,
        customResultText,
        resultParameters: { ...defaults, ...resultParametersInitial },
        resultParametersCustom: resultParametersCustomInitial,
      };
    });
    resultForm.setFieldsValue(formValues);
    setResultModalOpen(true);
  };

  const renderExpandedTests = (group: WorklistOrderGroup) => {
    // Keep the list compact with root tests only. Panel child tests will be entered via the panel's modal.
    const visibleItems = group.items.filter(
      (i) => !i.parentOrderTestId
    );

    const compactStyle = { paddingTop: 6, paddingBottom: 6, fontSize: 12 };

    return (
      <div className="worklist-expanded-panel" style={{ padding: '4px 16px 16px' }}>
        <Table<WorklistItem>
          className="worklist-subtests-table"
          size="small"
          rowKey="id"
          dataSource={visibleItems}
          pagination={false}
          tableLayout="fixed"
          columns={[
            {
              title: 'Test',
              key: 'test',
              width: 300,
              render: (_: unknown, r: WorklistItem) => (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Tag color="blue" style={{ margin: 0, fontSize: 10, lineHeight: '16px' }}>
                      {r.testCode}
                    </Tag>
                    <Text strong style={{ fontSize: 12 }}>
                      {r.testAbbreviation || r.testName}
                    </Text>
                  </div>
                  {r.testType === 'PANEL' && (
                    <Text type="secondary" style={{ fontSize: 10 }}>
                      Panel Test
                    </Text>
                  )}
                </div>
              ),
              onCell: () => ({ style: compactStyle }),
            },
            {
              title: 'Result',
              key: 'result',
              width: 220,
              render: (_: unknown, r: WorklistItem) => (
                <div>
                  {formatWorklistResultPreview(r, group.items)}
                  {r.testType !== 'PANEL' && (r.normalMin !== null || r.normalMax !== null || r.normalText) && (
                    <div style={{ fontSize: 10, color: 'rgba(128,128,128,0.7)', marginTop: 2 }}>
                      Range:{' '}
                      {r.normalText || `${r.normalMin ?? '-'} - ${r.normalMax ?? '-'} ${r.testUnit || ''}`}
                    </div>
                  )}
                </div>
              ),
              onCell: () => ({ style: compactStyle }),
            },
            {
              title: 'Flag',
              key: 'flag',
              width: 100,
              render: (_: unknown, r: WorklistItem) => {
                if (!r.flag || r.flag === 'N') return <Text type="secondary">-</Text>;
                return (
                  <Tag color={getFlagColor(r.flag)} style={{ margin: 0, fontSize: 10 }}>
                    {getFlagLabel(r.flag) || r.flag}
                  </Tag>
                );
              },
              onCell: () => ({ style: compactStyle }),
            },
            {
              title: 'Status',
              key: 'status',
              width: 130,
              render: (_: unknown, r: WorklistItem) => {
                const colors: Record<OrderTestStatus, string> = {
                  PENDING: 'default',
                  IN_PROGRESS: 'processing',
                  COMPLETED: 'warning',
                  VERIFIED: 'success',
                  REJECTED: 'error',
                };
                return (
                  <div>
                    <Tag color={colors[r.status]} style={{ margin: 0, fontSize: 10 }}>
                      {r.status}
                    </Tag>
                    {r.status === 'REJECTED' && r.rejectionReason?.trim() && (
                      <div style={{ marginTop: 2 }}>
                        <Text type="danger" style={{ fontSize: 10 }}>
                          {r.rejectionReason}
                        </Text>
                      </div>
                    )}
                  </div>
                );
              },
              onCell: () => ({ style: compactStyle }),
            },
            {
              title: 'Actions',
              key: 'actions',
              width: 170,
              align: 'right',
              render: (_: unknown, r: WorklistItem) => (
                <Space size="small">
                  {r.status !== 'VERIFIED' && (
                    <Button
                      type="primary"
                      size="small"
                      ghost
                      onClick={() => handleOpenResultModal(r)}
                      style={{ fontSize: 11, height: 24 }}
                    >
                      {r.status === 'REJECTED'
                        ? 'Re-enter'
                        : r.resultValue !== null || r.resultText
                          ? 'Edit'
                          : 'Enter'}
                    </Button>
                  )}
                  {r.status === 'COMPLETED' && (
                    <Space size={4}>
                      <Tooltip title="Verify Result">
                        <Button
                          type="primary"
                          size="small"
                          icon={<CheckCircleOutlined style={{ fontSize: 12 }} />}
                          onClick={() => handleVerify(r.id)}
                          style={{
                            backgroundColor: '#52c41a',
                            borderColor: '#52c41a',
                            height: 24,
                            width: 24,
                            padding: 0,
                          }}
                        />
                      </Tooltip>
                      <Tooltip title="Reject/Repeat">
                        <Button
                          danger
                          size="small"
                          icon={<CloseCircleOutlined style={{ fontSize: 12 }} />}
                          onClick={() => handleOpenRejectModal(r)}
                          style={{ height: 24, width: 24, padding: 0 }}
                        />
                      </Tooltip>
                    </Space>
                  )}
                  {r.status === 'VERIFIED' && (
                    <Text type="success" style={{ fontSize: 11 }}>
                      <CheckCircleOutlined /> Verified
                    </Text>
                  )}
                  {r.status === 'REJECTED' && (
                    <Text type="danger" style={{ fontSize: 11 }}>
                      <CloseCircleOutlined /> Re-entry required
                    </Text>
                  )}
                </Space>
              ),
              onCell: () => ({ style: compactStyle }),
            },
          ]}
        />
      </div>
    );
  };


  return (
    <div>
      <style>{`
        .worklist-orders-table .ant-table-thead {
          display: table-header-group !important;
          visibility: visible !important;
        }
        .worklist-orders-table .ant-table-thead > tr {
          display: table-row !important;
        }
        .worklist-orders-table .ant-table-thead > tr > th {
          background: ${isDark ? 'rgba(255,255,255,0.06)' : '#f5f8ff'} !important;
          color: ${isDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.88)'} !important;
          border-bottom: 1px solid ${isDark ? 'rgba(255,255,255,0.14)' : '#d9e5ff'} !important;
          font-weight: 700;
          font-size: 12px;
          padding-top: 5px !important;
          padding-bottom: 5px !important;
        }
        .worklist-queue-header {
          display: grid;
          align-items: center;
          column-gap: 8px;
          width: 100%;
        }
        .worklist-queue-header-item {
          font-size: 11px;
          font-weight: 700;
          line-height: 14px;
          text-transform: uppercase;
          letter-spacing: 0.2px;
          white-space: nowrap;
        }
        .worklist-queue-header-item-patient {
          padding-left: 22px;
        }
        .worklist-orders-table .ant-table-tbody > tr > td {
          padding-top: 5px !important;
          padding-bottom: 5px !important;
        }
        .worklist-orders-table .worklist-order-row-expanded > td {
          background: #f7fbff !important;
          border-top: 1px solid #91caff !important;
          border-bottom: 0 !important;
        }
        .worklist-orders-table .worklist-order-row-expanded > td:first-child {
          border-left: 2px solid #1677ff !important;
          border-top-left-radius: 8px !important;
        }
        .worklist-orders-table .worklist-order-row-expanded > td:last-child {
          border-right: 1px solid #91caff !important;
          border-top-right-radius: 8px !important;
        }
        .worklist-orders-table .ant-table-expanded-row > td {
          padding: 4px 10px 8px !important;
          background: transparent !important;
          border-left: 2px solid #1677ff !important;
          border-right: 1px solid #91caff !important;
          border-bottom: 1px solid #91caff !important;
          border-bottom-left-radius: 8px !important;
          border-bottom-right-radius: 8px !important;
        }
        .worklist-expanded-panel {
          border: 0;
          border-radius: 0;
          overflow: hidden;
          background: transparent;
        }
        .worklist-expanded-panel .ant-table-container {
          border-radius: 0;
        }
        html[data-theme='dark'] .worklist-orders-table .worklist-order-row-expanded > td {
          background: rgba(255, 255, 255, 0.04) !important;
          border-top-color: rgba(100, 168, 255, 0.55) !important;
        }
        html[data-theme='dark'] .worklist-orders-table .worklist-order-row-expanded > td:first-child {
          border-left-color: #3c89e8 !important;
        }
        html[data-theme='dark'] .worklist-orders-table .worklist-order-row-expanded > td:last-child {
          border-right-color: rgba(100, 168, 255, 0.55) !important;
        }
        html[data-theme='dark'] .worklist-orders-table .ant-table-expanded-row > td {
          border-left-color: #3c89e8 !important;
          border-right-color: rgba(100, 168, 255, 0.55) !important;
          border-bottom-color: rgba(100, 168, 255, 0.55) !important;
        }
        .worklist-subtests-table .ant-table-thead > tr > th {
          padding-top: 3px !important;
          padding-bottom: 3px !important;
          font-size: 11px;
        }
        .worklist-subtests-table .ant-table-tbody > tr > td {
          padding-top: 3px !important;
          padding-bottom: 3px !important;
        }
        .panel-entry-modal .ant-modal {
          max-width: calc(100vw - 32px) !important;
          top: 20px;
          padding-bottom: 0;
        }
        .panel-entry-modal .ant-modal-content {
          border-radius: 14px;
          overflow: hidden;
        }
        .panel-entry-modal .ant-modal-header {
          padding: 8px 12px;
          margin-bottom: 0;
        }
        .panel-entry-modal .ant-modal-body {
          padding: 6px 12px 10px !important;
          max-height: calc(100vh - 140px);
          overflow-y: auto;
        }
        .panel-entry-modal .panel-entry-summary {
          margin-bottom: 6px;
          padding: 7px 9px;
          border-radius: 6px;
        }
        .panel-entry-modal .panel-entry-grid-head {
          padding: 5px 8px !important;
          margin-bottom: 0 !important;
        }
        .panel-entry-modal .panel-entry-grid-row {
          padding: 4px 8px !important;
          margin-bottom: 0 !important;
        }
        .panel-entry-modal .panel-entry-grid-row .ant-form-item {
          margin-bottom: 0;
        }
        .panel-entry-modal .panel-entry-params {
          margin-top: 6px !important;
          padding: 8px 10px !important;
        }
        .panel-entry-modal .panel-entry-footer {
          margin-top: 8px !important;
        }
        @media (max-width: 992px) {
          .panel-entry-modal .ant-modal {
            margin: 10px auto;
            top: 8px;
          }
          .panel-entry-modal .ant-modal-body {
            max-height: calc(100vh - 116px);
            padding: 10px 12px 12px !important;
          }
        }
      `}</style>
      <Title level={4} style={{ marginTop: 0, marginBottom: 10 }}>Worklist</Title>
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
                onChange={(e) => setSearch(e.target.value)}
                onPressEnter={handleSearch}
                style={{ width: 250 }}
                allowClear
              />
              <Select
                placeholder="Status"
                value={statusFilter}
                onChange={(value) => setStatusFilter(value as OrderTestStatus | 'ALL')}
                style={{ width: 180 }}
                options={STATUS_OPTIONS}
                allowClear={false}
              />
              <Select
                placeholder="Department"
                value={departmentId || undefined}
                onChange={(v) => setDepartmentId(v ?? '')}
                style={{ width: 180 }}
                allowClear
                options={departments.map((d) => ({ label: `${d.code} - ${d.name}`, value: d.id }))}
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
              <Button icon={<ReloadOutlined />} onClick={() => { loadData(); loadStats(); }}>
                Refresh
              </Button>
              {selectedRowKeys.length > 0 && (
                <Button
                  type="primary"
                  icon={<CheckOutlined />}
                  onClick={handleBatchVerify}
                  style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
                >
                  Verify Selected ({selectedRowKeys.length})
                </Button>
              )}
            </Space>
          </div>

          <div className="queue-table-block">
            <Table<WorklistOrderGroup>
              className="worklist-orders-table"
              rowKey="orderId"
              columns={orderColumns}
              dataSource={groupedData}
              loading={loading}
              showHeader
              rowClassName={(record) => (expandedOrderIds.includes(record.orderId) ? 'worklist-order-row-expanded' : '')}
              rowSelection={rowSelection}
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
                showSizeChanger: false,
                showTotal: (t) => `Total ${t} orders`,
                onChange: (p) => setPage(p),
              }}
              scroll={{ x: 820 }}
              size="small"
            />
          </div>
        </Card>
      </div>

      {/* Result Entry Modal */}
      <Modal
        title={
          <Space size={8}>
            <span style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.2 }}>Enter Result</span>
            {editingItem && (
              <Tag color="blue" style={{ margin: 0 }}>{editingItem.testName}</Tag>
            )}
          </Space>
        }
        open={resultModalOpen}
        onCancel={handleCloseResultModal}
        footer={null}
        width={960}
        className="panel-entry-modal"
        styles={{
          header: { borderBottom: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #f0f0f0' },
        }}
      >
        {editingItem && (
          <div>
            <div
              className="panel-entry-summary"
              style={{
                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#fafafa',
                border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #f0f0f0',
              }}
            >
              <Row gutter={[8, 2]}>
                <Col xs={24} sm={12}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Patient</Text>
                  <div style={{ marginTop: 2 }}><Text strong>{editingItem.patientName}</Text></div>
                </Col>
                <Col xs={24} sm={12}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Order</Text>
                  <div style={{ marginTop: 2 }}><Text strong>{editingItem.orderNumber}</Text></div>
                </Col>
              </Row>
              {(editingItem.normalMin !== null || editingItem.normalMax !== null || editingItem.normalText) && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #f0f0f0' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Normal range</Text>
                  <div style={{ marginTop: 2 }}>
                    <Text>
                      {editingItem.normalText ||
                        `${editingItem.normalMin ?? '-'} - ${editingItem.normalMax ?? '-'} ${editingItem.testUnit || ''}`}
                    </Text>
                  </div>
                </div>
              )}
            </div>

            <Form
              form={resultForm}
              layout="vertical"
              onFinish={handleSubmitResult}
            >
              {(() => {
                const targetItems = resolveResultModalTargets(editingItem);
                const isPanel = editingItem.testType === 'PANEL';

                return (
                  <>
                    {isPanel && (
                      <div
                        className="panel-entry-grid-head"
                        style={{
                          display: 'flex',
                          backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f5f5f5',
                          borderRadius: '6px 6px 0 0',
                          borderBottom: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #e8e8e8',
                          fontWeight: 600,
                          fontSize: 12,
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px'
                        }}
                      >
                        <div style={{ flex: '1 1 24%' }}>Test</div>
                        <div style={{ flex: '1 1 40%' }}>Result</div>
                        <div style={{ flex: '1 1 14%', textAlign: 'center' }}>Unit</div>
                        <div style={{ flex: '1 1 22%', textAlign: 'right' }}>Ref. Range</div>
                      </div>
                    )}

                    {targetItems.map((target, idx) => {
                      const parameterDefinitions = target.parameterDefinitions ?? [];
                      const hasParams = parameterDefinitions.length > 0;
                      const panelResultControlStyle = isPanel ? { width: '100%' } : undefined;

                      if (isPanel && hasParams) {
                        return parameterDefinitions.map((def, defIndex) => {
                          const isLastRow =
                            idx === targetItems.length - 1 && defIndex === parameterDefinitions.length - 1;
                          return (
                            <div
                              key={`${target.id}-${def.code}`}
                              className="panel-entry-grid-row"
                              style={{
                                marginBottom: 0,
                                borderBottom: !isLastRow
                                  ? (isDark ? '1px solid rgba(255,255,255,0.05)' : '1px solid #f0f0f0')
                                  : 'none',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                                <div style={{ flex: '1 1 24%' }}>
                                  <Text style={{ fontSize: 11, lineHeight: '15px' }}>{def.label}</Text>
                                </div>
                                <div style={{ flex: '1 1 40%' }}>
                                  <Form.Item name={[target.id, 'resultParameters', def.code]} noStyle>
                                    {def.type === 'select' ? (
                                      <Select
                                        allowClear
                                        showSearch
                                        style={{ width: '100%' }}
                                        size="small"
                                        placeholder="Select"
                                        options={[
                                          ...(def.options ?? []).map((o) => ({ label: o, value: o })),
                                          { label: 'Other...', value: '__other__' },
                                        ]}
                                      />
                                    ) : (
                                      <Input style={{ width: '100%' }} size="small" placeholder="Result" />
                                    )}
                                  </Form.Item>
                                  {def.type === 'select' && (
                                    <Form.Item noStyle shouldUpdate>
                                      {() => resultForm.getFieldValue([target.id, 'resultParameters', def.code]) === '__other__' && (
                                        <Form.Item
                                          name={[target.id, 'resultParametersCustom', def.code]}
                                          rules={[{ required: true, message: 'Enter custom value' }]}
                                          style={{ marginTop: 4, marginBottom: 0 }}
                                        >
                                          <Input size="small" placeholder="Specify custom value..." />
                                        </Form.Item>
                                      )}
                                    </Form.Item>
                                  )}
                                </div>
                                <div style={{ flex: '1 1 14%', textAlign: 'center', fontSize: 11 }}>
                                  -
                                </div>
                                <div style={{ flex: '1 1 22%', textAlign: 'right', fontSize: 11, color: 'rgba(128,128,128,0.8)' }}>
                                  -
                                </div>
                              </div>
                            </div>
                          );
                        });
                      }

                      return (
                        <div key={target.id} className={isPanel ? 'panel-entry-grid-row' : undefined} style={{
                          marginBottom: isPanel ? 0 : 10,
                          padding: isPanel ? undefined : 0,
                          borderBottom: isPanel && idx < targetItems.length - 1 ? (isDark ? '1px solid rgba(255,255,255,0.05)' : '1px solid #f0f0f0') : 'none'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                            <div style={{ flex: isPanel ? '1 1 24%' : '1 1 100%', marginBottom: isPanel ? 0 : 8 }}>
                              <Text strong={!isPanel} style={{ fontSize: isPanel ? 12 : 14 }}>{target.testName}</Text>
                            </div>

                            <div style={{ flex: isPanel ? '1 1 40%' : '1 1 100%' }}>
                              {!hasParams ? (
                                <Form.Item
                                  name={[target.id, 'resultText']}
                                  noStyle={isPanel}
                                  rules={target.resultEntryType === 'QUALITATIVE' ? [{ required: true, message: 'Required' }] : []}
                                >
                                  {target.resultEntryType === 'NUMERIC' ? (
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: isPanel ? '100%' : undefined }}>
                                      <Form.Item name={[target.id, 'resultValue']} noStyle>
                                        <InputNumber
                                          style={{ width: '100%' }}
                                          placeholder="Value"
                                          precision={2}
                                          size={isPanel ? 'small' : 'large'}
                                        />
                                      </Form.Item>
                                      {target.resultEntryType === 'NUMERIC' && !isPanel && target.testUnit && <Text type="secondary">{target.testUnit}</Text>}
                                    </div>
                                  ) : target.resultEntryType === 'QUALITATIVE' && (target.resultTextOptions?.length ?? 0) > 0 ? (
                                    <Select
                                      allowClear
                                      showSearch
                                      style={panelResultControlStyle}
                                      size={isPanel ? 'small' : 'large'}
                                      placeholder="Select"
                                      options={[
                                        ...(target.resultTextOptions ?? []).map((o) => ({ label: o.value, value: o.value })),
                                        ...(target.allowCustomResultText ? [{ label: 'Other...', value: '__other__' }] : []),
                                      ]}
                                    />
                                  ) : (
                                    <Input style={panelResultControlStyle} size={isPanel ? 'small' : 'large'} placeholder="Result text" />
                                  )}
                                </Form.Item>
                              ) : (
                                <Text type="secondary" italic style={{ fontSize: 12 }}>See parameters below</Text>
                              )}
                            </div>

                            {isPanel && (
                              <>
                                <div style={{ flex: '1 1 14%', textAlign: 'center', fontSize: 11 }}>
                                  {target.testUnit || '-'}
                                </div>
                                <div style={{ flex: '1 1 22%', textAlign: 'right', fontSize: 11, color: 'rgba(128,128,128,0.8)' }}>
                                  {target.normalText || `${target.normalMin ?? '-'} - ${target.normalMax ?? '-'}`}
                                </div>
                              </>
                            )}
                          </div>

                          {/* Qualitative "Other" field */}
                          {!hasParams && target.resultEntryType === 'QUALITATIVE' && target.allowCustomResultText && (
                            <Form.Item noStyle shouldUpdate>
                              {() => resultForm.getFieldValue([target.id, 'resultText']) === '__other__' && (
                                <div style={{ marginTop: 8, paddingLeft: isPanel ? 0 : 0 }}>
                                  <Form.Item
                                    name={[target.id, 'customResultText']}
                                    rules={[{ required: true, message: 'Enter custom text' }]}
                                    label={isPanel ? null : "Custom text"}
                                  >
                                    <Input style={panelResultControlStyle} placeholder="Specify custom result..." size="small" />
                                  </Form.Item>
                                </div>
                              )}
                            </Form.Item>
                          )}

                          {/* Parameters */}
                          {hasParams && !isPanel && (
                            <div
                              className="panel-entry-params"
                              style={{
                                marginTop: isPanel ? 12 : 16,
                                padding: 16,
                                backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#fafafa',
                                borderRadius: 8,
                                border: isDark ? '1px solid rgba(255,255,255,0.05)' : '1px solid #f0f0f0'
                              }}
                            >
                              <Row gutter={[16, 12]}>
                                {target.parameterDefinitions!.map((def) => (
                                  <Col key={def.code} xs={24} sm={12}>
                                    <Form.Item
                                      name={[target.id, 'resultParameters', def.code]}
                                      label={<span style={{ fontSize: 12 }}>{def.label}</span>}
                                      style={{ marginBottom: 0 }}
                                    >
                                      {def.type === 'select' ? (
                                        <Select
                                          allowClear
                                          size={isPanel ? 'middle' : 'small'}
                                          options={[
                                            ...(def.options ?? []).map((o) => ({ label: o, value: o })),
                                            { label: 'Other...', value: '__other__' },
                                          ]}
                                        />
                                      ) : (
                                        <Input size={isPanel ? 'middle' : 'small'} placeholder="Enter..." />
                                      )}
                                    </Form.Item>
                                    {/* Parameter "Other" handling could be added here if needed, keeping it simple for now */}
                                  </Col>
                                ))}
                              </Row>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                );
              })()}
              <Form.Item className="panel-entry-footer" style={{ marginBottom: 0, marginTop: 12 }}>
                <Space style={{ width: '100%', justifyContent: 'flex-end' }} size="middle">
                  <Button onClick={handleCloseResultModal}>Cancel</Button>
                  <Button type="primary" htmlType="submit" loading={submitting}>
                    Save Result
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </div>
        )}
      </Modal>

      {/* Reject Modal */}
      <Modal
        title="Reject Result"
        open={rejectModalOpen}
        onCancel={() => setRejectModalOpen(false)}
        onOk={handleReject}
        okText="Reject"
        okButtonProps={{ danger: true, disabled: !rejectReason.trim() }}
      >
        <div style={{ marginBottom: 16 }}>
          <Text>
            Are you sure you want to reject the result for{' '}
            <Text strong>{rejectingItem?.testCode} - {rejectingItem?.testName}</Text>?
          </Text>
        </div>
        <Input.TextArea
          placeholder="Enter rejection reason..."
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          rows={3}
        />
      </Modal>
    </div>
  );
}
