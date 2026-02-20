import { useEffect, useState } from 'react';
import { Button, Card, Empty, Form, Select, Space, Switch, Tag, Typography, message } from 'antd';
import { getAdminLabSettings, updateAdminLabSettings } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminLabSelection } from './useAdminLabSelection';

const { Title, Text } = Typography;

export function AdminLabOnlineResultsPage() {
  const { user } = useAuth();
  const canMutate = user?.role === 'SUPER_ADMIN';
  const { labs, selectedLab, selectedLabId, loadingLabs, selectLab } = useAdminLabSelection();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<{ enableOnlineResults: boolean }>();

  useEffect(() => {
    if (!selectedLabId) return;
    const load = async () => {
      setLoading(true);
      try {
        const data = await getAdminLabSettings(selectedLabId);
        form.setFieldsValue({
          enableOnlineResults: data.enableOnlineResults !== false,
        });
      } catch (error) {
        message.error(getErrorMessage(error) || 'Failed to load online result settings');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [form, selectedLabId]);

  const handleSave = async (values: { enableOnlineResults: boolean }) => {
    if (!selectedLabId) return;
    if (!canMutate) {
      message.warning('Read-only mode: AUDITOR cannot update settings');
      return;
    }
    setSaving(true);
    try {
      await updateAdminLabSettings(selectedLabId, {
        enableOnlineResults: values.enableOnlineResults,
      });
      message.success('Online result settings saved');
    } catch (error) {
      message.error(getErrorMessage(error) || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Title level={4} style={{ marginTop: 0 }}>
        Online Results QR
      </Title>
      <Text type="secondary">Control QR online-result visibility for each lab from admin panel.</Text>

      <Card style={{ marginTop: 16 }}>
        <div style={{ maxWidth: 420, marginBottom: 16 }}>
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
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSave}
            initialValues={{ enableOnlineResults: true }}
          >
            <Space direction="vertical" size={4} style={{ marginBottom: 16 }}>
              <Text strong>{selectedLab.name}</Text>
              <Text type="secondary">Subdomain: {selectedLab.subdomain || '-'}</Text>
              {!canMutate ? <Tag color="orange">Read-only mode</Tag> : null}
            </Space>

            <Form.Item
              name="enableOnlineResults"
              label="Enable online patient results"
              valuePropName="checked"
            >
              <Switch checkedChildren="ON" unCheckedChildren="OFF" disabled={loading || !canMutate} />
            </Form.Item>

            <Form.Item>
              <Button type="primary" htmlType="submit" loading={saving} disabled={loading || !canMutate}>
                Save
              </Button>
            </Form.Item>
          </Form>
        )}
      </Card>
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
