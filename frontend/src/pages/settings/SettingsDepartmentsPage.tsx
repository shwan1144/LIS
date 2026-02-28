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
  Typography,
  Popconfirm,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ApartmentOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { getDepartments, createDepartment, updateDepartment, deleteDepartment, type DepartmentDto } from '../../api/client';

const { Title } = Typography;

export function SettingsDepartmentsPage() {
  const [departments, setDepartments] = useState<DepartmentDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<DepartmentDto | null>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const data = await getDepartments();
      setDepartments(data);
    } catch {
      message.error('Failed to load departments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openModal = (dept?: DepartmentDto) => {
    if (dept) {
      setEditingDept(dept);
      form.setFieldsValue({ code: dept.code, name: dept.name });
    } else {
      setEditingDept(null);
      form.resetFields();
    }
    setModalOpen(true);
  };

  const handleSubmit = async (values: { code: string; name?: string }) => {
    try {
      if (editingDept) {
        await updateDepartment(editingDept.id, values);
        message.success('Department updated');
      } else {
        await createDepartment(values);
        message.success('Department created');
      }
      setModalOpen(false);
      load();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : 'Failed to save';
      message.error(msg || 'Failed to save');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDepartment(id);
      message.success('Department deleted');
      load();
    } catch {
      message.error('Failed to delete department');
    }
  };

  const columns: ColumnsType<DepartmentDto> = [
    { title: 'Code', dataIndex: 'code', key: 'code', width: 120, render: (c) => <strong>{c}</strong> },
    { title: 'Name', dataIndex: 'name', key: 'name' },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_, r) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openModal(r)}>
            Edit
          </Button>
          <Popconfirm
            title="Delete this department?"
            description="Tests assigned to this department will have their department cleared."
            onConfirm={() => handleDelete(r.id)}
            okText="Delete"
            okButtonProps={{ danger: true }}
          >
            <Button type="link" danger size="small" icon={<DeleteOutlined />}>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Title level={4}>
        <ApartmentOutlined style={{ marginRight: 8 }} />
        Departments
      </Title>
      <Card>
        <div style={{ marginBottom: 16 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
            Add department
          </Button>
        </div>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={departments}
          loading={loading}
          pagination={false}
          size="middle"
        />
      </Card>

      <Modal
        title={editingDept ? 'Edit department' : 'Add department'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText={editingDept ? 'Update' : 'Create'}
        width={400}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="code"
            label="Code"
            rules={[{ required: true, message: 'Code is required' }]}
          >
            <Input placeholder="e.g., HEM, BIO" style={{ textTransform: 'uppercase' }} />
          </Form.Item>
          <Form.Item name="name" label="Name">
            <Input placeholder="e.g., Hematology, Biochemistry" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
