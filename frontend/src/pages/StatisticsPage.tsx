import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Card,
  Row,
  Col,
  Typography,
  Statistic,
  Table,
  Spin,
  message,
  DatePicker,
  Button,
  Space,
  Tabs,
} from 'antd';
import {
  FileTextOutlined,
  DollarOutlined,
  ExperimentOutlined,
  ThunderboltOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getStatistics, type StatisticsDto } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

function formatRevenue(value: number): string {
  return new Intl.NumberFormat('en-IQ', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value) + ' IQD';
}

export function StatisticsPage() {
  const { user } = useAuth();
  const canViewStatistics = user?.role === 'LAB_ADMIN' || user?.role === 'SUPER_ADMIN';
  const [data, setData] = useState<StatisticsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(30, 'day'),
    dayjs(),
  ]);

  const load = async () => {
    setLoading(true);
    try {
      const start = range[0].format('YYYY-MM-DD');
      const end = range[1].format('YYYY-MM-DD');
      const res = await getStatistics({ startDate: start, endDate: end });
      setData(res);
    } catch {
      message.error('Failed to load statistics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleRangeChange = (dates: null | [dayjs.Dayjs | null, dayjs.Dayjs | null]) => {
    if (dates && dates[0] && dates[1]) {
      setRange([dates[0], dates[1]]);
    }
  };

  const handleApplyRange = () => {
    load();
  };

  const exportCSV = () => {
    if (!data) return;
    const lines: string[] = [
      'Section,Key,Value',
      `Orders,Total,${data.orders.total}`,
      `Revenue,Total (IQD),${data.revenue}`,
      `Tests,Total,${data.tests.total}`,
      `TAT,Median (min),${data.tat.medianMinutes ?? ''}`,
      `TAT,P95 (min),${data.tat.p95Minutes ?? ''}`,
      `TAT,Within target (${data.tat.targetMinutes} min),${data.tat.withinTargetCount}/${data.tat.withinTargetTotal}`,
      `Quality,Abnormal,${data.quality.abnormalCount}`,
      `Quality,Critical,${data.quality.criticalCount}`,
      `Quality,Total verified,${data.quality.totalVerified}`,
      `Unmatched,Pending,${data.unmatched.pending}`,
      `Unmatched,Resolved,${data.unmatched.resolved}`,
      `Unmatched,Discarded,${data.unmatched.discarded}`,
    ];
    data.orders.byShift.forEach((s) => {
      lines.push(`Orders by shift,${s.shiftName},${s.count}`);
    });
    data.tests.byDepartment.forEach((d) => {
      lines.push(`Tests by department,${d.departmentName},${d.count}`);
    });
    (data.tests.byTest ?? []).forEach((t) => {
      lines.push(`Test volume,${t.testCode} - ${t.testName},${t.count}`);
    });
    (data.tests.byShift ?? []).forEach((s) => {
      lines.push(`Tests per shift,${s.shiftName},${s.count}`);
    });
    data.instrumentWorkload.forEach((i) => {
      lines.push(`Instrument workload,${i.instrumentName},${i.count}`);
    });
    const csv = lines.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `statistics-${range[0].format('YYYY-MM-DD')}-to-${range[1].format('YYYY-MM-DD')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    message.success('CSV downloaded');
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
  const tat = s.tat ?? {
    medianMinutes: null,
    p95Minutes: null,
    withinTargetCount: 0,
    withinTargetTotal: 0,
    targetMinutes: 60,
  };

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <Title level={4} style={{ margin: 0 }}>
          Statistics
        </Title>
        <RangePicker
          value={range}
          onChange={handleRangeChange}
          allowClear={false}
        />
        <Button type="primary" onClick={handleApplyRange} loading={loading}>
          Apply
        </Button>
        <Button icon={<DownloadOutlined />} onClick={exportCSV} disabled={!data}>
          Export CSV
        </Button>
      </Space>

      <Tabs
        defaultActiveKey="overview"
        items={[
          {
            key: 'overview',
            label: 'Overview',
            children: (
              <>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={8} lg={6}>
          <Card>
            <Statistic
              title="Orders"
              value={orders.total}
              prefix={<FileTextOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} lg={6}>
          <Card>
            <Statistic
              title="Revenue (IQD)"
              value={formatRevenue(s.revenue ?? 0)}
              prefix={<DollarOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} lg={6}>
          <Card>
            <Statistic
              title="Tests"
              value={tests.total}
              prefix={<ExperimentOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} lg={6}>
          <Card>
            <Statistic
              title="TAT median (min)"
              value={tat.medianMinutes ?? 'N/A'}
              prefix={<ThunderboltOutlined />}
            />
          </Card>
        </Col>
      </Row>

              </>
            ),
          },
          {
            key: 'tests-per-shift',
            label: 'Tests per shift',
            children: (
              <Card title="Test count per shift (for selected period)">
                <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                  Period: {range[0].format('YYYY-MM-DD')} to {range[1].format('YYYY-MM-DD')}. Counts are number of tests (order tests) registered in each shift.
                </Text>
                {(tests.byShift ?? []).length ? (
                  <Table
                    size="small"
                    dataSource={(tests.byShift ?? []).map((r, i) => ({ ...r, key: r.shiftId ?? `no-shift-${i}` }))}
                    columns={[
                      { title: 'Shift', dataIndex: 'shiftName', key: 'shiftName' },
                      { title: 'Number of tests', dataIndex: 'count', key: 'count', width: 140 },
                    ]}
                    pagination={false}
                  />
                ) : (
                  <Text type="secondary">No test data by shift for this period.</Text>
                )}
              </Card>
            ),
          },
        ]}
      />

    </div>
  );
}
