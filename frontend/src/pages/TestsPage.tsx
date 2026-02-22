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
  getTest,
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
  type TestNumericAgeRange,
  type TestResultEntryType,
  type TestResultTextOption,
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

const RESULT_ENTRY_TYPES: { label: string; value: TestResultEntryType }[] = [
  { label: 'Numeric', value: 'NUMERIC' },
  { label: 'Qualitative (dropdown)', value: 'QUALITATIVE' },
  { label: 'Text', value: 'TEXT' },
];

const RESULT_FLAG_OPTIONS: { label: string; value: NonNullable<TestResultTextOption['flag']> }[] = [
  { label: 'Normal (N)', value: 'N' },
  { label: 'High (H)', value: 'H' },
  { label: 'Low (L)', value: 'L' },
  { label: 'Critical High (HH)', value: 'HH' },
  { label: 'Critical Low (LL)', value: 'LL' },
  { label: 'Positive (POS)', value: 'POS' },
  { label: 'Negative (NEG)', value: 'NEG' },
  { label: 'Abnormal (ABN)', value: 'ABN' },
];

export function TestsPage() {
  const { isDark } = useTheme();
  const [tests, setTests] = useState<TestDto[]>([]);
  const [allTests, setAllTests] = useState<TestDto[]>([]);
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
      border: isDark ? '1px solid rgba(100,168,255,0.45)' : '1px solid #91caff',
      borderLeft: isDark ? '2px solid #3c89e8' : '2px solid #1677ff',
      borderRadius: 8,
      padding: 10,
      background: isDark ? 'rgba(255,255,255,0.03)' : '#f7fbff',
      height: '100%' as const,
    }),
    [isDark]
  );

  const loadTests = async () => {
    setLoading(true);
    try {
      const [data, allData] = await Promise.all([
        getTests(!showAll),
        getTests(false),
      ]);
      setTests(data);
      setAllTests(allData);
      setCategories(
        Array.from(new Set(allData.map((t) => t.category).filter((c): c is string => Boolean(c)))).sort(),
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

  useEffect(() => {
    getDepartments()
      .then((data) => setDepartments(data))
      .catch(() => undefined);
  }, []);

  const departmentsById = useMemo(
    () => new Map(departments.map((department) => [department.id, department])),
    [departments],
  );

  const panelComponentOptions = useMemo(
    () =>
      allTests
        .filter((test) => test.type === 'SINGLE')
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((test) => ({
          label: `${test.code} - ${test.name}`,
          value: test.id,
        })),
    [allTests],
  );

  const handleOpenModal = async (test?: TestDto) => {
    const [shiftList, deptList, latestAllTests] = await Promise.all([
      getShifts().catch(() => []),
      getDepartments().catch(() => []),
      getTests(false).catch(() => []),
    ]);
    setShifts(shiftList);
    setDepartments(deptList);
    setAllTests(latestAllTests);
    const initialPrices: Record<string, number> = { default: 0 };
    shiftList.forEach((s) => { initialPrices[s.id] = 0; });
    if (test) {
      const fullTest = await getTest(test.id).catch(() => test);
      setEditingTest(fullTest);
      form.setFieldsValue({
        ...fullTest,
        category: fullTest.category || undefined,
        normalMin: fullTest.normalMin ?? undefined,
        normalMax: fullTest.normalMax ?? undefined,
        normalMinMale: fullTest.normalMinMale ?? undefined,
        normalMaxMale: fullTest.normalMaxMale ?? undefined,
        normalMinFemale: fullTest.normalMinFemale ?? undefined,
        normalMaxFemale: fullTest.normalMaxFemale ?? undefined,
        numericAgeRanges: (fullTest.numericAgeRanges ?? []).map((range) => ({
          sex: range.sex ?? 'ANY',
          minAgeYears: range.minAgeYears ?? undefined,
          maxAgeYears: range.maxAgeYears ?? undefined,
          normalMin: range.normalMin ?? undefined,
          normalMax: range.normalMax ?? undefined,
        })),
        departmentId: fullTest.departmentId ?? undefined,
        expectedCompletionMinutes: fullTest.expectedCompletionMinutes ?? undefined,
        resultEntryType: fullTest.resultEntryType ?? 'NUMERIC',
        allowCustomResultText: Boolean(fullTest.allowCustomResultText),
        resultTextOptions: (fullTest.resultTextOptions ?? []).map((option) => ({
          value: option.value,
          flag: option.flag ?? undefined,
          isDefault: Boolean(option.isDefault),
        })),
        parameterDefinitions: (fullTest.parameterDefinitions ?? []).map((p) => ({
          code: p.code,
          label: p.label,
          type: p.type,
          options: p.options?.length ? p.options.join(', ') : '',
          normalOptions: p.normalOptions ?? [],
          defaultValue: p.defaultValue ?? undefined,
        })),
        panelComponentTestIds: (fullTest.panelComponents ?? [])
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((component) => component.childTestId),
      });
      const pricing = await getTestPricing(fullTest.id).catch(() => []);
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
        numericAgeRanges: [],
        resultEntryType: 'NUMERIC',
        allowCustomResultText: false,
        resultTextOptions: [],
        panelComponentTestIds: [],
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

  const handleSubmit = async (
    values: CreateTestDto & {
      category?: string | string[] | null;
      parameterDefinitions?: {
        code: string;
        label: string;
        type: 'select' | 'text';
        options?: string;
        normalOptions?: string[];
        defaultValue?: string;
      }[];
      numericAgeRanges?: TestNumericAgeRange[];
      resultEntryType?: TestResultEntryType;
      allowCustomResultText?: boolean;
      resultTextOptions?: {
        value: string;
        flag?: TestResultTextOption['flag'];
        isDefault?: boolean;
      }[];
      panelComponentTestIds?: string[];
      type?: TestType;
    },
  ) => {
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
    const normalizedNumericAgeRanges =
      (values.numericAgeRanges ?? [])
        .map((range) => ({
          sex: (range.sex || 'ANY') as 'ANY' | 'M' | 'F',
          minAgeYears:
            range.minAgeYears === null || range.minAgeYears === undefined
              ? null
              : Number(range.minAgeYears),
          maxAgeYears:
            range.maxAgeYears === null || range.maxAgeYears === undefined
              ? null
              : Number(range.maxAgeYears),
          normalMin:
            range.normalMin === null || range.normalMin === undefined
              ? null
              : Number(range.normalMin),
          normalMax:
            range.normalMax === null || range.normalMax === undefined
              ? null
              : Number(range.normalMax),
        }))
        .filter((range) => range.normalMin !== null || range.normalMax !== null) ?? [];
    const normalizedResultTextOptions =
      (values.resultTextOptions ?? [])
        .map((option) => ({
          value: option.value?.trim() ?? '',
          flag: option.flag ?? null,
          isDefault: Boolean(option.isDefault),
        }))
        .filter((option) => option.value.length > 0);
    const resultEntryType = values.resultEntryType ?? 'NUMERIC';
    const panelComponentTestIds = (values.panelComponentTestIds ?? []).filter(Boolean);

    if (
      normalizedResultTextOptions.filter((option) => option.isDefault).length > 1
    ) {
      message.error('Only one qualitative option can be marked as default');
      setSubmitting(false);
      return;
    }

    if (resultEntryType === 'QUALITATIVE' && normalizedResultTextOptions.length === 0) {
      message.error('Add at least one result text option for qualitative tests');
      setSubmitting(false);
      return;
    }

    const payload: CreateTestDto = {
      ...values,
      category: categoryValue ? categoryValue.trim() || null : null,
      parameterDefinitions: paramDefs,
      numericAgeRanges: normalizedNumericAgeRanges.length
        ? normalizedNumericAgeRanges
        : null,
      resultEntryType: isPanel ? 'NUMERIC' : resultEntryType,
      allowCustomResultText: isPanel ? false : Boolean(values.allowCustomResultText),
      resultTextOptions: isPanel
        ? null
        : normalizedResultTextOptions.length
          ? normalizedResultTextOptions
          : null,
      panelComponentTestIds: isPanel ? panelComponentTestIds : null,
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
    } catch (err: unknown) {
      const backendMessage =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string | string[] } } }).response?.data?.message
          : undefined;

      const text =
        Array.isArray(backendMessage)
          ? backendMessage.join(', ')
          : backendMessage;

      message.error(text || 'Failed to delete test');
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
    const ageRulesCount = test.numericAgeRanges?.length ?? 0;
    if (test.normalText) return test.normalText;
    if (test.normalMin !== null || test.normalMax !== null) {
      const min = test.normalMin !== null ? test.normalMin : '-';
      const max = test.normalMax !== null ? test.normalMax : '-';
      const base = `${min} - ${max}${test.unit ? ` ${test.unit}` : ''}`;
      return ageRulesCount > 0 ? `${base} (+${ageRulesCount} age rule${ageRulesCount > 1 ? 's' : ''})` : base;
    }
    if (ageRulesCount > 0) return `Age-based (${ageRulesCount} rule${ageRulesCount > 1 ? 's' : ''})`;
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
      width: 320,
      ellipsis: true,
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      width: 160,
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
      title: 'Department',
      dataIndex: 'departmentId',
      key: 'departmentId',
      width: 190,
      filters: departments.map((department) => ({
        text: `${department.code} - ${department.name}`,
        value: department.id,
      })),
      onFilter: (value, record) => (record.departmentId || '') === value,
      render: (departmentId: string | null) => {
        if (!departmentId) return <Text type="secondary">â€”</Text>;
        const department = departmentsById.get(departmentId);
        if (!department) return <Text type="secondary">â€”</Text>;
        return <Tag color="cyan">{department.code} - {department.name}</Tag>;
      },
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
      width: 190,
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
      width: 150,
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
      <style>{`
        .tests-editor-modal .ant-modal-content {
          border: 1px solid #91caff;
          border-radius: 10px;
          overflow: hidden;
        }
        .tests-editor-modal .ant-modal-header {
          border-bottom: 1px solid #91caff;
          padding: 10px 14px !important;
        }
        .tests-editor-modal .ant-modal-body {
          padding: 10px 14px 12px !important;
        }
        .tests-editor-modal .ant-form-item {
          margin-bottom: 10px !important;
        }
        .tests-editor-modal .ant-form-item-label > label {
          font-size: 12px;
          line-height: 1.2;
        }
        .tests-editor-modal .ant-divider {
          margin: 10px 0 !important;
          font-size: 12px !important;
        }
        .tests-editor-modal .ant-tabs-nav {
          margin-bottom: 8px !important;
        }
        .tests-editor-modal .ant-tabs-tab {
          padding: 4px 0 !important;
        }
        .tests-editor-modal .tests-editor-panel {
          border: 1px solid #91caff;
          border-left: 2px solid #1677ff;
          border-radius: 8px;
          background: #f7fbff;
          padding: 10px;
          margin-bottom: 10px;
        }
        .tests-editor-modal .tests-editor-params-scroll {
          max-height: 62vh;
          overflow-y: auto;
          overflow-x: hidden;
          padding-right: 6px;
        }
        .tests-editor-modal .tests-editor-param-grid .ant-form-item,
        .tests-editor-modal .tests-editor-param-meta .ant-form-item {
          margin-bottom: 0 !important;
        }
        .tests-editor-modal .tests-editor-param-meta {
          margin-top: 6px;
        }
        .tests-editor-modal .tests-editor-params-scroll::-webkit-scrollbar {
          width: 8px;
        }
        .tests-editor-modal .tests-editor-params-scroll::-webkit-scrollbar-thumb {
          background: #91caff;
          border-radius: 6px;
        }
        .tests-editor-modal .tests-editor-params-scroll::-webkit-scrollbar-track {
          background: rgba(22, 119, 255, 0.08);
          border-radius: 6px;
        }
        html[data-theme='dark'] .tests-editor-modal .ant-modal-content {
          border-color: rgba(100, 168, 255, 0.55);
        }
        html[data-theme='dark'] .tests-editor-modal .ant-modal-header {
          border-bottom-color: rgba(100, 168, 255, 0.55);
        }
        html[data-theme='dark'] .tests-editor-modal .tests-editor-panel {
          border-color: rgba(100, 168, 255, 0.55);
          border-left-color: #3c89e8;
          background: rgba(255, 255, 255, 0.03);
        }
        html[data-theme='dark'] .tests-editor-modal .tests-editor-params-scroll::-webkit-scrollbar-thumb {
          background: rgba(100, 168, 255, 0.65);
        }
        html[data-theme='dark'] .tests-editor-modal .tests-editor-params-scroll::-webkit-scrollbar-track {
          background: rgba(100, 168, 255, 0.16);
        }
      `}</style>
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
          tableLayout="fixed"
          scroll={{ x: 1500 }}
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
        className="tests-editor-modal"
        width={1240}
        style={{ top: 14 }}
        styles={{ body: { paddingTop: 8, paddingBottom: 10, maxHeight: '88vh', overflowY: 'auto' } }}
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
            resultEntryType: 'NUMERIC',
            allowCustomResultText: false,
            resultTextOptions: [],
          }}
        >
          <Form.Item noStyle shouldUpdate={(prev, curr) => prev?.type !== curr?.type}>
            {() => {
              const isPanel = form.getFieldValue('type') === 'PANEL';
              if (isPanel) return null;
              return (
                <div className="tests-editor-panel">
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
                </div>
              );
            }}
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prev, curr) =>
              prev?.type !== curr?.type ||
              prev?.resultEntryType !== curr?.resultEntryType
            }
          >
            {() => {
              if (form.getFieldValue('type') === 'PANEL') return null;
              const resultEntryType: TestResultEntryType =
                form.getFieldValue('resultEntryType') || 'NUMERIC';
              const showTextOptions =
                resultEntryType === 'QUALITATIVE' || resultEntryType === 'TEXT';

              return (
                <div className="tests-editor-panel">
                  <Text strong style={{ display: 'block', marginBottom: 8 }}>
                    Result Entry
                  </Text>
                  <Row gutter={16}>
                    <Col span={10}>
                      <Form.Item name="resultEntryType" label="Entry mode">
                        <Select options={RESULT_ENTRY_TYPES} />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item
                        name="allowCustomResultText"
                        label="Allow custom text"
                        valuePropName="checked"
                      >
                        <Switch disabled={resultEntryType === 'NUMERIC'} />
                      </Form.Item>
                    </Col>
                  </Row>

                  {showTextOptions && (
                    <Form.List name="resultTextOptions">
                      {(fields, { add, remove }) => (
                        <>
                          {fields.map(({ key, name, ...restField }) => (
                            <Row
                              key={key}
                              gutter={12}
                              align="bottom"
                              style={{
                                border: panelCardStyle.border,
                                borderRadius: 8,
                                padding: 10,
                                marginBottom: 8,
                                background: panelCardStyle.background,
                              }}
                            >
                              <Col span={10}>
                                <Form.Item
                                  {...restField}
                                  name={[name, 'value']}
                                  label="Option value"
                                  rules={[{ required: true, message: 'Value is required' }]}
                                >
                                  <Input placeholder="e.g. Positive, Negative, Reactive" />
                                </Form.Item>
                              </Col>
                              <Col span={7}>
                                <Form.Item {...restField} name={[name, 'flag']} label="Flag">
                                  <Select
                                    allowClear
                                    placeholder="Auto flag"
                                    options={RESULT_FLAG_OPTIONS}
                                  />
                                </Form.Item>
                              </Col>
                              <Col span={4}>
                                <Form.Item
                                  {...restField}
                                  name={[name, 'isDefault']}
                                  label="Default"
                                  valuePropName="checked"
                                >
                                  <Switch size="small" />
                                </Form.Item>
                              </Col>
                              <Col span={3}>
                                <Button danger type="text" onClick={() => remove(name)}>
                                  Remove
                                </Button>
                              </Col>
                            </Row>
                          ))}

                          <Button
                            type="dashed"
                            block
                            onClick={() => add({ value: '', flag: null, isDefault: false })}
                          >
                            + Add text option
                          </Button>
                        </>
                      )}
                    </Form.List>
                  )}
                </div>
              );
            }}
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(prev, curr) => prev?.type !== curr?.type}>
            {() => {
              if (form.getFieldValue('type') === 'PANEL') return null;
              return (
                <div className="tests-editor-panel">
                  <Text strong style={{ display: 'block', marginBottom: 8 }}>Normal Range</Text>
                  <Tabs
                    size="small"
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
                        key: 'age-sex',
                        label: 'By Age + Sex',
                        children: (
                          <>
                            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                              Optional overrides. If age + sex match, this range is used before general/gender range.
                            </Text>
                            <Form.List name="numericAgeRanges">
                              {(fields, { add, remove }) => (
                                <>
                                  {fields.map(({ key, name, ...restField }) => (
                                    <div
                                      key={key}
                                      style={{
                                        border: panelCardStyle.border,
                                        borderRadius: 8,
                                        padding: 10,
                                        marginBottom: 10,
                                        background: panelCardStyle.background,
                                      }}
                                    >
                                      <Row gutter={12} align="bottom">
                                        <Col span={4}>
                                          <Form.Item
                                            {...restField}
                                            name={[name, 'sex']}
                                            label="Sex"
                                            rules={[{ required: true, message: 'Required' }]}
                                            initialValue="ANY"
                                          >
                                            <Select
                                              options={[
                                                { label: 'Any', value: 'ANY' },
                                                { label: 'Male', value: 'M' },
                                                { label: 'Female', value: 'F' },
                                              ]}
                                            />
                                          </Form.Item>
                                        </Col>
                                        <Col span={4}>
                                          <Form.Item {...restField} name={[name, 'minAgeYears']} label="Min age (y)">
                                            <InputNumber style={{ width: '100%' }} min={0} placeholder="0" />
                                          </Form.Item>
                                        </Col>
                                        <Col span={4}>
                                          <Form.Item {...restField} name={[name, 'maxAgeYears']} label="Max age (y)">
                                            <InputNumber style={{ width: '100%' }} min={0} placeholder="120" />
                                          </Form.Item>
                                        </Col>
                                        <Col span={5}>
                                          <Form.Item {...restField} name={[name, 'normalMin']} label="Normal min">
                                            <InputNumber style={{ width: '100%' }} placeholder="Min value" />
                                          </Form.Item>
                                        </Col>
                                        <Col span={5}>
                                          <Form.Item {...restField} name={[name, 'normalMax']} label="Normal max">
                                            <InputNumber style={{ width: '100%' }} placeholder="Max value" />
                                          </Form.Item>
                                        </Col>
                                        <Col span={2}>
                                          <Button
                                            danger
                                            type="text"
                                            onClick={() => remove(name)}
                                            style={{ marginBottom: 8 }}
                                          >
                                            Remove
                                          </Button>
                                        </Col>
                                      </Row>
                                    </div>
                                  ))}
                                  <Button
                                    type="dashed"
                                    block
                                    onClick={() =>
                                      add({
                                        sex: 'ANY',
                                        minAgeYears: null,
                                        maxAgeYears: null,
                                        normalMin: null,
                                        normalMax: null,
                                      })
                                    }
                                  >
                                    + Add age rule
                                  </Button>
                                </>
                              )}
                            </Form.List>
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
                </div>
              );
            }}
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(prev, curr) => prev?.type !== curr?.type}>
            {() => {
              const isPanel = form.getFieldValue('type') === 'PANEL';
              if (!isPanel) {
                return (
                  <div className="tests-editor-panel">
                    <Form.Item name="description" label="Description" style={{ marginBottom: 0 }}>
                      <Input.TextArea rows={2} placeholder="Optional description or notes" />
                    </Form.Item>
                  </div>
                );
              }

              return (
                <Row gutter={16} align="stretch">
                  <Col span={10}>
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
                      <Form.Item
                        name="panelComponentTestIds"
                        label="Panel subtests"
                        style={{ marginBottom: 12 }}
                        extra="Choose the child tests included in this panel (for example CBC and GUE analytes)."
                      >
                        <Select
                          mode="multiple"
                          placeholder="Select subtests"
                          showSearch
                          optionFilterProp="label"
                          options={panelComponentOptions.filter((option) => option.value !== editingTest?.id)}
                        />
                      </Form.Item>
                      <Form.Item name="description" label="Description" style={{ marginBottom: 0 }}>
                        <Input.TextArea rows={3} placeholder="Optional description or notes" />
                      </Form.Item>
                    </div>
                  </Col>
                  <Col span={14}>
                    <div style={panelCardStyle}>
                      <Text strong style={{ display: 'block', marginBottom: 4 }}>Result parameters (for panel tests)</Text>
                      <Text style={{ marginBottom: 8, display: 'block' }}>
                        Define dropdown or text fields shown when entering results in the worklist (e.g. color: yellow, red, dark).
                      </Text>
                      <div className="tests-editor-params-scroll">
                        <Form.List name="parameterDefinitions">
                          {(fields, { add, remove }) => (
                            <>
                            {fields.map(({ key, name, ...rest }) => (
                              <div
                                key={key}
                                style={{
                                  marginBottom: 10,
                                  padding: '8px 0',
                                  borderBottom: panelCardStyle.border,
                                }}
                              >
                                <div
                                  className="tests-editor-param-grid"
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: '96px minmax(120px, 1fr) 128px minmax(200px, 1.6fr) auto',
                                    gap: 8,
                                    alignItems: 'start',
                                  }}
                                >
                                  <Form.Item
                                    {...rest}
                                    name={[name, 'code']}
                                    label="Code"
                                    rules={[{ required: true }]}
                                    style={{ minWidth: 90 }}
                                  >
                                    <Input placeholder="e.g. color" />
                                  </Form.Item>
                                  <Form.Item
                                    {...rest}
                                    name={[name, 'label']}
                                    label="Label"
                                    rules={[{ required: true }]}
                                    style={{ minWidth: 120 }}
                                  >
                                    <Input placeholder="e.g. Color" />
                                  </Form.Item>
                                  <Form.Item
                                    {...rest}
                                    name={[name, 'type']}
                                    label="Type"
                                    style={{ minWidth: 110 }}
                                  >
                                    <Select options={[{ label: 'Dropdown', value: 'select' }, { label: 'Text', value: 'text' }]} />
                                  </Form.Item>
                                  <Form.Item
                                    {...rest}
                                    name={[name, 'options']}
                                    label="Options (for dropdown)"
                                    style={{ minWidth: 200 }}
                                  >
                                    <Input placeholder="Comma-separated, e.g. yellow, red, dark" />
                                  </Form.Item>
                                  <Button
                                    type="text"
                                    danger
                                    onClick={() => remove(name)}
                                    style={{ marginTop: 24, paddingInline: 4, alignSelf: 'start' }}
                                  >
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
                                      <div
                                        className="tests-editor-param-meta"
                                        style={{
                                          display: 'grid',
                                          gridTemplateColumns: 'minmax(220px, 1fr) minmax(190px, 1fr)',
                                          gap: 12,
                                          alignItems: 'start',
                                        }}
                                      >
                                        {isSelect && optionList.length > 0 && (
                                          <Form.Item
                                            {...rest}
                                            name={[name, 'normalOptions']}
                                            label="Normal range"
                                            style={{ minWidth: 200 }}
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
                                          style={{ minWidth: 180 }}
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
                    </div>
                  </Col>
                </Row>
              );
            }}
          </Form.Item>

          <div className="tests-editor-panel">
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
          </div>

          <div className="tests-editor-panel">
            <Text strong style={{ display: 'block', marginBottom: 8 }}>Price per shift</Text>
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
              <Row gutter={16} style={{ marginTop: 8 }}>
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
          </div>

          {editingTest && (
            <div className="tests-editor-panel">
              <Text strong style={{ display: 'block', marginBottom: 6 }}>
                <ApiOutlined style={{ marginRight: 6 }} />
                Receive results from instruments
              </Text>
              <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                When an instrument sends a result with this code, it maps to this test.
              </Text>
              {loadingMappings ? (
                <Text type="secondary">Loading mappings...</Text>
              ) : testMappings.length > 0 ? (
                <div style={{ marginBottom: 10, border: panelCardStyle.border, borderRadius: 8, padding: 10, background: panelCardStyle.background }}>
                  {testMappings.map((m) => (
                    <div
                      key={m.id}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid transparent' }}
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
            </div>
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

