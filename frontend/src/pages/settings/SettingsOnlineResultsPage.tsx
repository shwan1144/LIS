import { useState, useEffect } from 'react';
import { Card, Form, Switch, Button, message, Typography } from 'antd';
import { getLabSettings, updateLabSettings, type LabSettingsDto } from '../../api/client';

const { Title, Text } = Typography;

export function SettingsOnlineResultsPage() {
  const [settings, setSettings] = useState<LabSettingsDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const data = await getLabSettings();
      setSettings(data);
      form.setFieldsValue({
        enableOnlineResults: data.enableOnlineResults !== false,
      });
    } catch {
      message.error('Failed to load online result settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSubmit = async (values: { enableOnlineResults: boolean }) => {
    setSaving(true);
    try {
      const updated = await updateLabSettings({
        enableOnlineResults: values.enableOnlineResults,
      });
      setSettings(updated);
      message.success('Online result settings saved');
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : 'Failed to save';
      message.error(msg || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <Title level={4}>Online Results QR</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Control whether patients can open result status online from receipt QR.
        When disabled, receipt QR will contain only order number.
      </Text>

      <Card loading={loading} style={{ maxWidth: 520 }}>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{ enableOnlineResults: true }}
        >
          <Form.Item
            name="enableOnlineResults"
            label="Enable online patient results"
            valuePropName="checked"
          >
            <Switch checkedChildren="ON" unCheckedChildren="OFF" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={saving}>
              Save
            </Button>
          </Form.Item>
        </Form>

        {settings && (
          <Text type="secondary">
            Current: {settings.enableOnlineResults ? 'Enabled' : 'Disabled'}
          </Text>
        )}
      </Card>
    </div>
  );
}
