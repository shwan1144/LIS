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
  Statistic,
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
  type DepartmentDto,
  type ShiftDto,
  type StatisticsDto,
} from '../api/client';
import { useAuth } from '../contexts/AuthContext';

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

  const [data, setData] = useState<StatisticsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [shifts, setShifts] = useState<ShiftDto[]>([]);
  const [departments, setDepartments] = useState<DepartmentDto[]>([]);
  const [shiftFilter, setShiftFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(30, 'day'),
    dayjs(),
  ]);

  const buildParams = () => ({
    startDate: range[0].format('YYYY-MM-DD'),
    endDate: range[1].format('YYYY-MM-DD'),
    shiftId: shiftFilter !== 'all' ? shiftFilter : undefined,
    departmentId: departmentFilter !== 'all' ? departmentFilter : undefined,
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
      const [shiftRows, departmentRows] = await Promise.all([getShifts(), getDepartments()]);
      setShifts(shiftRows ?? []);
      setDepartments(departmentRows ?? []);
    } catch {
      setShifts([]);
      setDepartments([]);
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

  const handleExportCSV = () => {
    if (!data) return;

    const lines: string[] = [
      'Section,Key,Value',
      `Filter,Start Date,${range[0].format('YYYY-MM-DD')}`,
      `Filter,End Date,${range[1].format('YYYY-MM-DD')}`,
      `Filter,Shift,${selectedShiftLabel}`,
      `Filter,Department,${selectedDepartmentLabel}`,
      `KPI,Profit (IQD),${Math.round(data.profit ?? 0)}`,
      `KPI,Orders,${data.orders.total}`,
      `KPI,Department test,${data.departmentTestTotal}`,
      `KPI,Total test,${data.tests.total}`,
    ];

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
    downloadBlob(
      blob,
      `statistics-${range[0].format('YYYY-MM-DD')}-to-${range[1].format('YYYY-MM-DD')}-${shiftToken}-${departmentToken}.csv`,
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
      downloadBlob(
        blob,
        `statistics-${range[0].format('YYYY-MM-DD')}-to-${range[1].format('YYYY-MM-DD')}-${shiftToken}-${departmentToken}.pdf`,
      );
      message.success('PDF downloaded');
    } catch {
      message.error('Failed to download PDF');
    } finally {
      setPdfLoading(false);
    }
  };

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

  return (
    <div>
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

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={12} lg={6}>
          <Card>
            <Statistic title="Profit (IQD)" value={formatCurrency(profit)} prefix={<DollarOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={12} lg={6}>
          <Card>
            <Statistic title="Orders" value={orders.total} prefix={<FileTextOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={12} lg={6}>
          <Card>
            <Statistic title="Department test" value={departmentTestTotal} prefix={<ApartmentOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={12} lg={6}>
          <Card>
            <Statistic title="Total test" value={tests.total} prefix={<ExperimentOutlined />} />
          </Card>
        </Col>
      </Row>

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

