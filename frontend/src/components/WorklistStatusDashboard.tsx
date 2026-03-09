import type { CSSProperties, ReactNode } from 'react';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { Card, Col, Row, Typography } from 'antd';
import type { WorklistStats } from '../api/client';
import './WorklistStatusDashboard.css';

const { Text } = Typography;

type WorklistStatusDashboardProps = {
  stats: WorklistStats | null;
  style?: CSSProperties;
};

const STATUS_ITEMS: Array<{
  key: keyof WorklistStats;
  label: string;
  tone: 'pending' | 'completed' | 'verified' | 'rejected';
  icon: ReactNode;
}> = [
  {
    key: 'pending',
    label: 'Pending',
    tone: 'pending',
    icon: <ExclamationCircleOutlined />,
  },
  {
    key: 'completed',
    label: 'Completed',
    tone: 'completed',
    icon: <ClockCircleOutlined />,
  },
  {
    key: 'verified',
    label: 'Verified',
    tone: 'verified',
    icon: <CheckCircleOutlined />,
  },
  {
    key: 'rejected',
    label: 'Rejected',
    tone: 'rejected',
    icon: <CloseCircleOutlined />,
  },
];

export function WorklistStatusDashboard({
  stats,
  style,
}: WorklistStatusDashboardProps) {
  return (
    <Row className="worklist-status-dashboard" gutter={[12, 12]} style={style}>
      {STATUS_ITEMS.map((item) => (
        <Col key={item.key} xs={12} md={12} lg={6}>
          <Card className={`worklist-status-card worklist-status-card--${item.tone}`} size="small">
            <div className="worklist-status-card__content">
              <Text className="worklist-status-card__label" type="secondary">
                {item.label}
              </Text>
              <div className="worklist-status-card__metric">
                <span className="worklist-status-card__icon" aria-hidden="true">
                  {item.icon}
                </span>
                <Text className="worklist-status-card__value" strong>
                  {stats?.[item.key] ?? 0}
                </Text>
              </div>
            </div>
          </Card>
        </Col>
      ))}
    </Row>
  );
}
