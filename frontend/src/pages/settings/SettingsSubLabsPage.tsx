import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Empty,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  createSubLab,
  deleteSubLab,
  getSubLab,
  getSubLabs,
  getTests,
  updateSubLab,
  type SaveSubLabRequest,
  type SubLabListItemDto,
  type TestDto,
} from '../../api/client';
import './SettingsSubLabsPage.css';

const { Title, Text } = Typography;

type FormValues = {
  name: string;
  username: string;
  password?: string;
  isActive: boolean;
};

export function SettingsSubLabsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tests, setTests] = useState<TestDto[]>([]);
  const [subLabs, setSubLabs] = useState<SubLabListItemDto[]>([]);
  const [testSearch, setTestSearch] = useState('');
  const [priceByTestId, setPriceByTestId] = useState<Record<string, number | null>>({});
  const [form] = Form.useForm<FormValues>();

  const loadData = async () => {
    setLoading(true);
    try {
      const [subLabRows, testRows] = await Promise.all([getSubLabs(), getTests(true)]);
      setSubLabs(subLabRows ?? []);
      setTests((testRows ?? []).filter((row) => row.isActive));
    } catch {
      message.error('Failed to load sub-labs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const filteredTests = useMemo(() => {
    const needle = testSearch.trim().toLowerCase();
    if (!needle) return tests;
    return tests.filter((test) => {
      const label = `${test.code} ${test.name}`.toLowerCase();
      return label.includes(needle);
    });
  }, [testSearch, tests]);

  const openCreateModal = () => {
    setEditingId(null);
    setPriceByTestId({});
    form.setFieldsValue({
      name: '',
      username: '',
      password: '',
      isActive: true,
    });
    setModalOpen(true);
  };

  const openEditModal = async (id: string) => {
    setSaving(true);
    try {
      const detail = await getSubLab(id);
      setEditingId(id);
      setPriceByTestId(
        Object.fromEntries(detail.prices.map((row) => [row.testId, row.price])),
      );
      form.setFieldsValue({
        name: detail.name,
        username: detail.username ?? '',
        password: '',
        isActive: detail.isActive,
      });
      setModalOpen(true);
    } catch {
      message.error('Failed to load sub-lab');
    } finally {
      setSaving(false);
    }
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditingId(null);
    setPriceByTestId({});
    setTestSearch('');
    form.resetFields();
  };

  const handleSave = async (values: FormValues) => {
    setSaving(true);
    try {
      const prices = Object.entries(priceByTestId)
        .filter(([, price]) => price != null && Number.isFinite(price))
        .map(([testId, price]) => ({
          testId,
          price: Number(price),
        }));

      const payload: SaveSubLabRequest = {
        name: values.name.trim(),
        username: values.username.trim(),
        isActive: values.isActive,
        prices,
      };

      if (values.password?.trim()) {
        payload.password = values.password.trim();
      }

      if (editingId) {
        await updateSubLab(editingId, payload);
        message.success('Sub-lab updated');
      } else {
        await createSubLab(payload);
        message.success('Sub-lab created');
      }

      closeModal();
      void loadData();
    } catch (error: unknown) {
      const msg =
        error && typeof error === 'object' && 'response' in error
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : null;
      message.error(msg || 'Failed to save sub-lab');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSubLab(id);
      message.success('Sub-lab archived');
      void loadData();
    } catch {
      message.error('Failed to archive sub-lab');
    }
  };

  return (
    <div className="settings-sub-labs-page">
      <Space
        style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}
        align="center"
      >
        <div>
          <Title level={4} style={{ margin: 0 }}>
            Sub Labs
          </Title>
          <Text type="secondary">
            Manage external lab logins and set flat per-test pricing for referred samples.
          </Text>
        </div>
        <Button type="primary" onClick={openCreateModal}>
          Add sub-lab
        </Button>
      </Space>

      <Card>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin size="large" />
          </div>
        ) : subLabs.length === 0 ? (
          <Empty description="No sub-labs yet" />
        ) : (
          <Table
            rowKey="id"
            dataSource={subLabs}
            pagination={false}
            columns={[
              {
                title: 'Sub Lab',
                key: 'name',
                render: (_value, row) => (
                  <Space direction="vertical" size={0}>
                    <Text strong>{row.name}</Text>
                    <Text type="secondary">{row.username || 'No username'}</Text>
                  </Space>
                ),
              },
              {
                title: 'Status',
                dataIndex: 'isActive',
                key: 'isActive',
                width: 120,
                render: (isActive: boolean) =>
                  isActive ? <Tag color="green">Active</Tag> : <Tag color="red">Archived</Tag>,
              },
              {
                title: 'Priced tests',
                dataIndex: 'priceCount',
                key: 'priceCount',
                width: 120,
              },
              {
                title: 'Updated',
                dataIndex: 'updatedAt',
                key: 'updatedAt',
                width: 180,
                render: (value: string) => new Date(value).toLocaleString(),
              },
              {
                title: 'Actions',
                key: 'actions',
                width: 220,
                render: (_value, row) => (
                  <Space>
                    <Button onClick={() => void openEditModal(row.id)}>Edit</Button>
                    <Popconfirm
                      title="Archive this sub-lab?"
                      description="Historical orders stay intact. New orders and login access will be disabled."
                      okText="Archive"
                      cancelText="Cancel"
                      onConfirm={() => void handleDelete(row.id)}
                    >
                      <Button danger disabled={!row.isActive}>
                        Archive
                      </Button>
                    </Popconfirm>
                  </Space>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Modal
        open={modalOpen}
        title={editingId ? 'Edit sub-lab' : 'Add sub-lab'}
        rootClassName="settings-sub-labs-modal"
        onCancel={closeModal}
        onOk={() => void form.submit()}
        okText={editingId ? 'Save changes' : 'Create'}
        confirmLoading={saving}
        width={960}
        destroyOnHidden
      >
        <Form<FormValues> form={form} layout="vertical" onFinish={(values) => void handleSave(values)}>
          <Card size="small" title="Access" className="settings-sub-labs-card">
            <Form.Item
              name="name"
              label="Sub-lab name"
              rules={[{ required: true, message: 'Enter sub-lab name' }]}
            >
              <Input placeholder="External lab name" />
            </Form.Item>
            <Form.Item
              name="username"
              label="Username"
              rules={[{ required: true, message: 'Enter username' }]}
            >
              <Input placeholder="Shared login username" />
            </Form.Item>
            <Form.Item
              name="password"
              label={editingId ? 'Password' : 'Password'}
              extra={editingId ? 'Leave blank to keep the current password.' : undefined}
              rules={editingId ? undefined : [{ required: true, message: 'Enter password' }]}
            >
              <Input.Password placeholder={editingId ? 'Leave blank to keep current password' : 'Shared login password'} />
            </Form.Item>
            <Form.Item name="isActive" label="Active" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Card>

          <Card
            size="small"
            title="Per-test pricing"
            className="settings-sub-labs-card settings-sub-labs-pricing-card"
            style={{ marginTop: 16 }}
            extra={
              <Input
                value={testSearch}
                onChange={(event) => setTestSearch(event.target.value)}
                placeholder="Search tests"
                style={{ width: 220 }}
              />
            }
          >
            <div className="settings-sub-labs-pricing-list">
              <List
                dataSource={filteredTests}
                locale={{ emptyText: 'No tests found' }}
                renderItem={(test) => (
                  <List.Item>
                    <div className="settings-sub-labs-pricing-row">
                      <Space
                        direction="vertical"
                        size={0}
                        className="settings-sub-labs-pricing-meta"
                      >
                        <Text strong>{test.code}</Text>
                        <Text type="secondary">{test.name}</Text>
                      </Space>
                      <InputNumber
                        min={0}
                        style={{ width: 150 }}
                        placeholder="Use default"
                        value={priceByTestId[test.id] ?? null}
                        onChange={(value) =>
                          setPriceByTestId((current) => ({
                            ...current,
                            [test.id]:
                              value == null || Number.isNaN(Number(value))
                                ? null
                                : Number(value),
                          }))
                        }
                      />
                    </div>
                  </List.Item>
                )}
              />
            </div>
          </Card>
        </Form>
      </Modal>
    </div>
  );
}
