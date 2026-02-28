import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { DeleteOutlined, EditOutlined, KeyOutlined, PlusOutlined, TeamOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  createAdminLabUser,
  deleteAdminLabUser,
  getAdminLabDepartments,
  getAdminLabShifts,
  getAdminLabUser,
  getAdminLabUsers,
  getAdminSettingsRoles,
  resetAdminLabUserPassword,
  updateAdminLabUser,
  type DepartmentDto,
  type SettingsUserDto,
  type ShiftDto,
} from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminLabSelection } from './useAdminLabSelection';

const { Title, Text } = Typography;

export function AdminLabUsersPage() {
  const { user } = useAuth();
  const canMutate = user?.role === 'SUPER_ADMIN';
  const { labs, selectedLab, selectedLabId, loadingLabs, selectLab } = useAdminLabSelection();
  const [users, setUsers] = useState<SettingsUserDto[]>([]);
  const [shifts, setShifts] = useState<ShiftDto[]>([]);
  const [departments, setDepartments] = useState<DepartmentDto[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SettingsUserDto | null>(null);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetTargetUser, setResetTargetUser] = useState<SettingsUserDto | null>(null);
  const [form] = Form.useForm();
  const [resetForm] = Form.useForm<{ password: string; reason: string }>();

  useEffect(() => {
    if (!selectedLabId) return;
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [usersData, shiftsData, departmentsData, rolesData] = await Promise.all([
          getAdminLabUsers(selectedLabId),
          getAdminLabShifts(selectedLabId),
          getAdminLabDepartments(selectedLabId),
          getAdminSettingsRoles(),
        ]);
        setUsers(usersData);
        setShifts(shiftsData);
        setDepartments(departmentsData);
        setRoles(rolesData);
      } catch (error) {
        setLoadError(getErrorMessage(error) || 'Failed to load lab users');
        setUsers([]);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [selectedLabId]);

  const reloadUsers = async () => {
    if (!selectedLabId) return;
    setLoadError(null);
    try {
      const usersData = await getAdminLabUsers(selectedLabId);
      setUsers(usersData);
    } catch (error) {
      setLoadError(getErrorMessage(error) || 'Failed to reload users');
    }
  };

  const openCreate = () => {
    if (!canMutate) {
      message.warning('Read-only mode: AUDITOR cannot add users');
      return;
    }
    setEditingUser(null);
    form.resetFields();
    form.setFieldsValue({ isActive: true, shiftIds: [], departmentIds: [] });
    setModalOpen(true);
  };

  const openEdit = async (user: SettingsUserDto) => {
    if (!selectedLabId) return;
    if (!canMutate) {
      message.warning('Read-only mode: AUDITOR cannot edit users');
      return;
    }
    setEditingUser(user);
    try {
      const detail = await getAdminLabUser(selectedLabId, user.id);
      form.setFieldsValue({
        fullName: detail.user.fullName,
        email: detail.user.email,
        role: detail.user.role,
        isActive: detail.user.isActive,
        shiftIds: detail.shiftIds,
        departmentIds: detail.departmentIds ?? [],
      });
      setModalOpen(true);
    } catch (error) {
      message.error(getErrorMessage(error) || 'Failed to load user details');
    }
  };

  const handleSubmit = async () => {
    if (!selectedLabId) return;
    if (!canMutate) {
      message.warning('Read-only mode: AUDITOR cannot modify users');
      return;
    }
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    setSubmitting(true);
    try {
      if (editingUser) {
        await updateAdminLabUser(selectedLabId, editingUser.id, {
          fullName: values.fullName,
          email: values.email,
          role: values.role,
          isActive: values.isActive,
          shiftIds: values.shiftIds,
          departmentIds: values.departmentIds,
          password: values.password || undefined,
        });
        message.success('User updated');
      } else {
        await createAdminLabUser(selectedLabId, {
          username: values.username,
          password: values.password,
          fullName: values.fullName,
          email: values.email,
          role: values.role,
          shiftIds: values.shiftIds,
          departmentIds: values.departmentIds,
        });
        message.success('User created');
      }
      setModalOpen(false);
      await reloadUsers();
    } catch (error) {
      message.error(getErrorMessage(error) || 'Failed to save user');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (user: SettingsUserDto) => {
    if (!selectedLabId) return;
    if (!canMutate) {
      message.warning('Read-only mode: AUDITOR cannot delete users');
      return;
    }
    try {
      await deleteAdminLabUser(selectedLabId, user.id);
      message.success('User deleted');
      await reloadUsers();
    } catch (error) {
      message.error(getErrorMessage(error) || 'Failed to delete user');
    }
  };

  const openResetPassword = (user: SettingsUserDto) => {
    if (!canMutate) {
      message.warning('Read-only mode: AUDITOR cannot reset passwords');
      return;
    }
    setResetTargetUser(user);
    resetForm.resetFields();
    setResetModalOpen(true);
  };

  const handleResetPassword = async () => {
    if (!selectedLabId || !resetTargetUser) return;
    if (!canMutate) {
      message.warning('Read-only mode: AUDITOR cannot reset passwords');
      return;
    }
    const values = await resetForm.validateFields().catch(() => null);
    if (!values) return;

    setResetSubmitting(true);
    try {
      await resetAdminLabUserPassword(selectedLabId, resetTargetUser.id, {
        password: values.password,
        reason: values.reason,
      });
      message.success(`Password reset for ${resetTargetUser.username}`);
      setResetModalOpen(false);
      setResetTargetUser(null);
      resetForm.resetFields();
      await reloadUsers();
    } catch (error) {
      message.error(getErrorMessage(error) || 'Failed to reset password');
    } finally {
      setResetSubmitting(false);
    }
  };

  const columns: ColumnsType<SettingsUserDto> = [
    { title: 'Username', dataIndex: 'username', key: 'username', render: (value) => <strong>{value}</strong> },
    { title: 'Full name', dataIndex: 'fullName', key: 'fullName', render: (value) => value || '-' },
    { title: 'Role', dataIndex: 'role', key: 'role', render: (value) => <Tag color="blue">{value}</Tag> },
    {
      title: 'Shifts',
      key: 'shifts',
      render: (_, row) => {
        const names = row.shiftAssignments?.map((item) => item.shift?.code ?? item.shiftId).filter(Boolean) ?? [];
        return names.length ? names.join(', ') : '-';
      },
    },
    {
      title: 'Departments',
      key: 'departments',
      render: (_, row) => {
        const names =
          row.departmentAssignments?.map((item) => item.department?.code ?? item.departmentId).filter(Boolean) ?? [];
        return names.length ? names.join(', ') : '-';
      },
    },
    { title: 'Active', dataIndex: 'isActive', key: 'isActive', width: 90, render: (value) => (value ? 'Yes' : 'No') },
    {
      title: 'Actions',
      key: 'actions',
      width: 260,
      render: (_, row) => (
        canMutate ? (
          <Space size="small">
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>
              Edit
            </Button>
            <Button type="link" size="small" icon={<KeyOutlined />} onClick={() => openResetPassword(row)}>
              Reset password
            </Button>
            <Popconfirm
              title="Delete this user?"
              description="User will be removed from this lab."
              okText="Delete"
              okButtonProps={{ danger: true }}
              onConfirm={() => handleDelete(row)}
            >
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                Delete
              </Button>
            </Popconfirm>
          </Space>
        ) : (
          <Text type="secondary">Read-only</Text>
        )
      ),
    },
  ];

  return (
    <div>
      <Title level={4} style={{ marginTop: 0 }}>
        <TeamOutlined style={{ marginRight: 8 }} />
        Lab User Management
      </Title>
      <Text type="secondary">Create and manage user accounts for the selected lab.</Text>

      <Card style={{ marginTop: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
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
              {loadError ? (
                <Alert
                  type="error"
                  showIcon
                  message={loadError}
                  action={
                    <Button size="small" onClick={() => void reloadUsers()}>
                      Retry
                    </Button>
                  }
                />
              ) : null}

              <Space>
                <Tag color="geekblue">{selectedLab.code}</Tag>
                <Tag>{selectedLab.subdomain || '-'}</Tag>
              </Space>

              <div>
                <Space>
                  <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} disabled={!canMutate}>
                    Add user
                  </Button>
                  <Button onClick={() => void reloadUsers()}>Retry</Button>
                  {!canMutate ? <Tag color="orange">Read-only mode</Tag> : null}
                </Space>
              </div>

              <Table
                rowKey="id"
                loading={loading}
                columns={columns}
                dataSource={users}
                locale={{ emptyText: 'No users found for selected lab.' }}
                pagination={{ pageSize: 10 }}
              />
            </>
          )}
        </Space>
      </Card>

      <Modal
        title={editingUser ? 'Edit user' : 'Add user'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => void handleSubmit()}
        confirmLoading={submitting}
        okButtonProps={{ disabled: !canMutate }}
        okText={editingUser ? 'Update' : 'Create'}
        width={520}
      >
        <Form form={form} layout="vertical" disabled={!canMutate}>
          {!editingUser && (
            <>
              <Form.Item name="username" label="Username" rules={[{ required: true }]}>
                <Input placeholder="Username" />
              </Form.Item>
              <Form.Item name="password" label="Password" rules={[{ required: true }]}>
                <Input.Password placeholder="Password" />
              </Form.Item>
            </>
          )}
          {editingUser && (
            <Form.Item name="password" label="New password (optional)">
              <Input.Password placeholder="Leave blank to keep current password" />
            </Form.Item>
          )}
          <Form.Item name="fullName" label="Full name">
            <Input placeholder="Full name" />
          </Form.Item>
          <Form.Item name="email" label="Email">
            <Input type="email" placeholder="Email" />
          </Form.Item>
          <Form.Item name="role" label="Role" rules={[{ required: true }]}>
            <Select options={roles.map((role) => ({ label: role.replace(/_/g, ' '), value: role }))} />
          </Form.Item>
          <Form.Item name="shiftIds" label="Assigned shifts">
            <Select
              mode="multiple"
              allowClear
              options={shifts.map((shift) => ({
                label: `${shift.code}${shift.name ? ` (${shift.name})` : ''}`,
                value: shift.id,
              }))}
            />
          </Form.Item>
          <Form.Item name="departmentIds" label="Assigned departments">
            <Select
              mode="multiple"
              allowClear
              options={departments.map((department) => ({
                label: `${department.code} - ${department.name}`,
                value: department.id,
              }))}
            />
          </Form.Item>
          {editingUser && (
            <Form.Item name="isActive" label="Active" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Modal
        title={`Reset password${resetTargetUser ? `: ${resetTargetUser.username}` : ''}`}
        open={resetModalOpen}
        onCancel={() => {
          setResetModalOpen(false);
          setResetTargetUser(null);
          resetForm.resetFields();
        }}
        onOk={() => void handleResetPassword()}
        confirmLoading={resetSubmitting}
        okButtonProps={{ danger: true, disabled: !canMutate }}
        okText="Reset password"
        width={520}
      >
        <Form form={resetForm} layout="vertical" disabled={!canMutate}>
          <Form.Item
            name="password"
            label="New password"
            rules={[
              { required: true, message: 'Please enter a new password' },
              { min: 8, message: 'Password must be at least 8 characters' },
            ]}
          >
            <Input.Password placeholder="Enter new password" />
          </Form.Item>
          <Form.Item
            name="reason"
            label="Reason (required for audit)"
            rules={[
              { required: true, message: 'Please enter a reason' },
              { min: 3, message: 'Reason must be at least 3 characters' },
            ]}
          >
            <Input.TextArea rows={3} placeholder="Example: User forgot password at reception desk." />
          </Form.Item>
        </Form>
      </Modal>
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
