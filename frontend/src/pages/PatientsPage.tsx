import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Table,
  Input,
  Button,
  Space,
  message,
  Modal,
  Form,
  Typography,
  Tag,
} from 'antd';
import { SearchOutlined, PlusOutlined, ShoppingCartOutlined, EditOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  searchPatients,
  createPatient,
  updatePatient,
  type PatientDto,
  type CreatePatientDto,
} from '../api/client';
import {
  PatientFormFields,
  getPatientFormInitialValues,
  normalizePatientFormPayload,
  type PatientFormValues,
} from '../components/patients/PatientFormFields';

const { Title, Text } = Typography;

export function PatientsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState<PatientDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [size] = useState(20);
  const [modalOpen, setModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<PatientDto | null>(null);
  const [form] = Form.useForm<PatientFormValues>();
  const [editForm] = Form.useForm<PatientFormValues>();
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await searchPatients({
        search: search.trim() || undefined,
        page,
        size,
      });
      setData(Array.isArray(res.items) ? res.items : []);
      setTotal(Number.isFinite(res.total) ? res.total : 0);
    } catch (e) {
      message.error('Failed to load patients');
    } finally {
      setLoading(false);
    }
  }, [search, page, size]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const state = location.state as { openNewPatient?: boolean } | null;
    if (!state?.openNewPatient) return;
    setModalOpen(true);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  const onSearch = () => load();

  const handleCreate = async (values: PatientFormValues) => {
    const payload: CreatePatientDto = normalizePatientFormPayload(values);
    setSubmitting(true);
    try {
      await createPatient(payload);
      message.success('Patient registered');
      setModalOpen(false);
      form.resetFields();
      load();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : 'Registration failed';
      message.error(msg || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (patient: PatientDto) => {
    setEditingPatient(patient);
    editForm.setFieldsValue(getPatientFormInitialValues(patient));
    setEditModalOpen(true);
  };

  const handleUpdate = async (values: PatientFormValues) => {
    if (!editingPatient) return;
    setSubmitting(true);
    try {
      await updatePatient(editingPatient.id, normalizePatientFormPayload(values));
      message.success('Patient updated');
      setEditModalOpen(false);
      setEditingPatient(null);
      editForm.resetFields();
      load();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : 'Update failed';
      message.error(msg || 'Update failed');
    } finally {
      setSubmitting(false);
    }
  };

  const columns: ColumnsType<PatientDto> = [
    {
      title: 'Patient ID',
      dataIndex: 'patientNumber',
      key: 'patientNumber',
      width: 100,
      render: (v: string) => <Text strong copyable={{ text: v }}>{v}</Text>,
    },
    {
      title: 'Full Name',
      dataIndex: 'fullName',
      key: 'fullName',
      render: (v: string) => v || '—',
    },
    { title: 'National ID', dataIndex: 'nationalId', key: 'nationalId', width: 120 },
    { title: 'Phone', dataIndex: 'phone', key: 'phone', width: 120 },
    { title: 'DOB', dataIndex: 'dateOfBirth', key: 'dateOfBirth', width: 110 },
    {
      title: 'Sex',
      dataIndex: 'sex',
      key: 'sex',
      width: 70,
      render: (v: string) => (v ? <Tag>{v}</Tag> : '—'),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      render: (_, r) => (
        <Space>
          <Button
            type="default"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(r)}
          >
            Edit
          </Button>
          <Button
            type="primary"
            size="small"
            icon={<ShoppingCartOutlined />}
            onClick={() => navigate('/orders', { state: { patientId: r.id } })}
          >
            Go to order
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Title level={4}>Patients</Title>
      <Card>
        <Space style={{ marginBottom: 16 }} wrap>
          <Input
            placeholder="Search by Patient ID, name, phone, national ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onPressEnter={onSearch}
            style={{ width: 280 }}
            allowClear
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={onSearch}>
            Search
          </Button>
          <Button type="default" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            New patient
          </Button>
        </Space>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={data}
          loading={loading}
          pagination={{
            current: page,
            pageSize: size,
            total,
            showSizeChanger: false,
            showTotal: (t) => `Total ${t} patients`,
            onChange: (p) => setPage(p),
          }}
          size="middle"
        />
      </Card>

      <Modal
        title="Edit patient"
        open={editModalOpen}
        onCancel={() => { setEditModalOpen(false); setEditingPatient(null); editForm.resetFields(); }}
        footer={null}
        destroyOnClose
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={handleUpdate}
          initialValues={getPatientFormInitialValues(editingPatient)}
        >
          {editingPatient && (
            <Form.Item label="Patient ID">
              <Text strong>{editingPatient.patientNumber}</Text>
              <Text type="secondary" style={{ marginLeft: 8 }}>(cannot be changed)</Text>
            </Form.Item>
          )}
          <PatientFormFields />
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={submitting}>
                Save
              </Button>
              <Button onClick={() => { setEditModalOpen(false); setEditingPatient(null); editForm.resetFields(); }}>
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Register patient"
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        footer={null}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreate}
          initialValues={getPatientFormInitialValues()}
        >
          <PatientFormFields />
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={submitting}>
                Register
              </Button>
              <Button onClick={() => { setModalOpen(false); form.resetFields(); }}>
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
