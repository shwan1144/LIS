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
  InputNumber,
  Switch,
  Typography,
  Popconfirm,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ClockCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { getShifts, createShift, updateShift, deleteShift, type ShiftDto } from '../../api/client';

const { Title } = Typography;

export function SettingsShiftsPage() {
  const [shifts, setShifts] = useState<ShiftDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<ShiftDto | null>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const data = await getShifts();
      setShifts(data);
    } catch {
      message.error('Failed to load shifts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openModal = (shift?: ShiftDto) => {
    if (shift) {
      setEditingShift(shift);
      form.setFieldsValue({
        code: shift.code,
        name: shift.name,
        startTime: shift.startTime || '',
        endTime: shift.endTime || '',
        isEmergency: shift.isEmergency,
      });
    } else {
      setEditingShift(null);
      form.resetFields();
      form.setFieldsValue({ isEmergency: false });
    }
    setModalOpen(true);
  };

  const handleSubmit = async (values: { code: string; name?: string; startTime?: string; endTime?: string; isEmergency?: boolean }) => {
    const startTime = values.startTime?.trim() || undefined;
    const endTime = values.endTime?.trim() || undefined;
    try {
      if (editingShift) {
        await updateShift(editingShift.id, { ...values, startTime, endTime });
        message.success('Shift updated');
      } else {
        await createShift({ ...values, startTime, endTime });
        message.success('Shift created');
      }
      setModalOpen(false);
      load();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : 'Failed to save';
      message.error(msg || 'Failed to save');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteShift(id);
      message.success('Shift deleted');
      load();
    } catch {
      message.error('Failed to delete shift');
    }
  };

  const columns: ColumnsType<ShiftDto> = [
    { title: 'Code', dataIndex: 'code', key: 'code', width: 100, render: (c) => <strong>{c}</strong> },
    { title: 'Name', dataIndex: 'name', key: 'name' },
    {
      title: 'Start',
      dataIndex: 'startTime',
      key: 'startTime',
      width: 90,
      render: (v) => v || '—',
    },
    {
      title: 'End',
      dataIndex: 'endTime',
      key: 'endTime',
      width: 90,
      render: (v) => v || '—',
    },
    {
      title: 'Emergency',
      dataIndex: 'isEmergency',
      key: 'isEmergency',
      width: 90,
      render: (v) => (v ? 'Yes' : 'No'),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 140,
      render: (_, r) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openModal(r)}>
            Edit
          </Button>
          <Popconfirm title="Delete this shift?" onConfirm={() => handleDelete(r.id)} okText="Delete" okButtonProps={{ danger: true }}>
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
        <ClockCircleOutlined style={{ marginRight: 8 }} />
        Shifts
      </Title>
      <Card>
        <div style={{ marginBottom: 16 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
            Add shift
          </Button>
        </div>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={shifts}
          loading={loading}
          pagination={false}
          size="middle"
        />
      </Card>

      <Modal
        title={editingShift ? 'Edit shift' : 'Add shift'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="code" label="Code" rules={[{ required: true }]}>
            <Input placeholder="e.g. MORNING, EVENING" />
          </Form.Item>
          <Form.Item name="name" label="Name">
            <Input placeholder="e.g. Morning Shift" />
          </Form.Item>
          <Form.Item name="startTime" label="Start time (HH:mm)">
            <Input placeholder="e.g. 08:00" />
          </Form.Item>
          <Form.Item name="endTime" label="End time (HH:mm)">
            <Input placeholder="e.g. 14:00" />
          </Form.Item>
          <Form.Item name="isEmergency" label="Emergency shift" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingShift ? 'Update' : 'Create'}
              </Button>
              <Button onClick={() => setModalOpen(false)}>Cancel</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
