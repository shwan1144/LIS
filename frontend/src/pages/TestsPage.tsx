import { useState, useEffect, useMemo } from 'react';
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
  InputNumber,
  Switch,
  Typography,
  Tag,
  Popconfirm,
  Tabs,
  Row,
  Col,
  Divider,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ExperimentOutlined,
  DatabaseOutlined,
  ApiOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  getTests,
  createTest,
  updateTest,
  deleteTest,
  toggleTestActive,
  getShifts,
  getDepartments,
  getTestPricing,
  setTestPricing,
  seedAllTests,
  getInstruments,
  getInstrumentMappingsByTestId,
  createInstrumentMapping,
  deleteInstrumentMapping,
  type TestDto,
  type CreateTestDto,
  type TestType,
  type TestTubeType,
  type TestParameterDefinition,
  type ShiftDto,
  type DepartmentDto,
  type InstrumentDto,
} from '../api/client';
import { useTheme } from '../contexts/ThemeContext';

const { Title, Text } = Typography;

const TEST_TYPES: { label: string; value: TestType }[] = [
  { label: 'Single Test', value: 'SINGLE' },
  { label: 'Panel', value: 'PANEL' },
];

const TUBE_TYPES: { label: string; value: TestTubeType }[] = [
  { label: 'Serum', value: 'SERUM' },
  { label: 'Plasma', value: 'PLASMA' },
  { label: 'Whole Blood', value: 'WHOLE_BLOOD' },
  { label: 'Urine', value: 'URINE' },
  { label: 'Stool', value: 'STOOL' },
  { label: 'Swab', value: 'SWAB' },
  { label: 'CSF', value: 'CSF' },
  { label: 'Other', value: 'OTHER' },
];

export function TestsPage() {
  const { isDark } = useTheme();
  const [tests, setTests] = useState<TestDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTest, setEditingTest] = useState<TestDto | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const [shifts, setShifts] = useState<ShiftDto[]>([]);
  const [departments, setDepartments] = useState<DepartmentDto[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [pricesByShift, setPricesByShift] = useState<Record<string, number>>({ default: 0 });
  const [seeding, setSeeding] = useState(false);
  const [instruments, setInstruments] = useState<InstrumentDto[]>([]);
  const [testMappings, setTestMappings] = useState<Array<{ id: string; instrumentId: string; instrumentTestCode: string; instrumentTestName: string | null; instrument?: { id: string; code: string; name: string } }>>([]);
  const [loadingMappings, setLoadingMappings] = useState(false);
  const [addingMapping, setAddingMapping] = useState(false);
  const [newMappingInstrumentId, setNewMappingInstrumentId] = useState<string | null>(null);
  const [newMappingCode, setNewMappingCode] = useState('');
  const [newMappingName, setNewMappingName] = useState('');

  const panelCardStyle = useMemo(
    () => ({
      border: isDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid #f0f0f0',
      borderRadius: 8,
      padding: 12,
      background: isDark ? 'rgba(255,255,255,0.04)' : '#fafafa',
      height: '100%' as const,
    }),
    [isDark]
  );

  const loadTests = async () => {
    setLoading(true);
    try {
      const data = await getTests(!showAll);
      setTests(data);
      setCategories(
        Array.from(new Set(data.map((t) => t.category).filter((c): c is string => Boolean(c)))).sort(),
      );
    } catch {
      message.error('Failed to load tests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTests();
  }, [showAll]);

  const handleOpenModal = async (test?: TestDto) => {
    const [shiftList, deptList] = await Promise.all([
      getShifts().catch(() => []),
      getDepartments().catch(() => []),
    ]);
    setShifts(shiftList);
    setDepartments(deptList);
    const initialPrices: Record<string, number> = { default: 0 };
    shiftList.forEach((s) => { initialPrices[s.id] = 0; });
    if (test) {
      setEditingTest(test);
      form.setFieldsValue({
        ...test,
        category: test.category || undefined,
        normalMin: test.normalMin ?? undefined,
        normalMax: test.normalMax ?? undefined,
        normalMinMale: test.normalMinMale ?? undefined,
        normalMaxMale: test.normalMaxMale ?? undefined,
        normalMinFemale: test.normalMinFemale ?? undefined,
        normalMaxFemale: test.normalMaxFemale ?? undefined,
        departmentId: test.departmentId ?? undefined,
        expectedCompletionMinutes: test.expectedCompletionMinutes ?? undefined,
        parameterDefinitions: (test.parameterDefinitions ?? []).map((p) => ({
          code: p.code,
          label: p.label,
          type: p.type,
          options: p.options?.length ? p.options.join(', ') : '',
          normalOptions: p.normalOptions ?? [],
          defaultValue: p.defaultValue ?? undefined,
        })),
      });
      const pricing = await getTestPricing(test.id).catch(() => []);
      pricing.forEach((p) => {
        const key = p.shiftId ?? 'default';
        initialPrices[key] = p.price;
      });
    } else {
      setEditingTest(null);
      form.resetFields();
      form.setFieldsValue({
        type: 'SINGLE',
        tubeType: 'SERUM',
        isActive: true,
        sortOrder: 0,
        departmentId: undefined,
        category: undefined,
        parameterDefinitions: [],
      });
    }
    setPricesByShift(initialPrices);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingTest(null);
    form.resetFields();
    setTestMappings([]);
    setNewMappingInstrumentId(null);
    setNewMappingCode('');
    setNewMappingName('');
  };

  useEffect(() => {
    if (!modalOpen) return;
    let cancelled = false;
    getInstruments()
      .then((list) => { if (!cancelled) setInstruments(list); })
      .catch(() => { if (!cancelled) message.error('Failed to load instruments'); });
    return () => { cancelled = true; };
  }, [modalOpen]);

  useEffect(() => {
    if (!editingTest?.id) {
      setTestMappings([]);
      return;
    }
    setLoadingMappings(true);
    getInstrumentMappingsByTestId(editingTest.id)
      .then((list) => setTestMappings(list))
      .catch(() => message.error('Failed to load instrument mappings'))
      .finally(() => setLoadingMappings(false));
  }, [editingTest?.id]);

  const handleAddInstrumentMapping = async () => {
    if (!editingTest || !newMappingInstrumentId || !newMappingCode.trim()) {
      message.warning('Select an instrument and enter instrument test code');
      return;
    }
    setAddingMapping(true);
    try {
      await createInstrumentMapping(newMappingInstrumentId, {
        testId: editingTest.id,
        instrumentTestCode: newMappingCode.trim(),
        instrumentTestName: newMappingName.trim() || undefined,
      });
      message.success('Mapping added');
      setNewMappingCode('');
      setNewMappingName('');
      const list = await getInstrumentMappingsByTestId(editingTest.id);
      setTestMappings(list);
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'response' in e && (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      message.error(msg || 'Failed to add mapping');
    } finally {
      setAddingMapping(false);
    }
  };

  const handleRemoveInstrumentMapping = async (instrumentId: string, mappingId: string) => {
    if (!editingTest) return;
    try {
      await deleteInstrumentMapping(instrumentId, mappingId);
      message.success('Mapping removed');
      const list = await getInstrumentMappingsByTestId(editingTest.id);
      setTestMappings(list);
    } catch {
      message.error('Failed to remove mapping');
    }
  };

  const handleSubmit = async (values: CreateTestDto & { category?: string | string[] | null; parameterDefinitions?: { code: string; label: string; type: 'select' | 'text'; options?: string; normalOptions?: string[]; defaultValue?: string }[]; type?: TestType }) => {
    setSubmitting(true);
    const isPanel = values.type === 'PANEL';
    const paramDefs: TestParameterDefinition[] | null = isPanel && (values.parameterDefinitions ?? []).length > 0
      ? (values.parameterDefinitions ?? []).map((p) => ({
          code: p.code.trim(),
          label: p.label.trim(),
          type: p.type,
          options: p.type === 'select' && p.options
            ? (typeof p.options === 'string' ? p.options.split(',') : []).map((s) => s.trim()).filter(Boolean)
            : undefined,
          normalOptions: Array.isArray(p.normalOptions) && p.normalOptions.length > 0 ? p.normalOptions : undefined,
          defaultValue: p.defaultValue?.trim() || undefined,
        }))
      : null;
    const categoryValue = Array.isArray(values.category) ? values.category[0] : values.category;
    const payload: CreateTestDto = {
      ...values,
      category: categoryValue ? categoryValue.trim() || null : null,
      parameterDefinitions: paramDefs,
    };
    try {
      let testId: string;
      if (editingTest) {
        await updateTest(editingTest.id, payload);
        testId = editingTest.id;
        message.success('Test updated successfully');
      } else {
        const created = await createTest(payload);
        testId = created.id;
        message.success('Test created successfully');
      }
      const pricesToSave = [
        { shiftId: null as string | null, price: pricesByShift.default ?? 0 },
        ...shifts.map((s) => ({ shiftId: s.id, price: pricesByShift[s.id] ?? 0 })),
      ].filter((p) => p.price > 0);
      if (pricesToSave.length) {
        await setTestPricing(testId, pricesToSave);
      }
      handleCloseModal();
      loadTests();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : editingTest ? 'Failed to update test' : 'Failed to create test';
      message.error(msg || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTest(id);
      message.success('Test deleted successfully');
      loadTests();
    } catch {
      message.error('Failed to delete test');
    }
  };

  const handleToggleActive = async (id: string) => {
    try {
      await toggleTestActive(id);
      loadTests();
    } catch {
      message.error('Failed to toggle test status');
    }
  };

  const handleSeedTests = async () => {
    Modal.confirm({
      title: 'Seed Lab Tests',
      content: (
        <div>
          <p>This will add:</p>
          <ul style={{ marginTop: 8 }}>
            <li><strong>CBC</strong> – one panel test (Complete Blood Count), order by name only</li>
            <li><strong>Chemistry</strong> – BMP, Liver, Lipid, Thyroid, Coagulation (individual tests with normal ranges)</li>
          </ul>
          <p style={{ marginTop: 8, color: '#666' }}>Existing tests with the same code will be skipped.</p>
        </div>
      ),
      okText: 'Seed Tests',
      cancelText: 'Cancel',
      width: 500,
      onOk: async () => {
        setSeeding(true);
        try {
          const result = await seedAllTests();
          message.success(`Created ${result.total.created} tests (${result.total.skipped} already existed)`);
          loadTests();
        } catch (err: unknown) {
          const msg =
            err && typeof err === 'object' && 'response' in err
              ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
              : err instanceof Error
                ? err.message
                : 'Failed to seed tests';
          message.error(msg || 'Failed to seed tests');
        } finally {
          setSeeding(false);
        }
      },
    });
  };

  const formatNormalRange = (test: TestDto) => {
    if (test.normalText) return test.normalText;
    if (test.normalMin !== null || test.normalMax !== null) {
      const min = test.normalMin !== null ? test.normalMin : '-';
      const max = test.normalMax !== null ? test.normalMax : '-';
      return `${min} - ${max}${test.unit ? ` ${test.unit}` : ''}`;
    }
    return '-';
  };

  const columns: ColumnsType<TestDto> = [
    {
      title: 'Code',
      dataIndex: 'code',
      key: 'code',
      width: 100,
      render: (code: string) => <Text strong>{code}</Text>,
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      width: 150,
      filters: categories.map((c) => ({ text: c, value: c })),
      onFilter: (value, record) => (record.category || '') === value,
      render: (c: string | null) =>
        c ? <Tag color="purple">{c}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type: TestType) => (
        <Tag color={type === 'PANEL' ? 'blue' : 'default'}>{type}</Tag>
      ),
    },
    {
      title: 'Tube',
      dataIndex: 'tubeType',
      key: 'tubeType',
      width: 120,
      render: (tube: TestTubeType) => (
        <Tag color="purple">{tube.replace('_', ' ')}</Tag>
      ),
    },
    {
      title: 'Unit',
      dataIndex: 'unit',
      key: 'unit',
      width: 80,
      render: (unit: string | null) => unit || '-',
    },
    {
      title: 'Normal Range',
      key: 'normalRange',
      width: 150,
      render: (_, record) => formatNormalRange(record),
    },
    {
      title: 'Active',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 80,
      render: (active: boolean, record) => (
        <Switch
          checked={active}
          size="small"
          onChange={() => handleToggleActive(record.id)}
        />
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleOpenModal(record)}
            size="small"
          >
            Edit
          </Button>
          <Popconfirm
            title="Delete this test?"
            description="This action cannot be undone."
            onConfirm={() => handleDelete(record.id)}
            okText="Delete"
            okButtonProps={{ danger: true }}
          >
            <Button type="link" danger icon={<DeleteOutlined />} size="small">
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <ExperimentOutlined style={{ marginRight: 8 }} />
          Tests Management
        </Title>
        <Space>
          <Switch
            checked={showAll}
            onChange={setShowAll}
            checkedChildren="All"
            unCheckedChildren="Active"
          />
          <Button
            icon={<DatabaseOutlined />}
            onClick={handleSeedTests}
            loading={seeding}
          >
            Seed CBC & Chemistry
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => handleOpenModal()}
          >
            Add Test
          </Button>
        </Space>
      </div>

      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={tests}
          loading={loading}
          pagination={{
            pageSize: 20,
            showSizeChanger: false,
            showTotal: (total) => `Total ${total} tests`,
          }}
          size="middle"
        />
      </Card>

      <Modal
        title={editingTest ? 'Edit Test' : 'Add New Test'}
        open={modalOpen}
        onCancel={handleCloseModal}
        footer={null}
        width={1100}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            type: 'SINGLE',
            tubeType: 'SERUM',
            isActive: true,
            sortOrder: 0,
          }}
        >
          <Form.Item noStyle shouldUpdate={(prev, curr) => prev?.type !== curr?.type}>
            {() => {
              const isPanel = form.getFieldValue('type') === 'PANEL';
              if (isPanel) return null;
              return (
                <>
                  <Row gutter={16}>
                    <Col span={6}>
                      <Form.Item
                        name="code"
                        label="Test Code"
                        rules={[{ required: true, message: 'Code is required' }]}
                      >
                        <Input placeholder="e.g., GLU, CBC" style={{ textTransform: 'uppercase' }} />
                      </Form.Item>
                    </Col>
                    <Col span={10}>
                      <Form.Item
                        name="name"
                        label="Test Name"
                        rules={[{ required: true, message: 'Name is required' }]}
                      >
                        <Input placeholder="e.g., Blood Glucose, Complete Blood Count" />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="category" label="Category">
                        <Select
                          allowClear
                          mode="tags"
                          placeholder="e.g., Liver Function"
                          options={categories.map((c) => ({ label: c, value: c }))}
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row gutter={16}>
                    <Col span={8}>
                      <Form.Item name="type" label="Type">
                        <Select options={TEST_TYPES} />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="tubeType" label="Tube Type">
                        <Select options={TUBE_TYPES} />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="unit" label="Unit">
                        <Input placeholder="e.g., mg/dL, mmol/L" />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item name="departmentId" label="Department (for worklist filter)">
                        <Select
                          placeholder="Select department"
                          allowClear
                          options={departments.map((d) => ({ label: `${d.code} – ${d.name}`, value: d.id }))}
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                </>
              );
            }}
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(prev, curr) => prev?.type !== curr?.type}>
            {() => {
              if (form.getFieldValue('type') === 'PANEL') return null;
              return (
                <>
                  <Divider orientation="left">Normal Range</Divider>
                  <Tabs
                    items={[
                      {
                        key: 'general',
                        label: 'General',
                        children: (
                          <Row gutter={16}>
                            <Col span={12}>
                              <Form.Item name="normalMin" label="Min Value">
                                <InputNumber style={{ width: '100%' }} placeholder="Minimum" />
                              </Form.Item>
                            </Col>
                            <Col span={12}>
                              <Form.Item name="normalMax" label="Max Value">
                                <InputNumber style={{ width: '100%' }} placeholder="Maximum" />
                              </Form.Item>
                            </Col>
                          </Row>
                        ),
                      },
                      {
                        key: 'gender',
                        label: 'By Gender',
                        children: (
                          <>
                            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                              Male Range
                            </Text>
                            <Row gutter={16}>
                              <Col span={12}>
                                <Form.Item name="normalMinMale" label="Min (Male)">
                                  <InputNumber style={{ width: '100%' }} placeholder="Min male" />
                                </Form.Item>
                              </Col>
                              <Col span={12}>
                                <Form.Item name="normalMaxMale" label="Max (Male)">
                                  <InputNumber style={{ width: '100%' }} placeholder="Max male" />
                                </Form.Item>
                              </Col>
                            </Row>
                            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                              Female Range
                            </Text>
                            <Row gutter={16}>
                              <Col span={12}>
                                <Form.Item name="normalMinFemale" label="Min (Female)">
                                  <InputNumber style={{ width: '100%' }} placeholder="Min female" />
                                </Form.Item>
                              </Col>
                              <Col span={12}>
                                <Form.Item name="normalMaxFemale" label="Max (Female)">
                                  <InputNumber style={{ width: '100%' }} placeholder="Max female" />
                                </Form.Item>
                              </Col>
                            </Row>
                          </>
                        ),
                      },
                      {
                        key: 'text',
                        label: 'Text Value',
                        children: (
                          <Form.Item name="normalText" label="Normal Text">
                            <Input placeholder='e.g., "Negative", "Non-reactive", "< 10"' />
                          </Form.Item>
                        ),
                      },
                    ]}
                  />
                </>
              );
            }}
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(prev, curr) => prev?.type !== curr?.type}>
            {() => {
              const isPanel = form.getFieldValue('type') === 'PANEL';
              if (!isPanel) {
                return (
                  <Form.Item name="description" label="Description">
                    <Input.TextArea rows={2} placeholder="Optional description or notes" />
                  </Form.Item>
                );
              }

              return (
                <Row gutter={16} align="stretch">
                  <Col span={12}>
                    <div style={panelCardStyle}>
                      <Text strong style={{ display: 'block', marginBottom: 12 }}>Test information</Text>
                      <Form.Item name="code" label="Test Code" rules={[{ required: true, message: 'Code is required' }]} style={{ marginBottom: 12 }}>
                        <Input placeholder="e.g., GLU, CBC" style={{ textTransform: 'uppercase' }} />
                      </Form.Item>
                      <Form.Item name="name" label="Test Name" rules={[{ required: true, message: 'Name is required' }]} style={{ marginBottom: 12 }}>
                        <Input placeholder="e.g., Blood Glucose, Complete Blood Count" />
                      </Form.Item>
                      <Form.Item name="category" label="Category" style={{ marginBottom: 12 }}>
                        <Select
                          allowClear
                          mode="tags"
                          placeholder="e.g., Liver Function"
                          options={categories.map((c) => ({ label: c, value: c }))}
                        />
                      </Form.Item>
                      <Form.Item name="type" label="Type" style={{ marginBottom: 12 }}>
                        <Select options={TEST_TYPES} />
                      </Form.Item>
                      <Form.Item name="tubeType" label="Tube Type" style={{ marginBottom: 12 }}>
                        <Select options={TUBE_TYPES} />
                      </Form.Item>
                      <Form.Item name="departmentId" label="Department (for worklist filter)" style={{ marginBottom: 12 }}>
                        <Select
                          placeholder="Select department"
                          allowClear
                          options={departments.map((d) => ({ label: `${d.code} – ${d.name}`, value: d.id }))}
                        />
                      </Form.Item>
                      <Form.Item name="description" label="Description" style={{ marginBottom: 0 }}>
                        <Input.TextArea rows={3} placeholder="Optional description or notes" />
                      </Form.Item>
                    </div>
                  </Col>
                  <Col span={12}>
                    <div style={panelCardStyle}>
                      <Text strong style={{ display: 'block', marginBottom: 4 }}>Result parameters (for panel tests)</Text>
                      <Text style={{ marginBottom: 8, display: 'block' }}>
                        Define dropdown or text fields shown when entering results in the worklist (e.g. color: yellow, red, dark).
                      </Text>
                      <Form.List name="parameterDefinitions">
                        {(fields, { add, remove }) => (
                          <>
                            {fields.map(({ key, name, ...rest }) => (
                              <div
                                key={key}
                                style={{
                                  marginBottom: 12,
                                  padding: '10px 0',
                                  borderBottom: panelCardStyle.border,
                                }}
                              >
                                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                  <Form.Item
                                    {...rest}
                                    name={[name, 'code']}
                                    label="Code"
                                    rules={[{ required: true }]}
                                    style={{ marginBottom: 0, minWidth: 90, flex: '0 0 100px' }}
                                  >
                                    <Input placeholder="e.g. color" />
                                  </Form.Item>
                                  <Form.Item
                                    {...rest}
                                    name={[name, 'label']}
                                    label="Label"
                                    rules={[{ required: true }]}
                                    style={{ marginBottom: 0, minWidth: 120, flex: '1 1 140px' }}
                                  >
                                    <Input placeholder="e.g. Color" />
                                  </Form.Item>
                                  <Form.Item
                                    {...rest}
                                    name={[name, 'type']}
                                    label="Type"
                                    style={{ marginBottom: 0, minWidth: 110, flex: '0 0 130px' }}
                                  >
                                    <Select options={[{ label: 'Dropdown', value: 'select' }, { label: 'Text', value: 'text' }]} />
                                  </Form.Item>
                                  <Form.Item
                                    {...rest}
                                    name={[name, 'options']}
                                    label="Options (for dropdown)"
                                    style={{ marginBottom: 0, flex: '1 1 200px' }}
                                  >
                                    <Input placeholder="Comma-separated, e.g. yellow, red, dark" />
                                  </Form.Item>
                                  <Button type="text" danger onClick={() => remove(name)} style={{ marginTop: 30 }}>
                                    Remove
                                  </Button>
                                </div>
                                <Form.Item noStyle shouldUpdate={(prev, curr) => prev?.parameterDefinitions !== curr?.parameterDefinitions}>
                                  {() => {
                                    const optsStr = form.getFieldValue(['parameterDefinitions', name, 'options']);
                                    const optionList = typeof optsStr === 'string' ? optsStr.split(',').map((s: string) => s.trim()).filter(Boolean) : [];
                                    const paramType = form.getFieldValue(['parameterDefinitions', name, 'type']);
                                    const isSelect = paramType === 'select';
                                    return (
                                      <div style={{ marginTop: 8, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                                        {isSelect && optionList.length > 0 && (
                                          <Form.Item
                                            {...rest}
                                            name={[name, 'normalOptions']}
                                            label="Normal range"
                                            style={{ marginBottom: 0, minWidth: 200 }}
                                          >
                                            <Select
                                              mode="multiple"
                                              size="small"
                                              placeholder="Which options are normal (e.g. yellow)"
                                              options={optionList.map((o: string) => ({ label: o, value: o }))}
                                            />
                                          </Form.Item>
                                        )}
                                        <Form.Item
                                          {...rest}
                                          name={[name, 'defaultValue']}
                                          label="Default value"
                                          style={{ marginBottom: 0, minWidth: 180 }}
                                        >
                                          {isSelect && optionList.length > 0 ? (
                                            <Select
                                              allowClear
                                              size="small"
                                              placeholder="Pre-fill when entering result (e.g. nil)"
                                              options={[{ label: '— None —', value: '' }, ...optionList.map((o: string) => ({ label: o, value: o }))]}
                                            />
                                          ) : (
                                            <Input size="small" placeholder="Pre-fill when entering result" style={{ width: 200 }} />
                                          )}
                                        </Form.Item>
                                      </div>
                                    );
                                  }}
                                </Form.Item>
                              </div>
                            ))}
                            <Form.Item style={{ marginBottom: 0 }}>
                              <Button type="dashed" onClick={() => add({ type: 'select', options: '', normalOptions: [], defaultValue: undefined })} block>
                                + Add parameter
                              </Button>
                            </Form.Item>
                          </>
                        )}
                      </Form.List>
                    </div>
                  </Col>
                </Row>
              );
            }}
          </Form.Item>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="sortOrder" label="Sort Order">
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="expectedCompletionMinutes" label="Expected Completion Time (minutes)">
                <InputNumber
                  style={{ width: '100%' }}
                  min={1}
                  placeholder="e.g., 60"
                  tooltip="Time from order registration to test completion"
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="isActive" label="Active" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left">Price per shift</Divider>
          <Row gutter={16}>
            <Col span={12}>
              <Text type="secondary">Default price</Text>
              <InputNumber
                style={{ width: '100%', marginTop: 4 }}
                min={0}
                step={0.01}
                value={pricesByShift.default}
                onChange={(v) => setPricesByShift((prev) => ({ ...prev, default: Number(v) || 0 }))}
                prefix="$"
              />
            </Col>
          </Row>
          {shifts.length > 0 && (
            <Row gutter={16} style={{ marginTop: 12 }}>
              {shifts.map((shift) => (
                <Col span={12} key={shift.id}>
                  <Text type="secondary">{shift.name || shift.code}{shift.startTime && shift.endTime ? ` (${shift.startTime}-${shift.endTime})` : ''}</Text>
                  <InputNumber
                    style={{ width: '100%', marginTop: 4 }}
                    min={0}
                    step={0.01}
                    value={pricesByShift[shift.id]}
                    onChange={(v) => setPricesByShift((prev) => ({ ...prev, [shift.id]: Number(v) || 0 }))}
                    prefix="$"
                  />
                </Col>
              ))}
            </Row>
          )}

          {editingTest && (
            <>
              <Divider orientation="left">
                <Space>
                  <ApiOutlined />
                  Receive results from instruments
                </Space>
              </Divider>
              <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                When an instrument sends a result with the code below, it will map to this test.
              </Text>
              {loadingMappings ? (
                <Text type="secondary">Loading mappings…</Text>
              ) : testMappings.length > 0 ? (
                <div style={{ marginBottom: 12, border: panelCardStyle.border, borderRadius: 8, padding: 12, background: panelCardStyle.background }}>
                  {testMappings.map((m) => (
                    <div
                      key={m.id}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid transparent' }}
                    >
                      <Space>
                        <Text strong>{m.instrument?.name ?? m.instrument?.code ?? 'Instrument'}</Text>
                        <Tag>{m.instrumentTestCode}</Tag>
                        {m.instrumentTestName && <Text type="secondary">{m.instrumentTestName}</Text>}
                      </Space>
                      <Popconfirm
                        title="Remove this mapping?"
                        onConfirm={() => handleRemoveInstrumentMapping(m.instrumentId, m.id)}
                      >
                        <Button type="text" danger size="small" icon={<DeleteOutlined />}>
                          Remove
                        </Button>
                      </Popconfirm>
                    </div>
                  ))}
                </div>
              ) : null}
              <Row gutter={8} align="middle">
                <Col flex="180px">
                  <Select
                    placeholder="Instrument"
                    allowClear
                    value={newMappingInstrumentId}
                    onChange={setNewMappingInstrumentId}
                    style={{ width: '100%' }}
                    options={instruments.map((i) => ({ label: `${i.code} – ${i.name}`, value: i.id }))}
                  />
                </Col>
                <Col flex="140px">
                  <Input
                    placeholder="Instrument test code"
                    value={newMappingCode}
                    onChange={(e) => setNewMappingCode(e.target.value)}
                  />
                </Col>
                <Col flex="140px">
                  <Input
                    placeholder="Instrument test name (optional)"
                    value={newMappingName}
                    onChange={(e) => setNewMappingName(e.target.value)}
                  />
                </Col>
                <Col>
                  <Button
                    type="dashed"
                    onClick={handleAddInstrumentMapping}
                    loading={addingMapping}
                    icon={<PlusOutlined />}
                  >
                    Add mapping
                  </Button>
                </Col>
              </Row>
            </>
          )}

          <Form.Item style={{ marginBottom: 0, marginTop: 16 }}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={handleCloseModal}>Cancel</Button>
              <Button type="primary" htmlType="submit" loading={submitting}>
                {editingTest ? 'Update Test' : 'Create Test'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
