import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  message,
  Input,
  Typography,
  Tag,
  DatePicker,
  Select,
  Modal,
  Form,
  InputNumber,
  Statistic,
  Row,
  Col,
  Divider,
  Tooltip,
  Popconfirm,
  Radio,
  AutoComplete,
  Checkbox,
} from 'antd';
import {
  SearchOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
  CheckOutlined,
  UserOutlined,
  PlusOutlined,
  DeleteOutlined,
  MinusCircleOutlined,
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

const { Title, Text } = Typography;

const STATUS_OPTIONS = [
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

interface AntibioticSensitivity {
  antibiotic: string;
  result: 'S' | 'I' | 'R'; // Susceptible, Intermediate, Resistant
}

interface Organism {
  name: string;
  quantity: '1+' | '2+' | '3+' | '4+' | 'Few' | 'Moderate' | 'Many' | 'Heavy';
  sensitivities: AntibioticSensitivity[];
}


const COMMON_ORGANISMS = [
  'Escherichia coli',
  'Staphylococcus aureus',
  'Klebsiella pneumoniae',
  'Pseudomonas aeruginosa',
  'Enterococcus faecalis',
  'Streptococcus pyogenes',
  'Candida albicans',
  'Proteus mirabilis',
  'Acinetobacter baumannii',
  'Staphylococcus epidermidis',
];

const COMMON_ANTIBIOTICS = [
  'Amoxicillin',
  'Ciprofloxacin',
  'Azithromycin',
  'Doxycycline',
  'Metronidazole',
  'Vancomycin',
  'Meropenem',
  'Ceftriaxone',
  'Levofloxacin',
  'Clindamycin',
];

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
  return Array.from(byOrder.entries()).map(([orderId, orderItems]) => {
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
  });
}

export function WorklistPage() {
  const { isDark } = useTheme();
  const [data, setData] = useState<WorklistItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<WorklistStats | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderTestStatus[]>(['PENDING', 'COMPLETED']);
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
  const [resultForm] = Form.useForm<{
    resultValue?: number;
    resultText?: string;
    customResultText?: string;
    resultParameters?: Record<string, string>;
    resultParametersCustom?: Record<string, string>;
  }>();
  const [submitting, setSubmitting] = useState(false);

  // Culture & Sensitivity state
  const [cultureNoGrowth, setCultureNoGrowth] = useState(false);
  const [cultureOrganisms, setCultureOrganisms] = useState<Organism[]>([]);
  const [cultureComments, setCultureComments] = useState('');

  // Reject modal
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectingItem, setRejectingItem] = useState<WorklistItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getWorklist({
        status: statusFilter,
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

  const handleOpenResultModal = (item: WorklistItem) => {
    setEditingItem(item);
    const existingParams = item.resultParameters ?? {};
    const defaults: Record<string, string> = {};
    const resultParametersInitial: Record<string, string> = {};
    const resultParametersCustomInitial: Record<string, string> = {};
    const defsByCode = new Map(
      (item.parameterDefinitions ?? []).map((definition) => [
        definition.code,
        definition,
      ]),
    );
    (item.parameterDefinitions ?? []).forEach((def) => {
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
    const qualitativeOptions = item.resultTextOptions ?? [];
    const defaultQualitativeOption =
      qualitativeOptions.find((option) => option.isDefault)?.value ??
      qualitativeOptions[0]?.value;
    const knownOptionValues = new Set(
      qualitativeOptions.map((option) => option.value.trim().toLowerCase()),
    );

    let initialResultText = item.resultText ?? undefined;
    let customResultText: string | undefined;

    if (item.resultEntryType === 'QUALITATIVE') {
      if (!initialResultText && defaultQualitativeOption) {
        initialResultText = defaultQualitativeOption;
      }
      if (
        initialResultText &&
        item.allowCustomResultText &&
        !knownOptionValues.has(initialResultText.trim().toLowerCase())
      ) {
        customResultText = initialResultText;
        initialResultText = '__other__';
      }
    }

    resultForm.setFieldsValue({
      resultValue: item.resultEntryType === 'QUALITATIVE' || item.resultEntryType === 'TEXT' || item.resultEntryType === 'CULTURE_SENSITIVITY'
        ? undefined
        : (item.resultValue ?? undefined),
      resultText: initialResultText,
      customResultText,
      resultParameters: { ...defaults, ...resultParametersInitial },
      resultParametersCustom: resultParametersCustomInitial,
    });

    // Initialize culture state if editing a C/S test
    if (item.resultEntryType === 'CULTURE_SENSITIVITY') {
      const rawCulture = existingParams.__cultureResult;
      if (rawCulture) {
        try {
          const parsed = JSON.parse(rawCulture);
          setCultureNoGrowth(Boolean(parsed.noGrowth));
          setCultureOrganisms(parsed.organisms ?? []);
          setCultureComments(parsed.comments ?? '');
        } catch {
          setCultureNoGrowth(false);
          setCultureOrganisms([]);
          setCultureComments('');
        }
      } else if (item.resultText === 'No growth') {
        setCultureNoGrowth(true);
        setCultureOrganisms([]);
        setCultureComments('');
      } else {
        setCultureNoGrowth(false);
        setCultureOrganisms([]);
        setCultureComments('');
      }
    }

    setResultModalOpen(true);
  };

  const handleCloseResultModal = () => {
    setResultModalOpen(false);
    setEditingItem(null);
    resultForm.resetFields();
    setCultureNoGrowth(false);
    setCultureOrganisms([]);
    setCultureComments('');
  };

  const handleSubmitCulture = async () => {
    if (!editingItem) return;

    // Validate
    if (!cultureNoGrowth && cultureOrganisms.length === 0) {
      message.warning('Add at least one organism or mark as "No Growth"');
      return;
    }
    if (!cultureNoGrowth) {
      for (let i = 0; i < cultureOrganisms.length; i++) {
        if (!cultureOrganisms[i].name.trim()) {
          message.warning(`Organism ${i + 1}: name is required`);
          return;
        }
      }
    }

    // Build summary for resultText
    let summary: string;
    if (cultureNoGrowth) {
      summary = 'No growth';
    } else {
      summary = cultureOrganisms
        .map((o) => `${o.name} (${o.quantity})`)
        .join('; ');
    }

    // Serialize culture data into resultParameters
    const cultureData = {
      noGrowth: cultureNoGrowth,
      organisms: cultureNoGrowth ? [] : cultureOrganisms,
      comments: cultureComments || undefined,
    };

    setSubmitting(true);
    try {
      await enterResult(editingItem.id, {
        resultValue: null,
        resultText: summary,
        resultParameters: { __cultureResult: JSON.stringify(cultureData) },
      });
      message.success('Culture result saved');
      handleCloseResultModal();
      loadData();
      loadStats();
    } catch {
      message.error('Failed to save culture result');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitResult = async (values: {
    resultValue?: number;
    resultText?: string;
    customResultText?: string;
    resultParameters?: Record<string, string>;
    resultParametersCustom?: Record<string, string>;
  }) => {
    if (!editingItem) return;

    // Delegate to culture handler for C/S tests
    if (editingItem.resultEntryType === 'CULTURE_SENSITIVITY') {
      handleSubmitCulture();
      return;
    }

    const raw = values.resultParameters ?? {};
    const rawCustom = values.resultParametersCustom ?? {};
    const resultParamsEntries: Array<[string, string]> = [];
    for (const [code, rawValue] of Object.entries(raw)) {
      const value = rawValue != null ? String(rawValue).trim() : '';
      if (!value) continue;
      if (value === '__other__') {
        const customValue = rawCustom[code] != null ? String(rawCustom[code]).trim() : '';
        if (!customValue) {
          message.warning(`Please specify custom value for ${code}.`);
          return;
        }
        resultParamsEntries.push([code, customValue]);
        continue;
      }
      resultParamsEntries.push([code, value]);
    }
    const resultParams = Object.fromEntries(resultParamsEntries);
    const selectedResultText = values.resultText?.trim() || '';
    const finalResultText =
      selectedResultText === '__other__'
        ? values.customResultText?.trim() || ''
        : selectedResultText;
    const isQualitative = editingItem.resultEntryType === 'QUALITATIVE';
    const isTextOnly = editingItem.resultEntryType === 'TEXT';

    setSubmitting(true);
    try {
      await enterResult(editingItem.id, {
        resultValue: isQualitative || isTextOnly ? null : values.resultValue ?? null,
        resultText: finalResultText || null,
        resultParameters: Object.keys(resultParams).length > 0 ? resultParams : null,
      });
      message.success('Result saved');
      handleCloseResultModal();
      loadData();
      loadStats();
    } catch {
      message.error('Failed to save result');
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

  const orderColumns: ColumnsType<WorklistOrderGroup> = [
    {
      title: 'Queue',
      key: 'queue',
      render: (_, g) => {
        const pending = g.items.filter((i) => i.status === 'PENDING' || i.status === 'IN_PROGRESS').length;
        const completed = g.items.filter((i) => i.status === 'COMPLETED').length;
        const verified = g.items.filter((i) => i.status === 'VERIFIED').length;
        const rejected = g.items.filter((i) => i.status === 'REJECTED').length;

        return (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(220px, 1.8fr) minmax(180px, 1.4fr) 120px 140px',
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
              <Tag style={{ margin: 0 }}>{g.items.length} test{g.items.length !== 1 ? 's' : ''}</Tag>
              {pending > 0 && <Tag color="default" style={{ margin: 0 }}>Pending {pending}</Tag>}
              {completed > 0 && <Tag color="processing" style={{ margin: 0 }}>Completed {completed}</Tag>}
              {verified > 0 && <Tag color="success" style={{ margin: 0 }}>Verified {verified}</Tag>}
              {rejected > 0 && <Tag color="error" style={{ margin: 0 }}>Rejected {rejected}</Tag>}
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
    getCheckboxProps: (record: WorklistOrderGroup) => ({
      disabled: !record.items.some((i) => i.status === 'COMPLETED'),
    }),
  };

  const renderExpandedTests = (group: WorklistOrderGroup) => (
    <div className="worklist-expanded-panel">
      <Table
        className="worklist-subtests-table"
        size="small"
        rowKey="id"
        dataSource={group.items}
        pagination={false}
        columns={[
          {
            title: 'Test',
            key: 'test',
            width: 200,
            render: (_: unknown, r: WorklistItem) => (
              <div>
                <Tag color="blue">{r.testCode}</Tag>
                <Text>{r.testName}</Text>
              </div>
            ),
          },
          {
            title: 'Result',
            key: 'result',
            width: 150,
            render: (_: unknown, r: WorklistItem) => {
              if (r.resultValue !== null) {
                return (
                  <Space>
                    <Text strong style={{ color: getFlagColor(r.flag) }}>{r.resultValue}</Text>
                    {r.testUnit && <Text type="secondary">{r.testUnit}</Text>}
                    {r.flag && r.flag !== 'N' && <Tag color={getFlagColor(r.flag)}>{r.flag}</Tag>}
                  </Space>
                );
              }
              if (r.resultText) {
                return (
                  <Space size={6}>
                    <Text>{r.resultText}</Text>
                    {r.flag && (
                      <Tag color={getFlagColor(r.flag)} style={{ margin: 0 }}>
                        {getFlagLabel(r.flag) || r.flag}
                      </Tag>
                    )}
                  </Space>
                );
              }
              return <Text type="secondary">—</Text>;
            },
          },
          {
            title: 'Normal Range',
            key: 'normalRange',
            width: 130,
            render: (_: unknown, r: WorklistItem) => {
              if (r.normalText) return <Text type="secondary">{r.normalText}</Text>;
              if (r.normalMin !== null || r.normalMax !== null) {
                return (
                  <Text type="secondary">
                    {r.normalMin ?? '-'} - {r.normalMax ?? '-'} {r.testUnit || ''}
                  </Text>
                );
              }
              return <Text type="secondary">—</Text>;
            },
          },
          {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            width: 100,
            render: (status: OrderTestStatus) => {
              const colors: Record<OrderTestStatus, string> = {
                PENDING: 'default',
                IN_PROGRESS: 'processing',
                COMPLETED: 'warning',
                VERIFIED: 'success',
                REJECTED: 'error',
              };
              return <Tag color={colors[status]}>{status}</Tag>;
            },
          },
          {
            title: 'Tube',
            dataIndex: 'tubeType',
            key: 'tubeType',
            width: 90,
            render: (v: string | null) => (v ? <Tag color="purple">{v.replace('_', ' ')}</Tag> : '—'),
          },
          {
            title: 'Actions',
            key: 'actions',
            width: 200,
            render: (_: unknown, r: WorklistItem) => (
              <Space size="small">
                {r.status !== 'VERIFIED' && r.status !== 'REJECTED' && (
                  <Button type="primary" size="small" onClick={() => handleOpenResultModal(r)}>
                    {r.resultValue !== null || r.resultText ? 'Edit' : 'Enter'}
                  </Button>
                )}
                {r.status === 'COMPLETED' && (
                  <>
                    <Tooltip title="Verify">
                      <Button
                        type="primary"
                        size="small"
                        icon={<CheckCircleOutlined />}
                        onClick={() => handleVerify(r.id)}
                        style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
                      />
                    </Tooltip>
                    <Tooltip title="Reject">
                      <Button
                        danger
                        size="small"
                        icon={<CloseCircleOutlined />}
                        onClick={() => handleOpenRejectModal(r)}
                      />
                    </Tooltip>
                  </>
                )}
                {r.status === 'VERIFIED' && (
                  <Tag icon={<CheckCircleOutlined />} color="success">Verified</Tag>
                )}
                {r.status === 'REJECTED' && (
                  <Tag icon={<CloseCircleOutlined />} color="error">Rejected</Tag>
                )}
              </Space>
            ),
          },
        ]}
      />
    </div>
  );

  return (
    <div>
      <style>{`
        .worklist-orders-table .ant-table-thead > tr > th {
          padding-top: 5px !important;
          padding-bottom: 5px !important;
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
      `}</style>
      <Title level={4} style={{ marginBottom: 16 }}>Worklist</Title>

      {/* Stats */}
      {stats && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="Pending"
                value={stats.pending}
                valueStyle={{ color: '#1890ff' }}
                prefix={<ExclamationCircleOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="Completed"
                value={stats.completed}
                valueStyle={{ color: '#faad14' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="Verified"
                value={stats.verified}
                valueStyle={{ color: '#52c41a' }}
                prefix={<CheckCircleOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic
                title="Rejected"
                value={stats.rejected}
                valueStyle={{ color: '#ff4d4f' }}
              />
            </Card>
          </Col>
        </Row>
      )}

      <Card>
        {/* Filters */}
        <Space style={{ marginBottom: 16 }} wrap>
          <Input
            placeholder="Search order #, patient, test..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onPressEnter={handleSearch}
            style={{ width: 250 }}
            allowClear
          />
          <Select
            mode="multiple"
            placeholder="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 250 }}
            options={STATUS_OPTIONS}
            allowClear
          />
          <Select
            placeholder="Department"
            value={departmentId || undefined}
            onChange={(v) => setDepartmentId(v ?? '')}
            style={{ width: 180 }}
            allowClear
            options={departments.map((d) => ({ label: `${d.code} – ${d.name}`, value: d.id }))}
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

        <Table<WorklistOrderGroup>
          className="worklist-orders-table"
          rowKey="orderId"
          columns={orderColumns}
          dataSource={groupedData}
          loading={loading}
          showHeader={false}
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
            showTotal: (t) => `Total ${t} tests`,
            onChange: (p) => setPage(p),
          }}
          scroll={{ x: 820 }}
          size="small"
        />
      </Card>

      {/* Result Entry Modal */}
      <Modal
        title={
          <Space size="middle">
            <span style={{ fontWeight: 600, fontSize: 16 }}>Enter Result</span>
            {editingItem && (
              <Tag color="blue" style={{ margin: 0 }}>{editingItem.testCode} – {editingItem.testName}</Tag>
            )}
          </Space>
        }
        open={resultModalOpen}
        onCancel={handleCloseResultModal}
        footer={null}
        width={editingItem?.resultEntryType === 'CULTURE_SENSITIVITY' ? 820 : 720}
        styles={{
          body: { paddingTop: 8 },
          header: { borderBottom: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #f0f0f0' },
        }}
      >
        {editingItem && (
          <div style={{ padding: '4px 0' }}>
            <div
              style={{
                marginBottom: 24,
                padding: 16,
                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#fafafa',
                border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #f0f0f0',
                borderRadius: 10,
              }}
            >
              <Row gutter={[24, 8]}>
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
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #f0f0f0' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Normal range</Text>
                  <div style={{ marginTop: 2 }}>
                    <Text>
                      {editingItem.normalText ||
                        `${editingItem.normalMin ?? '–'} – ${editingItem.normalMax ?? '–'} ${editingItem.testUnit || ''}`}
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
              {/* Culture & Sensitivity Form */}
              {editingItem.resultEntryType === 'CULTURE_SENSITIVITY' && (
                <div>
                  <Checkbox
                    checked={cultureNoGrowth}
                    onChange={(e) => {
                      setCultureNoGrowth(e.target.checked);
                      if (e.target.checked) {
                        setCultureOrganisms([]);
                      }
                    }}
                    style={{ marginBottom: 16, fontSize: 15 }}
                  >
                    <Text strong style={{ fontSize: 15 }}>No Growth</Text>
                  </Checkbox>

                  {!cultureNoGrowth && (
                    <div>
                      {cultureOrganisms.map((organism, oi) => (
                        <div
                          key={oi}
                          style={{
                            border: isDark ? '1px solid rgba(100,168,255,0.35)' : '1px solid #91caff',
                            borderLeft: isDark ? '3px solid #3c89e8' : '3px solid #1677ff',
                            borderRadius: 8,
                            padding: 14,
                            marginBottom: 14,
                            background: isDark ? 'rgba(255,255,255,0.03)' : '#f7fbff',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <Text strong style={{ fontSize: 14 }}>Organism {oi + 1}</Text>
                            <Button
                              danger
                              size="small"
                              icon={<DeleteOutlined />}
                              onClick={() => setCultureOrganisms((prev) => prev.filter((_, i) => i !== oi))}
                            >
                              Remove
                            </Button>
                          </div>

                          <Row gutter={12}>
                            <Col xs={24} md={14}>
                              <div style={{ marginBottom: 10 }}>
                                <Text type="secondary" style={{ fontSize: 12 }}>Organism name</Text>
                                <AutoComplete
                                  style={{ width: '100%', marginTop: 4 }}
                                  size="large"
                                  value={organism.name}
                                  onChange={(val) =>
                                    setCultureOrganisms((prev) =>
                                      prev.map((o, i) => (i === oi ? { ...o, name: val } : o))
                                    )
                                  }
                                  options={COMMON_ORGANISMS.filter(
                                    (name) =>
                                      !organism.name ||
                                      name.toLowerCase().includes(organism.name.toLowerCase())
                                  ).map((name) => ({ value: name, label: name }))}
                                  placeholder="e.g. Escherichia coli"
                                  filterOption={false}
                                />
                              </div>
                            </Col>
                            <Col xs={24} md={10}>
                              <div style={{ marginBottom: 10 }}>
                                <Text type="secondary" style={{ fontSize: 12 }}>Colony count</Text>
                                <Select
                                  style={{ width: '100%', marginTop: 4 }}
                                  size="large"
                                  value={organism.quantity}
                                  onChange={(val) =>
                                    setCultureOrganisms((prev) =>
                                      prev.map((o, i) => (i === oi ? { ...o, quantity: val } : o))
                                    )
                                  }
                                  options={[
                                    { label: '1+ (Scanty)', value: '1+' },
                                    { label: '2+ (Light)', value: '2+' },
                                    { label: '3+ (Moderate)', value: '3+' },
                                    { label: '4+ (Heavy)', value: '4+' },
                                    { label: 'Few', value: 'Few' },
                                    { label: 'Moderate', value: 'Moderate' },
                                    { label: 'Many', value: 'Many' },
                                    { label: 'Heavy', value: 'Heavy' },
                                  ]}
                                />
                              </div>
                            </Col>
                          </Row>

                          {/* Antibiotic Sensitivity Table */}
                          <div style={{ marginTop: 8 }}>
                            <Text type="secondary" style={{ fontSize: 12, marginBottom: 6, display: 'block' }}>
                              Antibiotic Sensitivity
                            </Text>
                            {organism.sensitivities.length > 0 && (
                              <div style={{ border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #e8e8e8', borderRadius: 6, overflow: 'hidden', marginBottom: 8 }}>
                                <div
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: '1fr 50px 50px 50px 36px',
                                    alignItems: 'center',
                                    padding: '6px 10px',
                                    background: isDark ? 'rgba(255,255,255,0.06)' : '#f0f5ff',
                                    fontWeight: 600,
                                    fontSize: 12,
                                    gap: 4,
                                  }}
                                >
                                  <span>Antibiotic</span>
                                  <span style={{ textAlign: 'center', color: '#52c41a' }}>S</span>
                                  <span style={{ textAlign: 'center', color: '#faad14' }}>I</span>
                                  <span style={{ textAlign: 'center', color: '#ff4d4f' }}>R</span>
                                  <span></span>
                                </div>
                                {organism.sensitivities.map((sens, si) => (
                                  <div
                                    key={si}
                                    style={{
                                      display: 'grid',
                                      gridTemplateColumns: '1fr 50px 50px 50px 36px',
                                      alignItems: 'center',
                                      padding: '5px 10px',
                                      borderTop: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #f0f0f0',
                                      gap: 4,
                                    }}
                                  >
                                    <AutoComplete
                                      size="small"
                                      value={sens.antibiotic}
                                      onChange={(val) =>
                                        setCultureOrganisms((prev) =>
                                          prev.map((o, i) =>
                                            i === oi
                                              ? {
                                                ...o,
                                                sensitivities: o.sensitivities.map((s, j) =>
                                                  j === si ? { ...s, antibiotic: val } : s
                                                ),
                                              }
                                              : o
                                          )
                                        )
                                      }
                                      options={COMMON_ANTIBIOTICS.filter(
                                        (name) =>
                                          !sens.antibiotic ||
                                          name.toLowerCase().includes(sens.antibiotic.toLowerCase())
                                      ).map((name) => ({ value: name, label: name }))}
                                      placeholder="Antibiotic name"
                                      filterOption={false}
                                      style={{ width: '100%' }}
                                    />
                                    <Radio.Group
                                      size="small"
                                      value={sens.result}
                                      onChange={(e) =>
                                        setCultureOrganisms((prev) =>
                                          prev.map((o, i) =>
                                            i === oi
                                              ? {
                                                ...o,
                                                sensitivities: o.sensitivities.map((s, j) =>
                                                  j === si ? { ...s, result: e.target.value } : s
                                                ),
                                              }
                                              : o
                                          )
                                        )
                                      }
                                      style={{ display: 'contents' }}
                                    >
                                      <Radio.Button
                                        value="S"
                                        style={{
                                          textAlign: 'center',
                                          padding: '0 4px',
                                          ...(sens.result === 'S'
                                            ? { backgroundColor: '#f6ffed', borderColor: '#52c41a', color: '#52c41a' }
                                            : {}),
                                        }}
                                      >
                                        S
                                      </Radio.Button>
                                      <Radio.Button
                                        value="I"
                                        style={{
                                          textAlign: 'center',
                                          padding: '0 4px',
                                          ...(sens.result === 'I'
                                            ? { backgroundColor: '#fffbe6', borderColor: '#faad14', color: '#faad14' }
                                            : {}),
                                        }}
                                      >
                                        I
                                      </Radio.Button>
                                      <Radio.Button
                                        value="R"
                                        style={{
                                          textAlign: 'center',
                                          padding: '0 4px',
                                          ...(sens.result === 'R'
                                            ? { backgroundColor: '#fff2f0', borderColor: '#ff4d4f', color: '#ff4d4f' }
                                            : {}),
                                        }}
                                      >
                                        R
                                      </Radio.Button>
                                    </Radio.Group>
                                    <Button
                                      danger
                                      type="text"
                                      size="small"
                                      icon={<MinusCircleOutlined />}
                                      onClick={() =>
                                        setCultureOrganisms((prev) =>
                                          prev.map((o, i) =>
                                            i === oi
                                              ? { ...o, sensitivities: o.sensitivities.filter((_, j) => j !== si) }
                                              : o
                                          )
                                        )
                                      }
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                            <Button
                              type="dashed"
                              size="small"
                              icon={<PlusOutlined />}
                              onClick={() =>
                                setCultureOrganisms((prev) =>
                                  prev.map((o, i) =>
                                    i === oi
                                      ? { ...o, sensitivities: [...o.sensitivities, { antibiotic: '', result: 'S' as const }] }
                                      : o
                                  )
                                )
                              }
                            >
                              Add Antibiotic
                            </Button>
                          </div>
                        </div>
                      ))}

                      <Button
                        type="dashed"
                        block
                        icon={<PlusOutlined />}
                        onClick={() =>
                          setCultureOrganisms((prev) => [
                            ...prev,
                            { name: '', quantity: '3+', sensitivities: [] },
                          ])
                        }
                        style={{ marginBottom: 16 }}
                      >
                        Add Organism
                      </Button>
                    </div>
                  )}

                  {/* Comments */}
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>Comments (optional)</Text>
                    <Input.TextArea
                      value={cultureComments}
                      onChange={(e) => setCultureComments(e.target.value)}
                      rows={2}
                      placeholder="Additional notes..."
                      style={{ marginTop: 4 }}
                    />
                  </div>
                </div>
              )}

              {/* Regular result fields (non-culture) */}
              {editingItem.resultEntryType !== 'CULTURE_SENSITIVITY' && (editingItem.parameterDefinitions?.length ?? 0) === 0 && (
                <>
                  {editingItem.resultEntryType === 'QUALITATIVE' ||
                    editingItem.resultEntryType === 'TEXT' ? (
                    <Row gutter={16}>
                      <Col xs={24} md={16}>
                        <Form.Item
                          name="resultText"
                          label={
                            editingItem.resultEntryType === 'QUALITATIVE'
                              ? 'Result text (select)'
                              : 'Result text'
                          }
                          rules={
                            editingItem.resultEntryType === 'QUALITATIVE'
                              ? [{ required: true, message: 'Select or enter a result text value' }]
                              : undefined
                          }
                        >
                          {(editingItem.resultEntryType === 'QUALITATIVE' &&
                            (editingItem.resultTextOptions?.length ?? 0) > 0) ? (
                            <Select
                              allowClear
                              showSearch
                              size="large"
                              placeholder="Select result text"
                              options={[
                                ...(editingItem.resultTextOptions ?? []).map((option) => ({
                                  label: option.flag ? `${option.value} (${option.flag})` : option.value,
                                  value: option.value,
                                })),
                                ...(editingItem.allowCustomResultText
                                  ? [{ label: 'Other (type manually)', value: '__other__' }]
                                  : []),
                              ]}
                            />
                          ) : (
                            <Input
                              placeholder="e.g. Positive, Negative, Reactive"
                              size="large"
                            />
                          )}
                        </Form.Item>
                      </Col>
                    </Row>
                  ) : (
                    <Row gutter={16}>
                      <Col xs={24} md={12}>
                        <Form.Item
                          name="resultValue"
                          label={`Result value${editingItem.testUnit ? ` (${editingItem.testUnit})` : ''}`}
                        >
                          <InputNumber
                            style={{ width: '100%' }}
                            placeholder="Enter numeric result"
                            precision={4}
                            size="large"
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={12}>
                        <Form.Item
                          name="resultText"
                          label="Result text (optional)"
                        >
                          <Input placeholder="Optional qualitative text" size="large" />
                        </Form.Item>
                      </Col>
                    </Row>
                  )}

                  {editingItem.resultEntryType === 'QUALITATIVE' &&
                    editingItem.allowCustomResultText && (
                      <Form.Item noStyle shouldUpdate>
                        {() =>
                          resultForm.getFieldValue('resultText') === '__other__' ? (
                            <Row gutter={16}>
                              <Col xs={24} md={16}>
                                <Form.Item
                                  name="customResultText"
                                  label="Custom result text"
                                  rules={[{ required: true, message: 'Enter custom result text' }]}
                                >
                                  <Input placeholder="Type custom result value" size="large" />
                                </Form.Item>
                              </Col>
                            </Row>
                          ) : null
                        }
                      </Form.Item>
                    )}
                </>
              )}

              {editingItem.resultEntryType !== 'CULTURE_SENSITIVITY' && (editingItem.parameterDefinitions?.length ?? 0) > 0 && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <Text strong style={{ fontSize: 14 }}>Parameters</Text>
                    <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>Enter result parameters for this test</Text>
                  </div>
                  <Row gutter={[20, 0]}>
                    {editingItem.parameterDefinitions!.map((def) => (
                      <Form.Item noStyle key={def.code} shouldUpdate={(prev, curr) => prev?.resultParameters?.[def.code] !== curr?.resultParameters?.[def.code]}>
                        {() => {
                          const params = resultForm.getFieldValue('resultParameters') ?? {};
                          const val = params[def.code];
                          const isAbnormal = (def.normalOptions?.length ?? 0) > 0 && val != null && String(val).trim() !== '' && val !== '__other__' && !def.normalOptions!.includes(String(val).trim());
                          const labelNode = isAbnormal ? (
                            <Space size={6}>
                              <span>{def.label}</span>
                              <Tag color="orange">Abnormal</Tag>
                            </Space>
                          ) : def.label;
                          return (
                            <Col xs={24} md={12}>
                              <Form.Item
                                name={['resultParameters', def.code]}
                                label={labelNode}
                                style={{ marginBottom: 16 }}
                              >
                                {def.type === 'select' ? (
                                  <Select
                                    allowClear
                                    placeholder={`Select ${def.label} or Other to type`}
                                    size="large"
                                    options={[
                                      ...(def.options ?? []).map((o) => ({ label: o, value: o })),
                                      { label: 'Other (enter manually)', value: '__other__' },
                                    ]}
                                    showSearch
                                    optionFilterProp="label"
                                  />
                                ) : (
                                  <Input placeholder={`Enter ${def.label}`} size="large" />
                                )}
                              </Form.Item>
                            </Col>
                          );
                        }}
                      </Form.Item>
                    ))}
                  </Row>
                  {editingItem.parameterDefinitions!.some((def) => def.type === 'select') && (
                    <Form.Item noStyle shouldUpdate={(prev, curr) => {
                      const prevKeys = prev?.resultParameters ? Object.keys(prev.resultParameters) : [];
                      const currKeys = curr?.resultParameters ? Object.keys(curr.resultParameters) : [];
                      return prevKeys.some((k) => prev.resultParameters?.[k] === '__other__') !==
                        currKeys.some((k) => curr.resultParameters?.[k] === '__other__');
                    }}>
                      {() => {
                        const params = resultForm.getFieldValue('resultParameters') ?? {};
                        return (
                          <Row gutter={[20, 0]}>
                            {editingItem.parameterDefinitions!.filter((def) => def.type === 'select').map((def) =>
                              params[def.code] === '__other__' ? (
                                <Col xs={24} md={12} key={`${def.code}-other`}>
                                  <Form.Item
                                    name={['resultParametersCustom', def.code]}
                                    label={`${def.label} (specify)`}
                                    rules={[{ required: true, message: `Type ${def.label}` }]}
                                    style={{ marginBottom: 16 }}
                                  >
                                    <Input placeholder={`Type ${def.label}...`} size="large" />
                                  </Form.Item>
                                </Col>
                              ) : null
                            )}
                          </Row>
                        );
                      }}
                    </Form.Item>
                  )}
                </>
              )}

              <Form.Item style={{ marginBottom: 0, marginTop: 24 }}>
                <Space style={{ width: '100%', justifyContent: 'flex-end' }} size="middle">
                  <Button onClick={handleCloseResultModal} size="large">Cancel</Button>
                  <Button type="primary" htmlType="submit" loading={submitting} size="large">
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
