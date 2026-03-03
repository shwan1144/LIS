import { useCallback, useEffect, useMemo, useState } from 'react';
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
  Typography,
  message,
} from 'antd';
import {
  CheckCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import {
  enterResult,
  getDepartments,
  getWorklistOrderTests,
  getWorklistOrders,
  getWorklistStats,
  verifyMultipleResults,
  type DepartmentDto,
  type ResultFlag,
  type TestParameterDefinition,
  type WorklistItem,
  type WorklistOrderModalDto,
  type WorklistOrderSummaryDto,
  type WorklistStats,
} from '../api/client';
import { useTheme } from '../contexts/ThemeContext';
import { WorklistStatusDashboard } from '../components/WorklistStatusDashboard';
import { useFillToViewportBottom } from '../hooks/useFillToViewportBottom';
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

function normalizeResultFlag(flag: string | null | undefined): ResultFlag | null {
  const normalized = String(flag ?? '').trim().toUpperCase();
  if (normalized === 'N') return 'N';
  if (normalized === 'H') return 'H';
  if (normalized === 'L') return 'L';
  if (normalized === 'HH') return 'HH';
  if (normalized === 'LL') return 'LL';
  if (normalized === 'POS') return 'POS';
  if (normalized === 'NEG') return 'NEG';
  if (normalized === 'ABN') return 'ABN';
  return null;
}

function resolveFlagFromResultText(
  resultText: string | null,
  options: Array<{ value: string; flag?: string | null }> | null | undefined,
): ResultFlag | null {
  if (!resultText || !options?.length) return null;
  const candidate = resultText.trim().toLowerCase();
  const matched = options.find((option) => option.value.trim().toLowerCase() === candidate);
  return normalizeResultFlag(matched?.flag ?? null);
}

function calculateNumericFlagFromRange(
  resultValue: number | null,
  normalMin: number | null,
  normalMax: number | null,
): ResultFlag | null {
  if (resultValue === null) return null;
  if (normalMin === null && normalMax === null) return null;

  if (normalMax !== null && resultValue > normalMax) {
    const criticalHigh = normalMax * 1.5;
    return resultValue > criticalHigh ? 'HH' : 'H';
  }

  if (normalMin !== null && resultValue < normalMin) {
    const criticalLow = normalMin * 0.5;
    return resultValue < criticalLow ? 'LL' : 'L';
  }

  return 'N';
}

function formatReferenceRange(item: WorklistItem): string {
  if (item.normalText?.trim()) return item.normalText.trim();
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

  const singleRoots = roots
    .filter((item) => item.testType !== 'PANEL')
    .sort(sortByOrder);
  const panelRoots = roots
    .filter((item) => item.testType === 'PANEL')
    .sort(sortByOrder);

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

function buildInitialFormValues(items: WorklistItem[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};

  for (const target of items) {
    if (target.testType === 'PANEL') {
      continue;
    }

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

    (target.parameterDefinitions ?? []).forEach((definition) => {
      if (
        definition.defaultValue != null &&
        definition.defaultValue.trim() !== '' &&
        (existingParams[definition.code] == null ||
          String(existingParams[definition.code]).trim() === '')
      ) {
        defaults[definition.code] = definition.defaultValue.trim();
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

    values[target.id] = {
      resultValue:
        target.resultEntryType === 'QUALITATIVE' || target.resultEntryType === 'TEXT'
          ? undefined
          : target.resultValue ?? undefined,
      resultText: initialResultText,
      customResultText,
      resultParameters: { ...defaults, ...resultParametersInitial },
      resultParametersCustom: resultParametersCustomInitial,
    };
  }

  return values;
}

export function WorklistPage() {
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
  const [page, setPage] = useState(1);
  const [size] = useState(25);

  const [verifyLoadingOrderId, setVerifyLoadingOrderId] = useState<string | null>(null);
  const [entryLoadingOrderId, setEntryLoadingOrderId] = useState<string | null>(null);

  const [resultModalOpen, setResultModalOpen] = useState(false);
  const [modalOrder, setModalOrder] = useState<WorklistOrderModalDto | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [liveFlags, setLiveFlags] = useState<Record<string, ResultFlag | null>>({});
  const [resultForm] = Form.useForm<any>();

  const closeEntryModal = useCallback(() => {
    setResultModalOpen(false);
    setModalOrder(null);
    setLiveFlags({});
    resultForm.resetFields();
  }, [resultForm]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getWorklistOrders({
        mode: 'entry',
        search: search.trim() || undefined,
        date: dateFilter?.format('YYYY-MM-DD'),
        departmentId: departmentId || undefined,
        page,
        size,
      });
      setRows(result.items ?? []);
      setTotal(Number(result.total ?? 0));
    } catch {
      message.error('Failed to load worklist');
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [dateFilter, departmentId, page, search, size]);

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

  const orderedModalItems = useMemo(
    () => sortModalItems(modalOrder?.items ?? []),
    [modalOrder],
  );

  const editableTargetIds = useMemo(
    () =>
      orderedModalItems
        .filter((item) => item.testType !== 'PANEL' && item.status !== 'VERIFIED')
        .map((item) => item.id),
    [orderedModalItems],
  );

  const firstPanelIndex = useMemo(
    () =>
      orderedModalItems.findIndex(
        (item) => item.testType === 'PANEL' && !item.parentOrderTestId,
      ),
    [orderedModalItems],
  );

  const focusNextEditableInput = useCallback(
    (currentTargetId: string) => {
      const idx = editableTargetIds.indexOf(currentTargetId);
      if (idx < 0) return;
      const nextTargetId = editableTargetIds[idx + 1];
      if (!nextTargetId) return;
      const targetRoot = document.querySelector(
        `[data-entry-target-id="${nextTargetId}"]`,
      ) as HTMLElement | null;
      if (!targetRoot) return;

      const focusTarget =
        targetRoot.matches('input,textarea')
          ? targetRoot
          : (targetRoot.querySelector('input,textarea') as HTMLElement | null);
      (focusTarget ?? targetRoot).focus();
    },
    [editableTargetIds],
  );

  const recomputeLiveFlags = useCallback(
    (allValues: Record<string, any>) => {
      const nextFlags: Record<string, ResultFlag | null> = {};

      for (const target of orderedModalItems) {
        if (target.testType === 'PANEL') continue;

        const values = allValues[target.id] ?? {};
        const resultEntryType = target.resultEntryType ?? 'NUMERIC';
        let resultText =
          values.resultText != null ? String(values.resultText).trim() : '';
        if (resultText === '__other__') {
          resultText =
            values.customResultText != null
              ? String(values.customResultText).trim()
              : '';
        }

        if (resultEntryType === 'QUALITATIVE' || resultEntryType === 'TEXT') {
          nextFlags[target.id] =
            resolveFlagFromResultText(
              resultText || null,
              target.resultTextOptions ?? null,
            ) ?? target.flag ?? null;
          continue;
        }

        const optionFlag = resolveFlagFromResultText(
          resultText || null,
          target.resultTextOptions ?? null,
        );
        if (optionFlag) {
          nextFlags[target.id] = optionFlag;
          continue;
        }

        const rawNumeric = values.resultValue;
        const numericValue =
          rawNumeric === null || rawNumeric === undefined || rawNumeric === ''
            ? null
            : Number(rawNumeric);
        const safeNumericValue =
          numericValue != null && Number.isFinite(numericValue)
            ? numericValue
            : null;

        nextFlags[target.id] =
          calculateNumericFlagFromRange(
            safeNumericValue,
            target.normalMin ?? null,
            target.normalMax ?? null,
          ) ?? target.flag ?? null;
      }

      setLiveFlags(nextFlags);
    },
    [orderedModalItems],
  );

  const openEntryModal = useCallback(
    async (order: WorklistOrderSummaryDto) => {
      setEntryLoadingOrderId(order.orderId);
      setModalLoading(true);
      try {
        const payload = await getWorklistOrderTests(order.orderId, {
          mode: 'entry',
          departmentId: departmentId || undefined,
        });
        setModalOrder(payload);
        const initialValues = buildInitialFormValues(sortModalItems(payload.items));
        resultForm.setFieldsValue(initialValues);
        const initialFlags: Record<string, ResultFlag | null> = {};
        for (const item of payload.items) {
          if (item.testType !== 'PANEL') {
            initialFlags[item.id] = item.flag ?? null;
          }
        }
        setLiveFlags(initialFlags);
        setResultModalOpen(true);
      } catch {
        message.error('Failed to load order tests');
      } finally {
        setModalLoading(false);
        setEntryLoadingOrderId(null);
      }
    },
    [departmentId, resultForm],
  );

  const handleVerifyOrder = useCallback(
    async (order: WorklistOrderSummaryDto) => {
      setVerifyLoadingOrderId(order.orderId);
      try {
        const payload = await getWorklistOrderTests(order.orderId, {
          mode: 'entry',
          departmentId: departmentId || undefined,
        });
        const completedIds = payload.items
          .filter((item) => item.status === 'COMPLETED')
          .map((item) => item.id);
        if (completedIds.length === 0) {
          message.warning('No completed tests to verify in this order');
          return;
        }
        const result = await verifyMultipleResults(completedIds);
        message.success(
          `Verified ${result.verified} result(s)${
            result.failed > 0 ? `, ${result.failed} failed` : ''
          }`,
        );
        await Promise.all([loadRows(), loadStats()]);
        if (modalOrder?.orderId === order.orderId) {
          const refreshed = await getWorklistOrderTests(order.orderId, {
            mode: 'entry',
            departmentId: departmentId || undefined,
          });
          setModalOrder(refreshed);
          resultForm.setFieldsValue(buildInitialFormValues(sortModalItems(refreshed.items)));
          const refreshedFlags: Record<string, ResultFlag | null> = {};
          for (const item of refreshed.items) {
            if (item.testType !== 'PANEL') {
              refreshedFlags[item.id] = item.flag ?? null;
            }
          }
          setLiveFlags(refreshedFlags);
        }
      } catch {
        message.error('Failed to verify order tests');
      } finally {
        setVerifyLoadingOrderId(null);
      }
    },
    [departmentId, loadRows, loadStats, modalOrder?.orderId, resultForm],
  );

  const handleSearch = () => {
    setPage(1);
    void loadRows();
  };

  const handleSubmitResult = async (values: Record<string, any>) => {
    if (!modalOrder) return;
    const targets = orderedModalItems.filter(
      (item) => item.testType !== 'PANEL' && item.status !== 'VERIFIED',
    );
    if (targets.length === 0) {
      message.info('No editable tests in this order');
      return;
    }

    setSubmitting(true);
    try {
      await Promise.all(
        targets.map(async (target) => {
          const itemValues = values[target.id] || {};
          const rawParams = itemValues.resultParameters ?? {};
          const rawCustomParams = itemValues.resultParametersCustom ?? {};
          const resultParamsEntries: Array<[string, string]> = [];

          for (const [code, rawValue] of Object.entries(rawParams)) {
            const value = rawValue != null ? String(rawValue).trim() : '';
            if (!value) continue;
            if (value === '__other__') {
              const customValue =
                rawCustomParams[code] != null
                  ? String(rawCustomParams[code]).trim()
                  : '';
              if (!customValue) continue;
              resultParamsEntries.push([code, customValue]);
              continue;
            }
            resultParamsEntries.push([code, value]);
          }

          const resultParameters = Object.fromEntries(resultParamsEntries);
          const hasResultParameters = Object.keys(resultParameters).length > 0;
          const resultEntryType = target.resultEntryType ?? 'NUMERIC';
          let resultValue = itemValues.resultValue ?? null;
          let resultText = itemValues.resultText?.trim() || null;

          if (resultEntryType === 'QUALITATIVE') {
            if (resultText === '__other__') {
              resultText = itemValues.customResultText?.trim() || null;
            }
            resultValue = null;
          } else if (resultEntryType === 'TEXT') {
            resultValue = null;
          }

          await enterResult(target.id, {
            resultValue,
            resultText,
            resultParameters: hasResultParameters ? resultParameters : null,
          });
        }),
      );

      message.success('Results saved');
      closeEntryModal();
      await Promise.all([loadRows(), loadStats()]);
    } catch {
      message.error('Failed to save results');
    } finally {
      setSubmitting(false);
    }
  };

  const queueColumns: ColumnsType<WorklistOrderSummaryDto> = [
    {
      title: 'Patient',
      dataIndex: 'patientName',
      key: 'patientName',
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
          <Tag style={{ margin: 0 }}>
            {record.progressTotalRoot} tests
          </Tag>
          {record.progressPending > 0 && (
            <Tag style={{ margin: 0 }}>
              Pending {record.progressPending}
            </Tag>
          )}
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
          {record.firstRejectedReason?.trim() && (
            <Text type="danger" style={{ fontSize: 11 }}>
              Reason: {record.firstRejectedReason}
            </Text>
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
      width: 220,
      render: (_: unknown, record) => (
        <Space size={6}>
          <Button
            type="primary"
            size="small"
            ghost
            loading={entryLoadingOrderId === record.orderId}
            onClick={() => {
              void openEntryModal(record);
            }}
          >
            Enter
          </Button>
          <Button
            type="primary"
            size="small"
            icon={<CheckCircleOutlined />}
            loading={verifyLoadingOrderId === record.orderId}
            disabled={!record.hasVerifiable}
            onClick={() => {
              void handleVerifyOrder(record);
            }}
          >
            Verify
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <style>{`
        .worklist-orders-table .ant-table-thead > tr > th {
          background: ${isDark ? 'rgba(255,255,255,0.06)' : '#f5f8ff'} !important;
          color: ${isDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.88)'} !important;
          border-bottom: 1px solid ${isDark ? 'rgba(255,255,255,0.14)' : '#d9e5ff'} !important;
          font-weight: 700;
          font-size: 12px;
          padding-top: 4px !important;
          padding-bottom: 4px !important;
        }
        .worklist-orders-table .ant-table-tbody > tr > td {
          padding-top: 4px !important;
          padding-bottom: 4px !important;
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
          padding: 5px 8px;
          margin-bottom: 0;
        }
        .panel-entry-modal .ant-modal-body {
          padding: 5px 8px 6px !important;
          max-height: calc(100vh - 140px);
          overflow-y: auto;
        }
        .panel-entry-modal .ant-form-item {
          margin-bottom: 0 !important;
        }
        .panel-entry-modal .ant-form-item-label {
          padding-bottom: 0 !important;
        }
        .panel-entry-modal .ant-form-item-label > label {
          font-size: 10px !important;
          line-height: 1.1 !important;
          min-height: 12px !important;
        }
        .panel-entry-modal .ant-input-number,
        .panel-entry-modal .ant-input,
        .panel-entry-modal .ant-select-selector {
          min-height: 24px !important;
          height: 24px !important;
        }
        .panel-entry-modal .ant-input-number-input {
          height: 22px !important;
        }
      `}</style>

      <Title level={4} style={{ marginTop: 0, marginBottom: 10 }}>
        Worklist
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
              className="worklist-orders-table"
              rowKey="orderId"
              columns={queueColumns}
              dataSource={rows}
              loading={loading}
              showHeader
              pagination={{
                current: page,
                pageSize: size,
                total,
                showSizeChanger: false,
                showTotal: (value) => `Total ${value} orders`,
                onChange: (nextPage) => setPage(nextPage),
              }}
              scroll={{ x: 1100 }}
              size="small"
            />
          </div>
        </Card>
      </div>

      <Modal
        title={
          <Space size={8}>
            <span style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.2 }}>
              Enter Result
            </span>
            {modalOrder && (
              <Tag color="blue" style={{ margin: 0 }}>
                {modalOrder.orderNumber}
              </Tag>
            )}
          </Space>
        }
        open={resultModalOpen}
        onCancel={() => {
          closeEntryModal();
        }}
        footer={null}
        width={980}
        className="panel-entry-modal"
        styles={{
          header: {
            borderBottom: isDark
              ? '1px solid rgba(255,255,255,0.08)'
              : '1px solid #f0f0f0',
          },
        }}
      >
        {modalLoading ? (
          <div style={{ padding: 30, textAlign: 'center' }}>
            <Text type="secondary">Loading order tests...</Text>
          </div>
        ) : modalOrder ? (
          <div>
            <div
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
              <Row gutter={[8, 2]}>
                <Col xs={24} sm={12}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Patient
                  </Text>
                  <div style={{ marginTop: 2 }}>
                    <Text strong>{modalOrder.patientName}</Text>
                  </div>
                </Col>
                <Col xs={24} sm={12}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Order
                  </Text>
                  <div style={{ marginTop: 2 }}>
                    <Text strong>{modalOrder.orderNumber}</Text>
                  </div>
                </Col>
              </Row>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                marginBottom: 6,
              }}
            >
              <Button
                onClick={() => {
                  closeEntryModal();
                }}
              >
                Cancel
              </Button>
              <Button
                type="primary"
                loading={submitting}
                onClick={() => {
                  void resultForm.submit();
                }}
              >
                Save
              </Button>
            </div>

            <Form
              form={resultForm}
              layout="vertical"
              onFinish={handleSubmitResult}
              onValuesChange={(_, allValues) => {
                recomputeLiveFlags(allValues as Record<string, any>);
              }}
            >
              <div
                style={{
                  display: 'flex',
                  backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f5f5f5',
                  borderRadius: '6px 6px 0 0',
                  borderBottom: isDark
                    ? '1px solid rgba(255,255,255,0.1)'
                    : '1px solid #e8e8e8',
                  fontWeight: 600,
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  padding: '2px 6px',
                }}
              >
                <div style={{ flex: '1 1 40%' }}>Test</div>
                <div style={{ flex: '1 1 26%' }}>Result</div>
                <div style={{ flex: '1 1 8%', textAlign: 'center' }}>Unit</div>
                <div style={{ flex: '1 1 10%', textAlign: 'center' }}>Flag</div>
                <div style={{ flex: '1 1 16%', textAlign: 'right' }}>Ref. Range</div>
              </div>

              {orderedModalItems.map((target, index) => {
                const isPanelRoot =
                  target.testType === 'PANEL' && !target.parentOrderTestId;
                const isPanelChild = Boolean(target.parentOrderTestId);
                const isReadOnly = target.status === 'VERIFIED' || isPanelRoot;
                const parameterDefinitions = target.parameterDefinitions ?? [];
                const hasParams = parameterDefinitions.length > 0;
                const displayFlag =
                  target.testType === 'PANEL'
                    ? null
                    : (liveFlags[target.id] ?? target.flag ?? null);

                return (
                  <div key={target.id}>
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
                          index < orderedModalItems.length - 1
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
                      <div style={{ flex: '1 1 40%', paddingRight: 8 }}>
                        <Space size={6}>
                          {isPanelRoot ? (
                            <Tag color="purple" style={{ margin: 0, fontSize: 10 }}>
                              Panel
                            </Tag>
                          ) : null}
                          {target.status === 'REJECTED' ? (
                            <Tag color="error" style={{ margin: 0, fontSize: 10 }}>
                              Rejected
                            </Tag>
                          ) : null}
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
                            {target.testName}
                          </Text>
                        </div>
                        {target.rejectionReason?.trim() && (
                          <Text type="danger" style={{ display: 'block', fontSize: 10 }}>
                            {target.rejectionReason}
                          </Text>
                        )}
                      </div>

                      <div style={{ flex: '1 1 26%', paddingRight: 8 }}>
                        {isPanelRoot ? (
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            Panel header
                          </Text>
                        ) : hasParams ? (
                          <Space direction="vertical" style={{ width: '100%' }} size={2}>
                            {parameterDefinitions.map((definition: TestParameterDefinition) => (
                              <Form.Item
                                key={`${target.id}-${definition.code}`}
                                name={[target.id, 'resultParameters', definition.code]}
                                style={{ marginBottom: 0 }}
                                label={
                                  <span style={{ fontSize: 10 }}>{definition.label}</span>
                                }
                              >
                                {definition.type === 'select' ? (
                                  <Select
                                    allowClear
                                    size="small"
                                    disabled={isReadOnly}
                                    data-entry-target-id={target.id}
                                    options={[
                                      ...(definition.options ?? []).map((option) => ({
                                        label: option,
                                        value: option,
                                      })),
                                      { label: 'Other...', value: '__other__' },
                                    ]}
                                    onKeyDown={(event) => {
                                      if (event.key === 'ArrowDown') {
                                        event.preventDefault();
                                        focusNextEditableInput(target.id);
                                      }
                                    }}
                                  />
                                ) : (
                                  <Input
                                    size="small"
                                    disabled={isReadOnly}
                                    data-entry-target-id={target.id}
                                    onKeyDown={(event) => {
                                      if (event.key === 'ArrowDown') {
                                        event.preventDefault();
                                        focusNextEditableInput(target.id);
                                      }
                                    }}
                                  />
                                )}
                              </Form.Item>
                            ))}
                          </Space>
                        ) : (
                          <Form.Item
                            name={[target.id, target.resultEntryType === 'NUMERIC' ? 'resultValue' : 'resultText']}
                            style={{ marginBottom: 0 }}
                          >
                            {target.resultEntryType === 'NUMERIC' ? (
                              <InputNumber
                                id={`result-input-${target.id}`}
                                data-entry-target-id={target.id}
                                style={{ width: '100%' }}
                                size="small"
                                disabled={isReadOnly}
                                onKeyDown={(event) => {
                                  if (event.key === 'ArrowDown') {
                                    event.preventDefault();
                                    focusNextEditableInput(target.id);
                                  }
                                }}
                              />
                            ) : target.resultEntryType === 'QUALITATIVE' &&
                              (target.resultTextOptions?.length ?? 0) > 0 ? (
                              <Select
                                id={`result-input-${target.id}`}
                                data-entry-target-id={target.id}
                                allowClear
                                showSearch
                                size="small"
                                disabled={isReadOnly}
                                options={[
                                  ...(target.resultTextOptions ?? []).map((option) => ({
                                    label: option.value,
                                    value: option.value,
                                  })),
                                  ...(target.allowCustomResultText
                                    ? [{ label: 'Other...', value: '__other__' }]
                                    : []),
                                ]}
                                onKeyDown={(event) => {
                                  if (event.key === 'ArrowDown') {
                                    event.preventDefault();
                                    focusNextEditableInput(target.id);
                                  }
                                }}
                              />
                            ) : (
                              <Input
                                id={`result-input-${target.id}`}
                                data-entry-target-id={target.id}
                                size="small"
                                disabled={isReadOnly}
                                onKeyDown={(event) => {
                                  if (event.key === 'ArrowDown') {
                                    event.preventDefault();
                                    focusNextEditableInput(target.id);
                                  }
                                }}
                              />
                            )}
                          </Form.Item>
                        )}
                      </div>

                      <div style={{ flex: '1 1 8%', textAlign: 'center', fontSize: 10 }}>
                        {target.testUnit || '-'}
                      </div>
                      <div style={{ flex: '1 1 10%', textAlign: 'center' }}>
                        {displayFlag ? (
                          <Tag
                            color={FLAG_COLOR[displayFlag] || 'default'}
                            style={{ margin: 0, fontSize: 10 }}
                          >
                            {FLAG_LABEL[displayFlag] || displayFlag}
                          </Tag>
                        ) : (
                          <Text type="secondary" style={{ fontSize: 10 }}>
                            -
                          </Text>
                        )}
                      </div>
                      <div style={{ flex: '1 1 16%', textAlign: 'right', fontSize: 10 }}>
                        {formatReferenceRange(target)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </Form>
          </div>
        ) : null}
      </Modal>

    </div>
  );
}
