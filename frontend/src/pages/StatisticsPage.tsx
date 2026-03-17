import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Button,
  Card,
  Col,
  DatePicker,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Typography,
  message,
} from 'antd';
import {
  ApartmentOutlined,
  DollarOutlined,
  DownloadOutlined,
  ExperimentOutlined,
  FilePdfOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  downloadStatisticsPDF,
  getDepartments,
  getShifts,
  getStatistics,
  getSubLabs,
  type DepartmentDto,
  type ShiftDto,
  type StatisticsDto,
  type StatisticsSourceType,
  type SubLabListItemDto,
} from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import './DashboardPage.css';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

function formatCurrency(value: number): string {
  return (
    new Intl.NumberFormat('en-IQ', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Number.isFinite(value) ? value : 0) + ' IQD'
  );
}

function sanitizeFileToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'all';
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function StatisticsPage() {
  const { user } = useAuth();
  const canViewStatistics = user?.role === 'LAB_ADMIN' || user?.role === 'SUPER_ADMIN';
  const defaultMonthRange = useMemo<[dayjs.Dayjs, dayjs.Dayjs]>(
    () => [dayjs().startOf('month'), dayjs().endOf('month')],
    [],
  );

  const [data, setData] = useState<StatisticsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [shifts, setShifts] = useState<ShiftDto[]>([]);
  const [departments, setDepartments] = useState<DepartmentDto[]>([]);
  const [subLabs, setSubLabs] = useState<SubLabListItemDto[]>([]);
  const [shiftFilter, setShiftFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<StatisticsSourceType>('ALL');
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>(defaultMonthRange);

  const buildParams = () => ({
    startDate: range[0].format('YYYY-MM-DD'),
    endDate: range[1].format('YYYY-MM-DD'),
    shiftId: shiftFilter !== 'all' ? shiftFilter : undefined,
    departmentId: departmentFilter !== 'all' ? departmentFilter : undefined,
    sourceType: sourceFilter,
  });

  const loadStatistics = async () => {
    setLoading(true);
    try {
      const res = await getStatistics(buildParams());
      setData(res);
    } catch {
      message.error('Failed to load statistics');
    } finally {
      setLoading(false);
    }
  };

  const loadFilterOptions = async () => {
    try {
      const [shiftRows, departmentRows, subLabRows] = await Promise.all([
        getShifts(),
        getDepartments(),
        getSubLabs().catch(() => []),
      ]);
      setShifts(shiftRows ?? []);
      setDepartments(departmentRows ?? []);
      setSubLabs(subLabRows ?? []);
    } catch {
      setShifts([]);
      setDepartments([]);
      setSubLabs([]);
      message.warning('Failed to load shift/department filters');
    }
  };

  useEffect(() => {
    void loadStatistics();
    void loadFilterOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRangeChange = (dates: null | [dayjs.Dayjs | null, dayjs.Dayjs | null]) => {
    if (dates && dates[0] && dates[1]) {
      setRange([dates[0], dates[1]]);
    }
  };

  const handleApply = () => {
    void loadStatistics();
  };

  const selectedShiftLabel = useMemo(() => {
    if (shiftFilter === 'all') return 'All shifts';
    const selected = shifts.find((item) => item.id === shiftFilter);
    return selected ? selected.name || selected.code || selected.id : shiftFilter;
  }, [shiftFilter, shifts]);

  const selectedDepartmentLabel = useMemo(() => {
    if (departmentFilter === 'all') return 'All departments';
    const selected = departments.find((item) => item.id === departmentFilter);
    return selected ? selected.name || selected.code || selected.id : departmentFilter;
  }, [departmentFilter, departments]);

  const selectedSourceLabel = useMemo(() => {
    if (sourceFilter === 'IN_HOUSE') return 'In-house';
    if (sourceFilter === 'SUB_LAB') return 'Sub-lab';
    return 'All';
  }, [sourceFilter]);

  if (!canViewStatistics) {
    return <Navigate to="/" replace />;
  }

  if (loading && !data) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  const s = data ?? ({} as StatisticsDto);
  const orders = s.orders ?? { total: 0, byStatus: {}, byShift: [] };
  const tests = s.tests ?? { total: 0, byDepartment: [], byTest: [], byShift: [] };
  const profit = s.profit ?? 0;
  const subLabBilling = s.subLabBilling ?? {
    activeSourceType: sourceFilter,
    billableRootTests: 0,
    billableAmount: 0,
    completedRootTests: 0,
    verifiedRootTests: 0,
    inHouse: {
      billableRootTests: 0,
      billableAmount: 0,
      completedRootTests: 0,
      verifiedRootTests: 0,
    },
    bySubLab: [],
    byTest: [],
  };
  const departmentTestTotal =
    s.departmentTestTotal ??
    (departmentFilter === 'all'
      ? (tests.byDepartment ?? [])
          .filter((row) => row.departmentId != null)
          .reduce((acc, row) => acc + row.count, 0)
      : tests.total);

  const departmentRows = [...(tests.byDepartment ?? [])].sort(
    (a, b) => b.count - a.count || a.departmentName.localeCompare(b.departmentName),
  );
  const eachTestRows = [...(tests.byTest ?? [])].sort(
    (a, b) => b.count - a.count || a.testCode.localeCompare(b.testCode),
  );
  const subLabBillingById = new Map(
    (subLabBilling.bySubLab ?? []).map((row) => [row.subLabId, row] as const),
  );
  const visibleSubLabs = (() => {
    const activeSubLabs = subLabs.filter((subLab) => subLab.isActive);
    if (activeSubLabs.length) return activeSubLabs;
    return (subLabBilling.bySubLab ?? []).map((row) => ({
      id: row.subLabId,
      name: row.subLabName,
      isActive: true,
    }));
  })();
  const activeSourceType = subLabBilling.activeSourceType ?? sourceFilter;
  const payableCards = [
    {
      id: 'all',
      name: 'All',
      tone: 'green',
      billableAmount: subLabBilling.billableAmount,
      billableRootTests: subLabBilling.billableRootTests,
      verifiedRootTests: subLabBilling.verifiedRootTests,
      completedRootTests: subLabBilling.completedRootTests,
    },
    ...(activeSourceType !== 'SUB_LAB'
      ? [
          {
            id: 'in-house',
            name: 'In-house',
            tone: 'blue',
            billableAmount: subLabBilling.inHouse.billableAmount,
            billableRootTests: subLabBilling.inHouse.billableRootTests,
            verifiedRootTests: subLabBilling.inHouse.verifiedRootTests,
            completedRootTests: subLabBilling.inHouse.completedRootTests,
          },
        ]
      : []),
    ...(activeSourceType !== 'IN_HOUSE'
      ? visibleSubLabs.map((subLab) => {
          const billingRow = subLabBillingById.get(subLab.id);
          return {
            id: subLab.id,
            name: subLab.name,
            tone: 'teal',
            billableAmount: billingRow?.billableAmount ?? 0,
            billableRootTests: billingRow?.billableRootTests ?? 0,
            verifiedRootTests: billingRow?.verifiedRootTests ?? 0,
            completedRootTests: billingRow?.completedRootTests ?? 0,
          };
        })
      : []),
  ];

  const handleExportCSV = () => {
    if (!data) return;

    const lines: string[] = [
      'Section,Key,Value',
      `Filter,Start Date,${range[0].format('YYYY-MM-DD')}`,
      `Filter,End Date,${range[1].format('YYYY-MM-DD')}`,
      `Filter,Shift,${selectedShiftLabel}`,
      `Filter,Department,${selectedDepartmentLabel}`,
      `Filter,Source,${selectedSourceLabel}`,
      `KPI,Profit (IQD),${Math.round(data.profit ?? 0)}`,
      `KPI,Orders,${data.orders.total}`,
      `KPI,Department test,${data.departmentTestTotal}`,
      `KPI,Total test,${data.tests.total}`,
    ];

    payableCards.forEach((card) => {
      lines.push(`Payable,${card.name},${Math.round(card.billableAmount)}`);
    });

    data.tests.byDepartment.forEach((row) => {
      lines.push(`Department tests,${row.departmentName},${row.count}`);
    });
    data.tests.byTest.forEach((row) => {
      lines.push(`Each test,${row.testCode} - ${row.testName},${row.count}`);
    });

    const csv = lines.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const shiftToken = shiftFilter === 'all' ? 'all' : sanitizeFileToken(selectedShiftLabel);
    const departmentToken =
      departmentFilter === 'all' ? 'all' : sanitizeFileToken(selectedDepartmentLabel);
    const sourceToken = sanitizeFileToken(selectedSourceLabel);
    downloadBlob(
      blob,
      `statistics-${range[0].format('YYYY-MM-DD')}-to-${range[1].format('YYYY-MM-DD')}-${shiftToken}-${departmentToken}-${sourceToken}.csv`,
    );
    message.success('CSV downloaded');
  };

  const handleDownloadPdf = async () => {
    setPdfLoading(true);
    try {
      const blob = await downloadStatisticsPDF(buildParams());
      const shiftToken = shiftFilter === 'all' ? 'all' : sanitizeFileToken(selectedShiftLabel);
      const departmentToken =
        departmentFilter === 'all' ? 'all' : sanitizeFileToken(selectedDepartmentLabel);
      const sourceToken = sanitizeFileToken(selectedSourceLabel);
      downloadBlob(
        blob,
        `statistics-${range[0].format('YYYY-MM-DD')}-to-${range[1].format('YYYY-MM-DD')}-${shiftToken}-${departmentToken}-${sourceToken}.pdf`,
      );
      message.success('PDF downloaded');
    } catch {
      message.error('Failed to download PDF');
    } finally {
      setPdfLoading(false);
    }
  };

  const kpiCards = [
    {
      key: 'profit',
      label: 'Profit (IQD)',
      value: formatCurrency(profit),
      icon: <DollarOutlined />,
      tone: 'teal',
    },
    {
      key: 'orders',
      label: 'Orders',
      value: String(orders.total),
      icon: <FileTextOutlined />,
      tone: 'blue',
    },
    {
      key: 'department-tests',
      label: 'Department test',
      value: String(departmentTestTotal),
      icon: <ApartmentOutlined />,
      tone: 'orange',
    },
    {
      key: 'total-tests',
      label: 'Total test',
      value: String(tests.total),
      icon: <ExperimentOutlined />,
      tone: 'purple',
    },
  ] as const;

  return (
    <div className="dashboard-page">
      <Space style={{ marginBottom: 16 }} wrap>
        <Title level={4} style={{ margin: 0 }}>
          Statistics
        </Title>
        <RangePicker value={range} onChange={handleRangeChange} allowClear={false} />
        <Select
          value={shiftFilter}
          onChange={setShiftFilter}
          style={{ minWidth: 180 }}
          options={[
            { value: 'all', label: 'All shifts' },
            ...shifts.map((shift) => ({
              value: shift.id,
              label: shift.name || shift.code || shift.id,
            })),
          ]}
        />
        <Select
          value={departmentFilter}
          onChange={setDepartmentFilter}
          style={{ minWidth: 220 }}
          options={[
            { value: 'all', label: 'All departments' },
            ...departments.map((department) => ({
              value: department.id,
              label: `${department.code} - ${department.name}`,
            })),
          ]}
        />
        <Select
          value={sourceFilter}
          onChange={setSourceFilter}
          style={{ minWidth: 220 }}
          options={[
            { value: 'ALL', label: 'All' },
            { value: 'IN_HOUSE', label: 'In-house' },
            { value: 'SUB_LAB', label: 'Sub-lab' },
          ]}
        />
        <Button type="primary" onClick={handleApply} loading={loading}>
          Apply
        </Button>
        <Button icon={<DownloadOutlined />} onClick={handleExportCSV} disabled={!data}>
          Export CSV
        </Button>
        <Button
          icon={<FilePdfOutlined />}
          onClick={() => void handleDownloadPdf()}
          loading={pdfLoading}
          disabled={!data}
        >
          Download PDF
        </Button>
      </Space>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {kpiCards.map((item) => (
          <Col key={item.key} xs={24} sm={12} md={12} lg={6}>
            <Card className={`dashboard-kpi-card dashboard-kpi-card--${item.tone}`}>
              <div className="dashboard-kpi-label">{item.label}</div>
              <div className="dashboard-kpi-body">
                <div className="dashboard-kpi-icon" aria-hidden="true">
                  {item.icon}
                </div>
                <div className="dashboard-kpi-value">{item.value}</div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {payableCards.length ? (
        <section className="statistics-payable-section">
          <div className="statistics-sub-labs-header statistics-payable-header">
            <Title level={5} style={{ margin: 0 }}>
              Payable breakdown
            </Title>
            <Text type="secondary">
              These amounts follow the selected time range and the active shift, department, and source filters.
            </Text>
          </div>
          <Row gutter={[12, 12]} className="statistics-payable-grid">
            {payableCards.map((item) => (
              <Col key={item.id} xs={24} sm={12} xl={8}>
                <Card className={`dashboard-kpi-card dashboard-kpi-card--${item.tone} statistics-sub-lab-card`}>
                  <div className="dashboard-kpi-label">{item.name}</div>
                  <div className="dashboard-kpi-body">
                    <div className="dashboard-kpi-icon" aria-hidden="true">
                      <DollarOutlined />
                    </div>
                    <div className="statistics-sub-lab-card-copy">
                      <div className="statistics-sub-lab-card-value">
                        {formatCurrency(item.billableAmount)}
                      </div>
                      <div className="statistics-sub-lab-card-meta">
                        {item.billableRootTests} billable tests
                        {' • '}
                        {item.verifiedRootTests} verified
                        {' • '}
                        {item.completedRootTests} completed
                      </div>
                    </div>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        </section>
      ) : null}

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <Card title="Department tests" size="small">
            {departmentRows.length ? (
              <Table
                size="small"
                dataSource={departmentRows.map((row, idx) => ({
                  key: row.departmentId ?? `dept-${idx}`,
                  departmentName: row.departmentName,
                  count: row.count,
                }))}
                columns={[
                  { title: 'Department', dataIndex: 'departmentName', key: 'departmentName' },
                  { title: 'Count', dataIndex: 'count', key: 'count', width: 100 },
                ]}
                pagination={departmentRows.length > 10 ? { pageSize: 10 } : false}
              />
            ) : (
              <Text type="secondary">No department test data for this filter.</Text>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={14}>
          <Card title="Each test" size="small">
            {eachTestRows.length ? (
              <Table
                size="small"
                dataSource={eachTestRows.map((row) => ({ ...row, key: row.testId }))}
                columns={[
                  { title: 'Code', dataIndex: 'testCode', key: 'testCode', width: 120 },
                  { title: 'Test name', dataIndex: 'testName', key: 'testName' },
                  { title: 'Count', dataIndex: 'count', key: 'count', width: 100 },
                ]}
                pagination={eachTestRows.length > 12 ? { pageSize: 12 } : false}
              />
            ) : (
              <Text type="secondary">No test data for this filter.</Text>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
