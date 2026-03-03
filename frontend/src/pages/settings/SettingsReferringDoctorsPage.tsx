import { useEffect, useState } from 'react';
import { Alert, Button, Card, Form, Input, Space, Typography, message } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { getLabSettings, updateLabSettings } from '../../api/client';

const { Title, Text } = Typography;

const MAX_REFERRING_DOCTOR_NAME_LENGTH = 80;
const MAX_REFERRING_DOCTORS_COUNT = 500;

type FormValues = {
  referringDoctors: string[];
};

function normalizeErrorMessage(error: unknown, fallback: string): string {
  const msg =
    error &&
    typeof error === 'object' &&
    'response' in error &&
    (error as { response?: { data?: { message?: string | string[] } } }).response?.data?.message;
  if (Array.isArray(msg)) {
    return msg[0] || fallback;
  }
  return msg || fallback;
}

export function SettingsReferringDoctorsPage() {
  const [form] = Form.useForm<FormValues>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const settings = await getLabSettings();
        form.setFieldsValue({
          referringDoctors: settings.referringDoctors ?? [],
        });
      } catch (error) {
        message.error(normalizeErrorMessage(error, 'Failed to load referring doctors'));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [form]);

  const handleSave = async (values: FormValues) => {
    const normalized = (values.referringDoctors ?? [])
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter(Boolean);

    if (normalized.length > MAX_REFERRING_DOCTORS_COUNT) {
      message.error(`Maximum ${MAX_REFERRING_DOCTORS_COUNT} doctors allowed`);
      return;
    }

    setSaving(true);
    try {
      const updated = await updateLabSettings({ referringDoctors: normalized });
      form.setFieldsValue({
        referringDoctors: updated.referringDoctors ?? [],
      });
      message.success('Referring doctors saved');
    } catch (error) {
      message.error(normalizeErrorMessage(error, 'Failed to save referring doctors'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Title level={4}>Referring doctors</Title>
      <Text type="secondary">
        Manage the doctor names shared for this lab in order and report workflows.
      </Text>

      <Card loading={loading} style={{ marginTop: 16, maxWidth: 860 }}>
        <Form<FormValues>
          form={form}
          layout="vertical"
          onFinish={(values) => void handleSave(values)}
          initialValues={{ referringDoctors: [] }}
        >
          <Form.List name="referringDoctors">
            {(fields, { add, remove }) => (
              <>
                {fields.length === 0 ? (
                  <Alert
                    style={{ marginBottom: 12 }}
                    type="info"
                    showIcon
                    message="No doctors added yet"
                    description="Click Add doctor to build your per-lab list."
                  />
                ) : null}

                {fields.map((field, index) => (
                  <Space
                    key={field.key}
                    align="start"
                    style={{ display: 'flex', width: '100%', marginBottom: 12 }}
                  >
                    <Form.Item
                      label={index === 0 ? 'Doctor name' : ' '}
                      name={field.name}
                      style={{ flex: 1, marginBottom: 0 }}
                      rules={[
                        {
                          validator: async (_rule, value) => {
                            const currentValue = typeof value === 'string' ? value.trim() : '';
                            if (!currentValue) {
                              throw new Error('Doctor name is required');
                            }
                            if (currentValue.length > MAX_REFERRING_DOCTOR_NAME_LENGTH) {
                              throw new Error(
                                `Maximum ${MAX_REFERRING_DOCTOR_NAME_LENGTH} characters`,
                              );
                            }

                            const allValues = (
                              form.getFieldValue('referringDoctors') as string[] | undefined
                            ) ?? [];
                            const key = currentValue.toLocaleLowerCase();
                            const duplicateCount = allValues.filter((entry) => {
                              if (typeof entry !== 'string') return false;
                              return entry.trim().toLocaleLowerCase() === key;
                            }).length;

                            if (duplicateCount > 1) {
                              throw new Error('Duplicate doctor name');
                            }
                          },
                        },
                      ]}
                    >
                      <Input
                        placeholder="e.g. Dr. Ahmed Ali"
                        maxLength={MAX_REFERRING_DOCTOR_NAME_LENGTH}
                      />
                    </Form.Item>
                    <Button
                      aria-label={`Remove doctor ${index + 1}`}
                      icon={<DeleteOutlined />}
                      danger
                      onClick={() => remove(field.name)}
                    />
                  </Space>
                ))}

                <Button
                  icon={<PlusOutlined />}
                  onClick={() => add('')}
                  disabled={fields.length >= MAX_REFERRING_DOCTORS_COUNT}
                >
                  Add doctor
                </Button>
                <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                  {fields.length}/{MAX_REFERRING_DOCTORS_COUNT} doctors
                </Text>
              </>
            )}
          </Form.List>

          <Form.Item style={{ marginTop: 20, marginBottom: 0 }}>
            <Space>
              <Button type="primary" htmlType="submit" loading={saving}>
                Save
              </Button>
              <Button onClick={() => form.resetFields()} disabled={saving}>
                Reset
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
