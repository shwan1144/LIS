import { useCallback, useEffect, useMemo, useState } from 'react';
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
  type WorklistItem,
  type WorklistOrderModalDto,
  type WorklistOrderSummaryDto,
  type WorklistStats,
} from '../api/client';
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

const STATUS_COLOR: Record<WorklistItem['status'], string> = {
  PENDING: 'default',
  IN_PROGRESS: 'processing',
  COMPLETED: 'warning',
  VERIFIED: 'success',
  REJECTED: 'error',
};

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

function getPanelTargets(items: WorklistItem[], panelRootId: string): WorklistItem[] {
  const children = items.filter((item) => item.parentOrderTestId === panelRootId);
  if (children.length > 0) return children;
  const panelRoot = items.find((item) => item.id === panelRootId);
  return panelRoot ? [panelRoot] : [];
}

function collectCompletedIds(items: WorklistItem[]): string[] {
  return items
    .filter((item) => item.testType !== 'PANEL' && item.status === 'COMPLETED')
    .map((item) => item.id);
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

  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewOrder, setReviewOrder] = useState<WorklistOrderModalDto | null>(null);
  const [working, setWorking] = useState(false);
  const [openingOrderId, setOpeningOrderId] = useState<string | null>(null);

  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectTargetIds, setRejectTargetIds] = useState<string[]>([]);

  const closeReviewModal = useCallback(() => {
    setReviewModalOpen(false);
    setReviewOrder(null);
    setRejectModalOpen(false);
    setRejectTargetIds([]);
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

  const orderedReviewItems = useMemo(
    () => sortModalItems(reviewOrder?.items ?? []),
    [reviewOrder],
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

  const reloadAll = useCallback(async () => {
    await Promise.all([loadRows(), loadStats()]);
  }, [loadRows, loadStats]);

  const openReviewModal = useCallback(
    async (order: WorklistOrderSummaryDto) => {
      setOpeningOrderId(order.orderId);
      setReviewLoading(true);
      try {
        const payload = await getWorklistOrderTests(order.orderId, {
          mode: 'verify',
          departmentId: departmentId || undefined,
        });
        setReviewOrder(payload);
        setReviewModalOpen(true);
      } catch {
        message.error('Failed to load order review');
      } finally {
        setReviewLoading(false);
        setOpeningOrderId(null);
      }
    },
    [departmentId],
  );

  const verifyIds = useCallback(
    async (ids: string[], emptyMessage: string) => {
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
        await reloadAll();
        closeReviewModal();
      } catch {
        message.error('Failed to verify results');
      } finally {
        setWorking(false);
      }
    },
    [closeReviewModal, reloadAll],
  );

  const openRejectDialog = (ids: string[]) => {
    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length === 0) {
      message.warning('No completed results to reject');
      return;
    }
    setRejectTargetIds(uniqueIds);
    setRejectReason('');
    setRejectModalOpen(true);
  };

  const runReject = async () => {
    if (rejectTargetIds.length === 0 || !rejectReason.trim()) return;
    setWorking(true);
    try {
      const reason = rejectReason.trim();
      const results = await Promise.allSettled(
        rejectTargetIds.map((id) => rejectResult(id, reason)),
      );
      const success = results.filter((result) => result.status === 'fulfilled').length;
      const failed = results.filter((result) => result.status === 'rejected').length;
      message.success(`Rejected ${success} result(s)${failed > 0 ? `, ${failed} failed` : ''}`);
      await reloadAll();
      closeReviewModal();
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
      width: 150,
      render: (_: unknown, record) => (
        <Button
          type="primary"
          size="small"
          loading={openingOrderId === record.orderId}
          onClick={() => {
            void openReviewModal(record);
          }}
        >
          Review
        </Button>
      ),
    },
  ];

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
        ) : reviewOrder ? (
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
                onClick={() => {
                  void verifyIds(completedIdsInModal, 'No completed results to verify');
                }}
              >
                Verify All
              </Button>
              <Button
                danger
                icon={<CloseCircleOutlined />}
                loading={working}
                onClick={() => openRejectDialog(completedIdsInModal)}
              >
                Reject All
              </Button>
            </div>

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
              <div style={{ flex: '1 1 16%', textAlign: 'right' }}>Action</div>
            </div>

            {orderedReviewItems.map((item, index) => {
              const isPanelRoot = item.testType === 'PANEL' && !item.parentOrderTestId;
              const isPanelChild = Boolean(item.parentOrderTestId);
              const singleCompleted = item.testType !== 'PANEL' && item.status === 'COMPLETED';
              const panelCompletedIds = isPanelRoot
                ? getPanelTargets(orderedReviewItems, item.id)
                  .filter((target) => target.testType !== 'PANEL' && target.status === 'COMPLETED')
                  .map((target) => target.id)
                : [];
              const rowHasVerifyAction = isPanelRoot
                ? panelCompletedIds.length > 0
                : singleCompleted;

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

                    <div style={{ flex: '1 1 9%', textAlign: 'right', fontSize: 10 }}>
                      {formatReferenceRange(item)}
                    </div>

                    <div style={{ flex: '1 1 16%', textAlign: 'right' }}>
                      <Space size={6} style={{ justifyContent: 'flex-end' }}>
                        <Button
                          type="link"
                          size="small"
                          icon={<CheckCircleOutlined />}
                          disabled={!rowHasVerifyAction || working}
                          onClick={() => {
                            if (isPanelRoot) {
                              void verifyIds(panelCompletedIds, 'No completed panel tests to verify');
                            } else {
                              void verifyIds([item.id], 'Only completed results can be verified');
                            }
                          }}
                        >
                          Verify
                        </Button>
                        <Button
                          type="link"
                          danger
                          size="small"
                          icon={<CloseCircleOutlined />}
                          disabled={!rowHasVerifyAction || working}
                          onClick={() => {
                            if (isPanelRoot) {
                              openRejectDialog(panelCompletedIds);
                            } else {
                              openRejectDialog([item.id]);
                            }
                          }}
                        >
                          Reject
                        </Button>
                      </Space>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </Modal>

      <Modal
        title="Reject reason"
        open={rejectModalOpen}
        onCancel={() => {
          setRejectModalOpen(false);
          setRejectTargetIds([]);
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
