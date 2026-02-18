import { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  message,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  Typography,
  Tag,
  Popconfirm,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, TeamOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  getSettingsUsers,
  getSettingsUser,
  createSettingsUser,
  updateSettingsUser,
  deleteSettingsUser,
  getSettingsRoles,
  getShifts,
  getDepartments,
  type SettingsUserDto,
  type ShiftDto,
  type DepartmentDto,
} from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

const { Title } = Typography;

export function SettingsUsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<SettingsUserDto[]>([]);
  const [shifts, setShifts] = useState<ShiftDto[]>([]);
  const [departments, setDepartments] = useState<DepartmentDto[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SettingsUserDto | null>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [u, s, d, r] = await Promise.all([
        getSettingsUsers(),
        getShifts(),
        getDepartments(),
        getSettingsRoles(),
      ]);
      setUsers(u);
      setShifts(s);
      setDepartments(d);
      setRoles(r);
    } catch {
      message.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditingUser(null);
    form.resetFields();
    form.setFieldsValue({ isActive: true, shiftIds: [], departmentIds: [] });
    setModalOpen(true);
  };

  const openEdit = async (user: SettingsUserDto) => {
    setEditingUser(user);
    try {
      const detail = await getSettingsUser(user.id);
      form.setFieldsValue({
        fullName: detail.user.fullName,
        email: detail.user.email,
        role: detail.user.role,
        isActive: detail.user.isActive,
        shiftIds: detail.shiftIds,
        departmentIds: detail.departmentIds ?? [],
      });
      setModalOpen(true);
    } catch {
      message.error('Failed to load user');
    }
  };

  const handleSubmit = async () => {
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    setSubmitting(true);
    try {
      if (editingUser) {
        await updateSettingsUser(editingUser.id, {
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
        await createSettingsUser({
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
      load();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : 'Failed to save';
      message.error(msg || 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (user: SettingsUserDto) => {
    try {
      await deleteSettingsUser(user.id);
      message.success('User removed');
      load();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : 'Failed to delete user';
      message.error(msg || 'Failed to delete user');
    }
  };

  const columns: ColumnsType<SettingsUserDto> = [
    { title: 'Username', dataIndex: 'username', key: 'username', render: (c) => <strong>{c}</strong> },
    { title: 'Full name', dataIndex: 'fullName', key: 'fullName', render: (v) => v || '—' },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      render: (r) => <Tag color="blue">{r}</Tag>,
    },
    {
      title: 'Shifts',
      key: 'shifts',
      render: (_, r) => {
        const shiftNames = r.shiftAssignments?.map((a) => a.shift?.code ?? a.shiftId).filter(Boolean) ?? [];
        return shiftNames.length ? shiftNames.join(', ') : '—';
      },
    },
    {
      title: 'Departments',
      key: 'departments',
      render: (_, r) => {
        const deptNames = r.departmentAssignments?.map((a) => a.department?.code ?? a.departmentId).filter(Boolean) ?? [];
        return deptNames.length ? deptNames.join(', ') : '—';
      },
    },
    {
      title: 'Active',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 80,
      render: (v) => (v ? 'Yes' : 'No'),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 160,
      render: (_, r) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>
            Edit
          </Button>
          {currentUser?.id !== r.id && (
            <Popconfirm
              title="Remove this user?"
              description="They will be removed from this lab. If they have no other labs, their account will be deleted."
              onConfirm={() => handleDelete(r)}
              okText="Delete"
              okButtonProps={{ danger: true }}
            >
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                Delete
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Title level={4}>
        <TeamOutlined style={{ marginRight: 8 }} />
        User management
      </Title>
      <Card>
        <div style={{ marginBottom: 16 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Add user
          </Button>
        </div>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={users}
          loading={loading}
          pagination={false}
          size="middle"
        />
      </Card>

      <Modal
        title={editingUser ? 'Edit user' : 'Add user'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        confirmLoading={submitting}
        okText={editingUser ? 'Update' : 'Create'}
        width={480}
      >
        <Form form={form} layout="vertical">
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
            <Form.Item name="password" label="New password (leave blank to keep)">
              <Input.Password placeholder="New password" />
            </Form.Item>
          )}
          <Form.Item name="fullName" label="Full name">
            <Input placeholder="Full name" />
          </Form.Item>
          <Form.Item name="email" label="Email">
            <Input type="email" placeholder="Email" />
          </Form.Item>
          <Form.Item name="role" label="Role / Permission" rules={[{ required: true }]}>
            <Select
              placeholder="Select role"
              options={roles.map((r) => ({ label: r.replace(/_/g, ' '), value: r }))}
            />
          </Form.Item>
          <Form.Item name="shiftIds" label="Assigned shifts">
            <Select
              mode="multiple"
              placeholder="Select shifts"
              allowClear
              options={shifts.map((s) => ({ label: `${s.code}${s.name ? ` (${s.name})` : ''}`, value: s.id }))}
            />
          </Form.Item>
          <Form.Item name="departmentIds" label="Assigned departments (worklist filter)">
            <Select
              mode="multiple"
              placeholder="Select departments"
              allowClear
              options={departments.map((d) => ({ label: `${d.code} – ${d.name}`, value: d.id }))}
            />
          </Form.Item>
          {editingUser && (
            <Form.Item name="isActive" label="Active" valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
