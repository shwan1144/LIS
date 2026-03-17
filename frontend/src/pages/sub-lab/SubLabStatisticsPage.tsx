import { useEffect, useState } from 'react';
import {
  Card,
  Col,
  DatePicker,
  Grid,
  Row,
  Space,
  Spin,
  Table,
  Typography,
  message,
} from 'antd';
import dayjs from 'dayjs';
import { getSubLabPortalStatistics, type StatisticsDto } from '../../api/client';
import './SubLabPortal.css';

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

function formatCurrency(value: number): string {
  return (
    new Intl.NumberFormat('en-IQ', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Number.isFinite(value) ? value : 0) + ' IQD'
  );
}

export function SubLabStatisticsPage() {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const defaultMonthRange: [dayjs.Dayjs, dayjs.Dayjs] = [
    dayjs().startOf('month'),
    dayjs().endOf('month'),
  ];
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>(defaultMonthRange);
  const [data, setData] = useState<StatisticsDto | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const result = await getSubLabPortalStatistics({
        startDate: range[0].format('YYYY-MM-DD'),
        endDate: range[1].format('YYYY-MM-DD'),
      });
      setData(result);
    } catch {
      message.error('Failed to load statistics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const billing = data?.subLabBilling ?? {
    activeSourceType: 'SUB_LAB' as const,
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

  return (
    <div className="sub-lab-portal-page">
      <Space
        className="sub-lab-page-header"
        align="center"
      >
        <div>
          <Title level={4} style={{ margin: 0 }}>
            Statistics
          </Title>
          <Text type="secondary">
            Review completed work and the amount payable for the selected period.
          </Text>
        </div>
        <Space wrap className="sub-lab-stats-toolbar">
          <RangePicker
            allowClear={false}
            value={range}
            onChange={(value) => {
              if (value?.[0] && value?.[1]) {
                setRange([value[0], value[1]]);
              }
            }}
            className="sub-lab-filter-control"
          />
          <a onClick={(event) => { event.preventDefault(); void loadData(); }}>Refresh</a>
        </Space>
      </Space>

      {loading && !data ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin size="large" />
        </div>
      ) : (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={24} md={12} xl={6}>
              <Card className="sub-lab-portal-card">
                <Text type="secondary">Orders</Text>
                <Title level={3} style={{ margin: '8px 0 0' }}>
                  {data?.orders.total ?? 0}
                </Title>
              </Card>
            </Col>
            <Col xs={24} md={12} xl={6}>
              <Card className="sub-lab-portal-card">
                <Text type="secondary">Billable root tests</Text>
                <Title level={3} style={{ margin: '8px 0 0' }}>
                  {billing.billableRootTests}
                </Title>
              </Card>
            </Col>
            <Col xs={24} md={12} xl={6}>
              <Card className="sub-lab-portal-card">
                <Text type="secondary">Completed tests</Text>
                <Title level={3} style={{ margin: '8px 0 0' }}>
                  {billing.completedRootTests}
                </Title>
              </Card>
            </Col>
            <Col xs={24} md={12} xl={6}>
              <Card className="sub-lab-portal-card">
                <Text type="secondary">Amount to pay</Text>
                <Title level={3} style={{ margin: '8px 0 0' }}>
                  {formatCurrency(billing.billableAmount)}
                </Title>
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]}>
            <Col xs={24} lg={10}>
              <Card title="Workflow visibility" size="small" className="sub-lab-portal-card">
                <Space direction="vertical" size={10}>
                  <Text>Registered orders: {data?.orders.byStatus.REGISTERED ?? 0}</Text>
                  <Text>In-progress orders: {data?.orders.byStatus.IN_PROGRESS ?? 0}</Text>
                  <Text>Completed orders: {data?.orders.byStatus.COMPLETED ?? 0}</Text>
                  <Text>Completed root tests: {billing.completedRootTests}</Text>
                  <Text>Verified root tests: {billing.verifiedRootTests}</Text>
                </Space>
              </Card>
            </Col>
            <Col xs={24} lg={14}>
              <Card title="Billable tests" size="small" className="sub-lab-portal-card">
                <Table
                  scroll={isMobile ? { x: 640 } : undefined}
                  rowKey="testId"
                  dataSource={billing.byTest}
                  pagination={billing.byTest.length > 12 ? { pageSize: 12 } : false}
                  columns={[
                    { title: 'Code', dataIndex: 'testCode', key: 'testCode', width: 120 },
                    { title: 'Test', dataIndex: 'testName', key: 'testName' },
                    { title: 'Count', dataIndex: 'count', key: 'count', width: 90 },
                    {
                      title: 'Amount',
                      dataIndex: 'amount',
                      key: 'amount',
                      width: 140,
                      render: (value: number) => formatCurrency(value),
                    },
                  ]}
                />
              </Card>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
}
