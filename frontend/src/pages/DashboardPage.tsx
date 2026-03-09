import { useState, useEffect } from 'react';
import { Card, Row, Col, Typography, Table, Spin, message, Space } from 'antd';
import {
  FileTextOutlined,
  ClockCircleOutlined,
  ThunderboltOutlined,
  TeamOutlined,
  BarChartOutlined,
  NotificationOutlined,
} from '@ant-design/icons';
import {
  getDashboardKpis,
  getDashboardAnnouncement,
  getOrdersTrend,
  type DashboardKpis as KpisType,
} from '../api/client';
import './DashboardPage.css';

const { Title, Text } = Typography;

export function DashboardPage() {
  const [kpis, setKpis] = useState<KpisType | null>(null);
  const [trend, setTrend] = useState<{ date: string; count: number }[]>([]);
  const [dashboardAnnouncement, setDashboardAnnouncement] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [kpisRes, trendRes, announcementRes] = await Promise.all([
          getDashboardKpis(),
          getOrdersTrend(7),
          getDashboardAnnouncement().catch(() => ({ text: null, source: 'NONE' as const })),
        ]);
        if (!cancelled) {
          setKpis(kpisRes);
          setTrend(trendRes);
          setDashboardAnnouncement(announcementRes.text ?? null);
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
    avgTatHours: null,
    totalPatients: 0,
  };

  const kpiCards = [
    {
      key: 'orders',
      label: 'Orders today',
      value: String(k.ordersToday),
      icon: <FileTextOutlined />,
      tone: 'blue',
    },
    {
      key: 'verification',
      label: 'Pending verification',
      value: String(k.pendingVerification),
      icon: <ClockCircleOutlined />,
      tone: 'teal',
    },
    {
      key: 'patients',
      label: 'Total patients',
      value: String(k.totalPatients),
      icon: <TeamOutlined />,
      tone: 'orange',
    },
    {
      key: 'tat',
      label: 'Avg TAT (hours)',
      value: k.avgTatHours === null ? '—' : String(k.avgTatHours),
      icon: <ThunderboltOutlined />,
      tone: 'purple',
    },
  ] as const;

  return (
    <div className="dashboard-page">
      {dashboardAnnouncement ? (
        <div className="dashboard-announcement-banner">
          <Space align="start" size={12}>
            <div className="dashboard-announcement-icon">
              <NotificationOutlined />
            </div>
            <div className="dashboard-announcement-copy">
              <Text className="dashboard-announcement-label">System announcement</Text>
              <Text className="dashboard-announcement-text">{dashboardAnnouncement}</Text>
            </div>
          </Space>
        </div>
      ) : null}
      <Title level={4}>Dashboard</Title>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {kpiCards.map((item) => (
          <Col key={item.key} xs={24} sm={12} lg={6}>
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

      <Row gutter={[16, 16]}>
        <Col xs={24}>
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
      </Row>
    </div>
  );
}
