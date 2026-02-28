import { useState, useEffect } from 'react';
import { Card, Form, Select, Button, message, Typography } from 'antd';
import { getLabSettings, updateLabSettings, type LabSettingsDto } from '../../api/client';

const { Title, Text } = Typography;

export function SettingsLabelPage() {
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
        labelSequenceBy: data.labelSequenceBy ?? 'tube_type',
        sequenceResetBy: data.sequenceResetBy ?? 'day',
      });
    } catch {
      message.error('Failed to load label settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSubmit = async (values: {
    labelSequenceBy: 'tube_type' | 'department';
    sequenceResetBy: 'day' | 'shift';
  }) => {
    setSaving(true);
    try {
      const updated = await updateLabSettings(values);
      setSettings(updated);
      message.success('Label settings saved');
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
      <Title level={4}>Label &amp; sequence</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Configure how the tube sequence number is calculated on sample labels. Sequence restarts from 1 each day or each shift.
      </Text>
      <Card loading={loading} style={{ maxWidth: 480 }}>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            labelSequenceBy: 'tube_type',
            sequenceResetBy: 'day',
          }}
        >
          <Form.Item
            name="labelSequenceBy"
            label="Sequence by"
            rules={[{ required: true }]}
          >
            <Select
              options={[
                { value: 'tube_type', label: 'Tube type (e.g. SERUM 1,2,3… / EDTA 1,2,3…)' },
                { value: 'department', label: 'Department (e.g. Chemistry 1,2,3… / Hematology 1,2,3…)' },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="sequenceResetBy"
            label="Sequence resets"
            rules={[{ required: true }]}
          >
            <Select
              options={[
                { value: 'day', label: 'Per day (1, 2, 3… from midnight)' },
                { value: 'shift', label: 'Per shift (1, 2, 3… at start of each shift)' },
              ]}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={saving}>
              Save
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
