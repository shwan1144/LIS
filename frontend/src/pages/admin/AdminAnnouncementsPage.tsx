import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Empty, Input, Select, Space, Tag, Typography, message } from 'antd';
import { NotificationOutlined } from '@ant-design/icons';
import {
  getAdminGlobalDashboardAnnouncement,
  getAdminLabSettings,
  updateAdminGlobalDashboardAnnouncement,
  updateAdminLabSettings,
} from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminLabSelection } from './useAdminLabSelection';

const { Title, Text } = Typography;

export function AdminAnnouncementsPage() {
  const { user } = useAuth();
  const canMutate = user?.role === 'SUPER_ADMIN';
  const { labs, selectedLab, selectedLabId, loadingLabs, selectLab } = useAdminLabSelection();
  const [loadingGlobal, setLoadingGlobal] = useState(false);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [globalAnnouncement, setGlobalAnnouncement] = useState('');
  const [loadingLabAnnouncement, setLoadingLabAnnouncement] = useState(false);
  const [savingLabAnnouncement, setSavingLabAnnouncement] = useState(false);
  const [labAnnouncement, setLabAnnouncement] = useState('');

  useEffect(() => {
    const loadGlobal = async () => {
      setLoadingGlobal(true);
      try {
        const data = await getAdminGlobalDashboardAnnouncement();
        setGlobalAnnouncement(data.dashboardAnnouncementText ?? '');
      } catch (error) {
        message.error(getErrorMessage(error) || 'Failed to load all-labs announcement');
      } finally {
        setLoadingGlobal(false);
      }
    };
    void loadGlobal();
  }, []);

  useEffect(() => {
    if (!selectedLabId) {
      setLabAnnouncement('');
      return;
    }
    const loadLabAnnouncement = async () => {
      setLoadingLabAnnouncement(true);
      try {
        const data = await getAdminLabSettings(selectedLabId);
        setLabAnnouncement(data.dashboardAnnouncementText ?? '');
      } catch (error) {
        message.error(getErrorMessage(error) || 'Failed to load lab announcement');
      } finally {
        setLoadingLabAnnouncement(false);
      }
    };
    void loadLabAnnouncement();
  }, [selectedLabId]);

  const normalizedGlobalAnnouncement = globalAnnouncement.trim();
  const normalizedLabAnnouncement = labAnnouncement.trim();

  const globalStatus = useMemo(() => {
    if (!normalizedGlobalAnnouncement) return 'Hidden for all labs unless a lab has its own message.';
    return 'Shown on every lab dashboard unless that lab has its own specific announcement.';
  }, [normalizedGlobalAnnouncement]);

  const labStatus = useMemo(() => {
    if (!selectedLab) return 'Select a lab to manage its specific dashboard announcement.';
    if (!normalizedLabAnnouncement) {
      return normalizedGlobalAnnouncement
        ? `${selectedLab.name} currently falls back to the all-labs announcement.`
        : `${selectedLab.name} currently has no announcement.`;
    }
    return `${selectedLab.name} uses its own announcement and overrides the all-labs message.`;
  }, [normalizedGlobalAnnouncement, normalizedLabAnnouncement, selectedLab]);

  const handleSaveGlobal = async (value: string | null) => {
    if (!canMutate) {
      message.warning('Only SUPER_ADMIN can update announcements.');
      return;
    }
    setSavingGlobal(true);
    try {
      const updated = await updateAdminGlobalDashboardAnnouncement({
        dashboardAnnouncementText: value,
      });
      setGlobalAnnouncement(updated.dashboardAnnouncementText ?? '');
      message.success(
        updated.dashboardAnnouncementText
          ? 'All-labs announcement saved'
          : 'All-labs announcement cleared',
      );
    } catch (error) {
      message.error(getErrorMessage(error) || 'Failed to save all-labs announcement');
    } finally {
      setSavingGlobal(false);
    }
  };

  const handleSaveLab = async (value: string | null) => {
    if (!selectedLabId) {
      message.warning('Select a lab first.');
      return;
    }
    if (!canMutate) {
      message.warning('Only SUPER_ADMIN can update announcements.');
      return;
    }
    setSavingLabAnnouncement(true);
    try {
      const updated = await updateAdminLabSettings(selectedLabId, {
        dashboardAnnouncementText: value,
      });
      setLabAnnouncement(updated.dashboardAnnouncementText ?? '');
      message.success(
        updated.dashboardAnnouncementText
          ? 'Lab announcement saved'
          : 'Lab announcement cleared',
      );
    } catch (error) {
      message.error(getErrorMessage(error) || 'Failed to save lab announcement');
    } finally {
      setSavingLabAnnouncement(false);
    }
  };

  return (
    <div>
      <Space align="start" style={{ width: '100%', justifyContent: 'space-between' }} wrap>
        <div>
          <Title level={4} style={{ marginTop: 0 }}>
            <NotificationOutlined style={{ marginRight: 8 }} />
            Announcements
          </Title>
          <Text type="secondary">
            Manage dashboard announcements for all labs or override them for a specific lab.
          </Text>
        </div>
        {!canMutate ? <Tag color="orange">Read-only</Tag> : null}
      </Space>

      <Alert
        style={{ marginTop: 16 }}
        type="info"
        showIcon
        message="Display behavior"
        description="A lab-specific announcement overrides the all-labs announcement. If the lab-specific message is empty, that lab falls back to the all-labs message."
      />

      <Space direction="vertical" size={16} style={{ width: '100%', marginTop: 16 }}>
        <Card title="All Labs" loading={loadingGlobal}>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Text type="secondary">{globalStatus}</Text>
            <Input
              maxLength={255}
              showCount
              value={globalAnnouncement}
              onChange={(event) => setGlobalAnnouncement(event.target.value)}
              placeholder="Enter announcement for all labs"
              disabled={loadingGlobal || savingGlobal || !canMutate}
            />
            <Space wrap>
              <Button
                type="primary"
                loading={savingGlobal}
                disabled={loadingGlobal || savingGlobal || !canMutate}
                onClick={() => void handleSaveGlobal(normalizedGlobalAnnouncement || null)}
              >
                Save All-Labs Announcement
              </Button>
              <Button
                disabled={loadingGlobal || savingGlobal || !canMutate || !normalizedGlobalAnnouncement}
                onClick={() => void handleSaveGlobal(null)}
              >
                Clear
              </Button>
            </Space>
          </Space>
        </Card>

        <Card title="Specific Lab" loading={loadingLabAnnouncement && !selectedLabId}>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div style={{ maxWidth: 420 }}>
              <Text strong>Select lab</Text>
              <Select
                style={{ width: '100%', marginTop: 8 }}
                placeholder="Choose lab"
                loading={loadingLabs}
                value={selectedLabId ?? undefined}
                options={labs.map((lab) => ({
                  label: `${lab.name} (${lab.code})`,
                  value: lab.id,
                }))}
                onChange={(value) => selectLab(value)}
              />
            </div>

            {!selectedLab ? (
              <Empty description="No lab selected" />
            ) : (
              <>
                <Text type="secondary">{labStatus}</Text>
                <Input
                  maxLength={255}
                  showCount
                  value={labAnnouncement}
                  onChange={(event) => setLabAnnouncement(event.target.value)}
                  placeholder={`Enter announcement for ${selectedLab.name}`}
                  disabled={loadingLabAnnouncement || savingLabAnnouncement || !canMutate}
                />
                <Space wrap>
                  <Button
                    type="primary"
                    loading={savingLabAnnouncement}
                    disabled={loadingLabAnnouncement || savingLabAnnouncement || !canMutate}
                    onClick={() => void handleSaveLab(normalizedLabAnnouncement || null)}
                  >
                    Save Lab Announcement
                  </Button>
                  <Button
                    disabled={
                      loadingLabAnnouncement ||
                      savingLabAnnouncement ||
                      !canMutate ||
                      !normalizedLabAnnouncement
                    }
                    onClick={() => void handleSaveLab(null)}
                  >
                    Clear
                  </Button>
                </Space>
              </>
            )}
          </Space>
        </Card>
      </Space>
    </div>
  );
}

function getErrorMessage(err: unknown): string | null {
  if (!err || typeof err !== 'object' || !('response' in err)) {
    return null;
  }
  const data = (err as { response?: { data?: { message?: string | string[] } } }).response?.data;
  const msg = data?.message;
  if (Array.isArray(msg)) {
    return msg[0] ?? null;
  }
  if (typeof msg === 'string') {
    return msg;
  }
  return null;
}
