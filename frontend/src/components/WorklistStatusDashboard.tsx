import type { CSSProperties, ReactNode } from 'react';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { Card, Col, Row, Space, Typography } from 'antd';
import type { WorklistStats } from '../api/client';

const { Text } = Typography;

type WorklistStatusDashboardProps = {
  stats: WorklistStats | null;
  style?: CSSProperties;
};

const STATUS_ITEMS: Array<{
  key: keyof WorklistStats;
  label: string;
  color: string;
  icon: ReactNode;
}> = [
  {
    key: 'pending',
    label: 'Pending',
    color: '#1677ff',
    icon: <ExclamationCircleOutlined />,
  },
  {
    key: 'completed',
    label: 'Completed',
    color: '#faad14',
    icon: <ClockCircleOutlined />,
  },
  {
    key: 'verified',
    label: 'Verified',
    color: '#52c41a',
    icon: <CheckCircleOutlined />,
  },
  {
    key: 'rejected',
    label: 'Rejected',
    color: '#ff4d4f',
    icon: <CloseCircleOutlined />,
  },
];

export function WorklistStatusDashboard({
  stats,
  style,
}: WorklistStatusDashboardProps) {
  return (
    <Row gutter={[12, 12]} style={style}>
      {STATUS_ITEMS.map((item) => (
        <Col key={item.key} xs={12} md={12} lg={6}>
          <Card size="small" styles={{ body: { padding: '10px 12px' } }}>
            <Space direction="vertical" size={2}>
              <Text type="secondary" style={{ fontSize: 12, lineHeight: '16px' }}>
                {item.label}
              </Text>
              <Space size={8} align="center">
                <span style={{ color: item.color, lineHeight: 1 }}>
                  {item.icon}
                </span>
                <Text
                  strong
                  style={{ color: item.color, fontSize: 24, lineHeight: '24px' }}
                >
                  {stats?.[item.key] ?? 0}
                </Text>
              </Space>
            </Space>
          </Card>
        </Col>
      ))}
    </Row>
  );
}
