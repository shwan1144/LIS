import { useState, useEffect } from 'react';
import { Card, Row, Col, Typography, Statistic, Table, Spin, message } from 'antd';
import {
  FileTextOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  ThunderboltOutlined,
  TeamOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import { getDashboardKpis, getOrdersTrend, type DashboardKpis as KpisType } from '../api/client';

const { Title } = Typography;

export function DashboardPage() {
  const [kpis, setKpis] = useState<KpisType | null>(null);
  const [trend, setTrend] = useState<{ date: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [kpisRes, trendRes] = await Promise.all([
          getDashboardKpis(),
          getOrdersTrend(7),
        ]);
        if (!cancelled) {
          setKpis(kpisRes);
          setTrend(trendRes);
        }
      } catch {
        if (!cancelled) message.error('Failed to load dashboard');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    );
  }

  const k = kpis ?? {
    ordersToday: 0,
    pendingVerification: 0,
    criticalAlerts: 0,
    avgTatHours: null,
    totalPatients: 0,
  };

  return (
    <div>
      <Title level={4}>Dashboard</Title>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Orders today"
              value={k.ordersToday}
              prefix={<FileTextOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Pending verification"
              value={k.pendingVerification}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Critical alerts"
              value={k.criticalAlerts}
              prefix={<WarningOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Avg TAT (hours)"
              value={k.avgTatHours ?? '—'}
              prefix={<ThunderboltOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title="Orders trend (last 7 days)" extra={<BarChartOutlined />}>
            {trend.length === 0 ? (
              <Typography.Text type="secondary">No order data yet.</Typography.Text>
            ) : (
              <Table
                size="small"
                dataSource={trend}
                rowKey="date"
                columns={[
                  { title: 'Date', dataIndex: 'date', key: 'date' },
                  { title: 'Orders', dataIndex: 'count', key: 'count', width: 100 },
                ]}
                pagination={false}
              />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="Quick stats" extra={<TeamOutlined />}>
            <Statistic title="Total patients" value={k.totalPatients} />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
