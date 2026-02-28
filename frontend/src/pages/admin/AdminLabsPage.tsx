import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  EditOutlined,
  EyeOutlined,
  LinkOutlined,
  PlusOutlined,
  PoweroffOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  createAdminLab,
  getAdminLabsPage,
  setAdminLabStatus,
  updateAdminLab,
  type AdminLabDto,
} from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { ADMIN_LAB_SCOPE_EVENT, ADMIN_SELECTED_LAB_KEY } from '../../utils/admin-ui';

const { Title, Text } = Typography;
const DEFAULT_PAGE_SIZE = 25;

type StatusFilter = 'all' | 'active' | 'disabled';

interface LabFormValues {
  name: string;
  code: string;
  subdomain?: string;
  timezone?: string;
  isActive?: boolean;
}

export function AdminLabsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canMutate = user?.role === 'SUPER_ADMIN';

  const [labs, setLabs] = useState<AdminLabDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);

  const [searchText, setSearchText] = useState('');
  const [searchApplied, setSearchApplied] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const [form] = Form.useForm<LabFormValues>();
  const [labModalOpen, setLabModalOpen] = useState(false);
  const [savingLab, setSavingLab] = useState(false);
  const [editingLab, setEditingLab] = useState<AdminLabDto | null>(null);

  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [statusReason, setStatusReason] = useState('');
  const [statusTarget, setStatusTarget] = useState<AdminLabDto | null>(null);
  const [nextStatusActive, setNextStatusActive] = useState<boolean>(true);
  const [savingStatus, setSavingStatus] = useState(false);

  const activeFilterTags = useMemo(() => {
    const tags: string[] = [];
    if (statusFilter !== 'all') {
      tags.push(`Status: ${statusFilter === 'active' ? 'Active' : 'Disabled'}`);
    }
    if (searchApplied) {
      tags.push(`Search: ${searchApplied}`);
    }
    return tags;
  }, [searchApplied, statusFilter]);

  const loadLabs = useCallback(async () => {
    setLoading(true);
    setErrorText(null);
    try {
      const result = await getAdminLabsPage({
        q: searchApplied || undefined,
        status: statusFilter,
        page,
        size,
      });
      setLabs(result.items);
      setTotal(result.total);
    } catch (error) {
      const msg = getErrorMessage(error) || 'Failed to load labs';
      setErrorText(msg);
      setLabs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, searchApplied, size, statusFilter]);

  useEffect(() => {
    void loadLabs();
  }, [loadLabs]);

  const openCreateLab = () => {
    setEditingLab(null);
    form.resetFields();
    form.setFieldsValue({ timezone: 'UTC', isActive: true });
    setLabModalOpen(true);
  };

  const openEditLab = (lab: AdminLabDto) => {
    setEditingLab(lab);
    form.resetFields();
    form.setFieldsValue({
      name: lab.name,
      code: lab.code,
      subdomain: lab.subdomain ?? undefined,
      timezone: lab.timezone || 'UTC',
    });
    setLabModalOpen(true);
  };

  const handleSaveLab = async () => {
    if (!canMutate) {
      message.warning('Read-only mode: AUDITOR cannot modify labs');
      return;
    }
    const values = await form.validateFields().catch(() => null);
    if (!values) return;

    setSavingLab(true);
    try {
      if (editingLab) {
        await updateAdminLab(editingLab.id, {
          name: values.name?.trim(),
          code: values.code?.trim(),
          subdomain: values.subdomain?.trim() || undefined,
          timezone: values.timezone?.trim() || undefined,
        });
        message.success('Lab updated');
      } else {
        await createAdminLab({
          name: values.name?.trim(),
          code: values.code?.trim(),
          subdomain: values.subdomain?.trim() || undefined,
          timezone: values.timezone?.trim() || undefined,
          isActive: values.isActive ?? true,
        });
        message.success('Lab created');
      }
      setLabModalOpen(false);
      setPage(1);
      await loadLabs();
    } catch (error) {
      message.error(getErrorMessage(error) || 'Failed to save lab');
    } finally {
      setSavingLab(false);
    }
  };

  const openStatusModal = (lab: AdminLabDto, nextActive: boolean) => {
    setStatusTarget(lab);
    setNextStatusActive(nextActive);
    setStatusReason('');
    setStatusModalOpen(true);
  };

  const handleStatusChange = async () => {
    if (!canMutate) {
      message.warning('Read-only mode: AUDITOR cannot change lab status');
      return;
    }
    if (!statusTarget) return;
    const reason = statusReason.trim();
    if (reason.length < 3) {
      message.error('Reason must be at least 3 characters');
      return;
    }

    setSavingStatus(true);
    try {
      await setAdminLabStatus(statusTarget.id, {
        isActive: nextStatusActive,
        reason,
      });
      message.success(nextStatusActive ? 'Lab enabled' : 'Lab disabled');
      setStatusModalOpen(false);
      setStatusTarget(null);
      await loadLabs();
    } catch (error) {
      message.error(getErrorMessage(error) || 'Failed to change lab status');
    } finally {
      setSavingStatus(false);
    }
  };

  const applyScopeAndOpenDetails = (lab: AdminLabDto) => {
    localStorage.setItem(ADMIN_SELECTED_LAB_KEY, lab.id);
    window.dispatchEvent(new CustomEvent(ADMIN_LAB_SCOPE_EVENT, { detail: { labId: lab.id } }));
    navigate(`/labs/${lab.id}`);
  };

  const resetFilters = () => {
    setSearchText('');
    setSearchApplied('');
    setStatusFilter('all');
    setPage(1);
    setSize(DEFAULT_PAGE_SIZE);
  };

  const columns: ColumnsType<AdminLabDto> = [
    {
      title: 'Lab Name',
      dataIndex: 'name',
      key: 'name',
      render: (value: string) => <strong>{value}</strong>,
    },
    {
      title: 'Code',
      dataIndex: 'code',
      key: 'code',
      width: 120,
    },
    {
      title: 'Subdomain',
      dataIndex: 'subdomain',
      key: 'subdomain',
      width: 260,
      render: (value: string | null) => {
        if (!value) return '-';
        const portalUrl = buildLabPortalUrl(value);
        return (
          <Space size={6}>
            <Text code>{value}</Text>
            {portalUrl ? (
              <Tooltip title={portalUrl}>
                <Button
                  size="small"
                  type="link"
                  icon={<LinkOutlined />}
                  onClick={() => window.open(portalUrl, '_blank', 'noopener,noreferrer')}
                >
                  Open portal
                </Button>
              </Tooltip>
            ) : null}
          </Space>
        );
      },
    },
    {
      title: 'Users',
      dataIndex: 'usersCount',
      key: 'usersCount',
      width: 100,
      align: 'right',
      render: (value: number | undefined) => value ?? 0,
    },
    {
      title: 'Orders (30d)',
      dataIndex: 'orders30dCount',
      key: 'orders30dCount',
      width: 130,
      align: 'right',
      render: (value: number | undefined) => value ?? 0,
    },
    {
      title: 'Status',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 110,
      render: (value: boolean) =>
        value ? <Tag color="green">Active</Tag> : <Tag color="red">Disabled</Tag>,
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (value: string) => formatDate(value),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 260,
      render: (_: unknown, row) => (
        <Space size="small" wrap>
          <Button size="small" icon={<EyeOutlined />} onClick={() => applyScopeAndOpenDetails(row)}>
            View
          </Button>
          {canMutate ? (
            <Button size="small" icon={<EditOutlined />} onClick={() => openEditLab(row)}>
              Edit
            </Button>
          ) : null}
          {canMutate ? (
            <Button
              size="small"
              danger={row.isActive}
              icon={<PoweroffOutlined />}
              onClick={() => openStatusModal(row, !row.isActive)}
            >
              {row.isActive ? 'Disable' : 'Enable'}
            </Button>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Title level={4} style={{ marginTop: 0 }}>
        Labs
      </Title>
      <Text type="secondary">Create, edit, and control lab status from platform admin.</Text>

      <Card style={{ marginTop: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
            <Space wrap>
              <Input.Search
                allowClear
                placeholder="Search lab by name/code/subdomain"
                style={{ width: 320 }}
                onSearch={(value) => {
                  setSearchApplied(value.trim());
                  setPage(1);
                }}
                onChange={(event) => setSearchText(event.target.value)}
                value={searchText}
              />
              <Select<StatusFilter>
                value={statusFilter}
                style={{ width: 160 }}
                options={[
                  { label: 'All statuses', value: 'all' },
                  { label: 'Active', value: 'active' },
                  { label: 'Disabled', value: 'disabled' },
                ]}
                onChange={(value) => {
                  setStatusFilter(value);
                  setPage(1);
                }}
              />
              <Button onClick={resetFilters}>Reset filters</Button>
            </Space>

            <Space>
              <Button icon={<ReloadOutlined />} onClick={() => void loadLabs()}>
                Retry
              </Button>
              {canMutate ? (
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreateLab}>
                  Create Lab
                </Button>
              ) : null}
            </Space>
          </Space>

          {activeFilterTags.length ? (
            <Space wrap>
              {activeFilterTags.map((tag) => (
                <Tag key={tag}>{tag}</Tag>
              ))}
            </Space>
          ) : null}

          {errorText ? (
            <Alert
              type="error"
              showIcon
              message={errorText}
              action={
                <Button size="small" onClick={() => void loadLabs()}>
                  Retry
                </Button>
              }
            />
          ) : null}

          <Table
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={labs}
            locale={{ emptyText: 'No labs found for current filters.' }}
            pagination={{
              current: page,
              pageSize: size,
              total,
              showSizeChanger: true,
              showTotal: (value) => `${value} labs`,
              onChange: (nextPage, nextSize) => {
                setPage(nextPage);
                if (nextSize && nextSize !== size) {
                  setSize(nextSize);
                }
              },
            }}
          />
        </Space>
      </Card>

      <Modal
        title={editingLab ? 'Edit Lab' : 'Create Lab'}
        open={labModalOpen}
        onCancel={() => setLabModalOpen(false)}
        onOk={() => void handleSaveLab()}
        okText={editingLab ? 'Save changes' : 'Create'}
        confirmLoading={savingLab}
        destroyOnClose
      >
        <Form<LabFormValues>
          form={form}
          layout="vertical"
          initialValues={{ timezone: 'UTC', isActive: true }}
        >
          <Form.Item
            name="name"
            label="Lab Name"
            rules={[
              { required: true, message: 'Enter lab name' },
              { min: 2, message: 'Lab name is too short' },
            ]}
          >
            <Input maxLength={255} />
          </Form.Item>
          <Form.Item
            name="code"
            label="Lab Code"
            rules={[
              { required: true, message: 'Enter lab code' },
              { min: 2, message: 'Code is too short' },
              { pattern: /^[A-Za-z0-9_-]+$/, message: 'Only letters, numbers, _ and - allowed' },
            ]}
          >
            <Input maxLength={32} />
          </Form.Item>
          <Form.Item
            name="subdomain"
            label="Subdomain (optional)"
            rules={[
              {
                pattern: /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
                message: 'Use lowercase letters, numbers, and - only',
              },
            ]}
          >
            <Input maxLength={63} />
          </Form.Item>
          <Form.Item name="timezone" label="Timezone">
            <Input maxLength={64} />
          </Form.Item>
          {!editingLab ? (
            <Form.Item name="isActive" label="Active on create" valuePropName="checked">
              <Switch checkedChildren="Active" unCheckedChildren="Disabled" />
            </Form.Item>
          ) : null}
        </Form>
      </Modal>

      <Modal
        title={nextStatusActive ? 'Enable Lab' : 'Disable Lab'}
        open={statusModalOpen}
        onCancel={() => setStatusModalOpen(false)}
        onOk={() => void handleStatusChange()}
        okText={nextStatusActive ? 'Enable' : 'Disable'}
        okButtonProps={{ danger: !nextStatusActive }}
        confirmLoading={savingStatus}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text>
            {nextStatusActive ? 'Enable' : 'Disable'} lab{' '}
            <strong>{statusTarget ? `${statusTarget.name} (${statusTarget.code})` : ''}</strong>.
          </Text>
          <Text type="secondary">Reason is required for audit log.</Text>
          <Input.TextArea
            rows={4}
            value={statusReason}
            onChange={(event) => setStatusReason(event.target.value)}
            placeholder="Enter reason"
            maxLength={300}
            showCount
          />
        </Space>
      </Modal>
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function buildLabPortalUrl(subdomain: string): string | null {
  if (typeof window === 'undefined') return null;
  const host = window.location.host;
  const baseHost = host.startsWith('admin.') ? host.slice('admin.'.length) : host;
  return `${window.location.protocol}//${subdomain}.${baseHost}`;
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
