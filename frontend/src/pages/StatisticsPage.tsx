import { useState, useEffect } from 'react';
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
  Input,
  Tabs,
} from 'antd';
import {
  FileTextOutlined,
  DollarOutlined,
  ExperimentOutlined,
  ThunderboltOutlined,
  WarningOutlined,
  DownloadOutlined,
  ApiOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { getStatistics, type StatisticsDto } from '../api/client';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

function formatRevenue(value: number): string {
  return new Intl.NumberFormat('en-IQ', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value) + ' IQD';
}

export function StatisticsPage() {
  const [data, setData] = useState<StatisticsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [testFilter, setTestFilter] = useState('');
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
  const byTestFiltered = (tests.byTest ?? []).filter(
    (t) =>
      !testFilter.trim() ||
      t.testCode.toLowerCase().includes(testFilter.toLowerCase()) ||
      t.testName.toLowerCase().includes(testFilter.toLowerCase()),
  );
  const tat = s.tat ?? {
    medianMinutes: null,
    p95Minutes: null,
    withinTargetCount: 0,
    withinTargetTotal: 0,
    targetMinutes: 60,
  };
  const quality = s.quality ?? { abnormalCount: 0, criticalCount: 0, totalVerified: 0 };
  const unmatched = s.unmatched ?? { pending: 0, resolved: 0, discarded: 0, byReason: {} };
  const instrumentWorkload = s.instrumentWorkload ?? [];

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
              value={tat.medianMinutes ?? '—'}
              prefix={<ThunderboltOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Orders by status" size="small">
            <Table
              size="small"
              dataSource={Object.entries(orders.byStatus || {}).map(([status, count]) => ({
                key: status,
                status,
                count,
              }))}
              columns={[
                { title: 'Status', dataIndex: 'status', key: 'status' },
                { title: 'Count', dataIndex: 'count', key: 'count', width: 100 },
              ]}
              pagination={false}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Orders by shift" size="small">
            {orders.byShift?.length ? (
              <Table
                size="small"
                dataSource={orders.byShift.map((r, i) => ({ ...r, key: r.shiftId ?? `null-${i}` }))}
                columns={[
                  { title: 'Shift', dataIndex: 'shiftName', key: 'shiftName' },
                  { title: 'Count', dataIndex: 'count', key: 'count', width: 100 },
                ]}
                pagination={false}
              />
            ) : (
              <Text type="secondary">No data</Text>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="Tests by department" size="small">
            {tests.byDepartment?.length ? (
              <Table
                size="small"
                dataSource={tests.byDepartment.map((d, i) => ({
                  key: d.departmentId ?? `u-${i}`,
                  departmentName: d.departmentName,
                  count: d.count,
                }))}
                columns={[
                  { title: 'Department', dataIndex: 'departmentName', key: 'departmentName' },
                  { title: 'Count', dataIndex: 'count', key: 'count', width: 100 },
                ]}
                pagination={false}
              />
            ) : (
              <Text type="secondary">No data</Text>
            )}
          </Card>
        </Col>

        <Col xs={24}>
          <Card
            title="Test volume by test (e.g. CBC)"
            size="small"
            extra={
              <Input.Search
                placeholder="Search by code or name (e.g. CBC)"
                allowClear
                value={testFilter}
                onChange={(e) => setTestFilter(e.target.value)}
                style={{ width: 240 }}
              />
            }
          >
            {byTestFiltered.length ? (
              <Table
                size="small"
                dataSource={byTestFiltered.map((t) => ({ ...t, key: t.testId }))}
                columns={[
                  { title: 'Code', dataIndex: 'testCode', key: 'testCode', width: 120 },
                  { title: 'Test name', dataIndex: 'testName', key: 'testName' },
                  { title: 'Count', dataIndex: 'count', key: 'count', width: 100 },
                ]}
                pagination={byTestFiltered.length > 10 ? { pageSize: 10 } : false}
              />
            ) : (
              <Text type="secondary">
                {tests.byTest?.length
                  ? 'No tests match the search.'
                  : 'No test volume data for this period.'}
              </Text>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="TAT & quality" size="small">
            <p>
              <Text strong>Median TAT:</Text> {tat.medianMinutes != null ? `${tat.medianMinutes} min` : '—'}
              {' · '}
              <Text strong>P95:</Text> {tat.p95Minutes != null ? `${tat.p95Minutes} min` : '—'}
            </p>
            <p>
              <Text strong>Within target ({tat.targetMinutes} min):</Text>{' '}
              {tat.withinTargetCount} / {tat.withinTargetTotal}
              {tat.withinTargetTotal > 0
                ? ` (${Math.round((100 * tat.withinTargetCount) / tat.withinTargetTotal)}%)`
                : ''}
            </p>
            <p>
              <Text strong>Abnormal (H/L):</Text> {quality.abnormalCount}
              {' · '}
              <Text strong>Critical (HH/LL):</Text> {quality.criticalCount}
              {' · '}
              <Text strong>Verified:</Text> {quality.totalVerified}
            </p>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="Unmatched results" size="small" extra={<WarningOutlined />}>
            <p>
              Pending: <strong>{unmatched.pending}</strong> · Resolved: <strong>{unmatched.resolved}</strong> · Discarded: <strong>{unmatched.discarded}</strong>
            </p>
            {Object.keys(unmatched.byReason || {}).length > 0 && (
              <Table
                size="small"
                dataSource={Object.entries(unmatched.byReason).map(([reason, count]) => ({
                  key: reason,
                  reason,
                  count,
                }))}
                columns={[
                  { title: 'Reason', dataIndex: 'reason', key: 'reason' },
                  { title: 'Count', dataIndex: 'count', key: 'count', width: 80 },
                ]}
                pagination={false}
              />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Instrument workload (unmatched received)" size="small" extra={<ApiOutlined />}>
            {instrumentWorkload.length ? (
              <Table
                size="small"
                dataSource={instrumentWorkload.map((i) => ({ ...i, key: i.instrumentId }))}
                columns={[
                  { title: 'Instrument', dataIndex: 'instrumentName', key: 'instrumentName' },
                  { title: 'Count', dataIndex: 'count', key: 'count', width: 100 },
                ]}
                pagination={false}
              />
            ) : (
              <Text type="secondary">No unmatched results in period</Text>
            )}
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
