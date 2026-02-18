import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  Switch,
  message,
  Typography,
  Tooltip,
  Tabs,
  Descriptions,
  Badge,
  Popconfirm,
  Divider,
  Alert,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  ApiOutlined,
  LinkOutlined,
  DisconnectOutlined,
  SettingOutlined,
  MessageOutlined,
  EyeOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  ClearOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import {
  getInstruments,
  createInstrument,
  updateInstrument,
  deleteInstrument,
  toggleInstrumentActive,
  restartInstrumentConnection,
  getInstrumentMappings,
  createInstrumentMapping,
  deleteInstrumentMapping,
  getInstrumentMessages,
  simulateInstrumentMessage,
  getTests,
  type InstrumentDto,
  type InstrumentMappingDto,
  type InstrumentMessageDto,
  type TestDto,
} from '../../api/client';

const { Title, Text } = Typography;

const protocolOptions = [
  { value: 'HL7_V2', label: 'HL7 v2.x' },
  { value: 'ASTM', label: 'ASTM E1381/E1394' },
  { value: 'POCT1A', label: 'POCT1-A' },
  { value: 'CUSTOM', label: 'Custom' },
];

const connectionTypeOptions = [
  { value: 'TCP_SERVER', label: 'TCP Server (LIS listens)' },
  { value: 'TCP_CLIENT', label: 'TCP Client (LIS connects)' },
  { value: 'SERIAL', label: 'Serial Port (RS-232)' },
  { value: 'FILE_WATCH', label: 'File Watch' },
];

const statusColors: Record<string, string> = {
  ONLINE: 'success',
  OFFLINE: 'default',
  ERROR: 'error',
  CONNECTING: 'processing',
};

export function SettingsInstrumentsPage() {
  const [loading, setLoading] = useState(false);
  const [instruments, setInstruments] = useState<InstrumentDto[]>([]);
  const [tests, setTests] = useState<TestDto[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingInstrument, setEditingInstrument] = useState<InstrumentDto | null>(null);
  const [form] = Form.useForm();

  // Detail modal
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedInstrument, setSelectedInstrument] = useState<InstrumentDto | null>(null);
  const [mappings, setMappings] = useState<InstrumentMappingDto[]>([]);
  const [messages, setMessages] = useState<InstrumentMessageDto[]>([]);
  const [messagesTotal, setMessagesTotal] = useState(0);
  const [activeTab, setActiveTab] = useState('mappings');

  // Mapping modal
  const [mappingModalOpen, setMappingModalOpen] = useState(false);
  const [mappingForm] = Form.useForm();

  // Live tracker modal
  const [trackerModalOpen, setTrackerModalOpen] = useState(false);
  const [trackerInstrument, setTrackerInstrument] = useState<InstrumentDto | null>(null);
  const [trackerMessages, setTrackerMessages] = useState<InstrumentMessageDto[]>([]);
  const [trackerRunning, setTrackerRunning] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState<InstrumentMessageDto | null>(null);
  const trackerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Simulator
  const [simulatorMessage, setSimulatorMessage] = useState('');
  const [simulatorSending, setSimulatorSending] = useState(false);

  const loadInstruments = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getInstruments();
      setInstruments(data);
    } catch {
      message.error('Failed to load instruments');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTests = useCallback(async () => {
    try {
      const data = await getTests();
      setTests(data);
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    loadInstruments();
    loadTests();
  }, [loadInstruments, loadTests]);

  const loadMappings = async (instrumentId: string) => {
    try {
      const data = await getInstrumentMappings(instrumentId);
      setMappings(data);
    } catch {
      message.error('Failed to load mappings');
    }
  };

  const loadMessages = async (instrumentId: string, page = 1) => {
    try {
      const result = await getInstrumentMessages(instrumentId, { page, size: 20 });
      setMessages(result.items);
      setMessagesTotal(result.total);
    } catch {
      message.error('Failed to load messages');
    }
  };

  const handleOpenCreate = () => {
    setEditingInstrument(null);
    form.resetFields();
    form.setFieldsValue({
      protocol: 'HL7_V2',
      connectionType: 'TCP_SERVER',
      autoPost: true,
      requireVerification: false,
      isActive: true,
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (instrument: InstrumentDto) => {
    setEditingInstrument(instrument);
    form.setFieldsValue(instrument);
    setModalOpen(true);
  };

  const handleOpenDetail = async (instrument: InstrumentDto) => {
    setSelectedInstrument(instrument);
    setActiveTab('mappings');
    setDetailModalOpen(true);
    await loadMappings(instrument.id);
    await loadMessages(instrument.id);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingInstrument) {
        await updateInstrument(editingInstrument.id, values);
        message.success('Instrument updated');
      } else {
        await createInstrument(values);
        message.success('Instrument created');
      }
      setModalOpen(false);
      loadInstruments();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : 'Failed to save';
      message.error(msg || 'Failed to save instrument');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteInstrument(id);
      message.success('Instrument deleted');
      loadInstruments();
    } catch {
      message.error('Failed to delete instrument');
    }
  };

  const handleToggleActive = async (id: string) => {
    try {
      await toggleInstrumentActive(id);
      loadInstruments();
    } catch {
      message.error('Failed to toggle status');
    }
  };

  const handleRestart = async (id: string) => {
    try {
      const result = await restartInstrumentConnection(id);
      if (result.success) {
        message.success('Connection restarted');
      } else {
        message.warning('Failed to restart connection');
      }
      loadInstruments();
    } catch {
      message.error('Failed to restart connection');
    }
  };

  const handleAddMapping = () => {
    mappingForm.resetFields();
    setMappingModalOpen(true);
  };

  const handleSubmitMapping = async () => {
    if (!selectedInstrument) return;
    try {
      const values = await mappingForm.validateFields();
      await createInstrumentMapping(selectedInstrument.id, values);
      message.success('Mapping added');
      setMappingModalOpen(false);
      loadMappings(selectedInstrument.id);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : 'Failed to save';
      message.error(msg || 'Failed to add mapping');
    }
  };

  const handleDeleteMapping = async (mappingId: string) => {
    if (!selectedInstrument) return;
    try {
      await deleteInstrumentMapping(selectedInstrument.id, mappingId);
      message.success('Mapping deleted');
      loadMappings(selectedInstrument.id);
    } catch {
      message.error('Failed to delete mapping');
    }
  };

  // Live Tracker functions
  const handleOpenTracker = (instrument: InstrumentDto) => {
    setTrackerInstrument(instrument);
    setTrackerMessages([]);
    setSelectedMessage(null);
    setTrackerRunning(true);
    setTrackerModalOpen(true);
    loadTrackerMessages(instrument.id);
  };

  const loadTrackerMessages = async (instrumentId: string) => {
    try {
      const result = await getInstrumentMessages(instrumentId, { page: 1, size: 50 });
      setTrackerMessages(result.items);
    } catch {
      // Silently fail
    }
  };

  // Auto-refresh tracker
  useEffect(() => {
    if (trackerModalOpen && trackerRunning && trackerInstrument) {
      trackerIntervalRef.current = setInterval(() => {
        loadTrackerMessages(trackerInstrument.id);
      }, 3000); // Refresh every 3 seconds
    }

    return () => {
      if (trackerIntervalRef.current) {
        clearInterval(trackerIntervalRef.current);
        trackerIntervalRef.current = null;
      }
    };
  }, [trackerModalOpen, trackerRunning, trackerInstrument]);

  const handleCloseTracker = () => {
    setTrackerModalOpen(false);
    setTrackerInstrument(null);
    setTrackerMessages([]);
    setSelectedMessage(null);
    if (trackerIntervalRef.current) {
      clearInterval(trackerIntervalRef.current);
      trackerIntervalRef.current = null;
    }
  };

  const formatHL7Message = (raw: string) => {
    // Format HL7 message with line breaks for each segment
    return raw
      .replace(/\r\n|\r|\n/g, '\n')
      .split(/(?=MSH|PID|PV1|ORC|OBR|OBX|NTE|MSA|ERR)/g)
      .filter(s => s.trim())
      .join('\n');
  };

  const handleSimulateSend = async () => {
    if (!trackerInstrument || !simulatorMessage.trim()) {
      message.warning('Please enter a message to simulate');
      return;
    }

    setSimulatorSending(true);
    try {
      const result = await simulateInstrumentMessage(trackerInstrument.id, simulatorMessage);
      if (result.success) {
        message.success(result.message || 'Message processed successfully');
        setSimulatorMessage('');
        // Refresh messages to see the result
        loadTrackerMessages(trackerInstrument.id);
      } else {
        message.error(result.message || 'Failed to process message');
      }
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : 'Failed to simulate message';
      message.error(msg || 'Failed to simulate message');
    } finally {
      setSimulatorSending(false);
    }
  };

  // Sample HL7 ORU messages for testing
  const getTimestamp = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  
  const sampleMessages: Record<string, { name: string; message: string }> = {
    cbc: {
      name: 'CBC Panel (Full)',
      message: `MSH|^~\\&|HEMATOLOGY|LAB|LIS|HOSPITAL|${getTimestamp()}||ORU^R01|MSG${Date.now()}|P|2.5
PID|1||PAT001||Doe^John||19800101|M
OBR|1|ORD001|SAM001|CBC^Complete Blood Count||${getTimestamp()}
OBX|1|NM|WBC^White Blood Cell Count||7.5|10^9/L|4.0-11.0|N|||F
OBX|2|NM|RBC^Red Blood Cell Count||4.82|10^12/L|4.5-5.5|N|||F
OBX|3|NM|HGB^Hemoglobin||14.2|g/dL|12.0-16.0|N|||F
OBX|4|NM|HCT^Hematocrit||42.5|%|36-46|N|||F
OBX|5|NM|MCV^Mean Corpuscular Volume||88.2|fL|80-100|N|||F
OBX|6|NM|MCH^Mean Corpuscular Hemoglobin||29.5|pg|27-33|N|||F
OBX|7|NM|MCHC^Mean Corpuscular Hemoglobin Concentration||33.4|g/dL|32-36|N|||F
OBX|8|NM|RDW^Red Cell Distribution Width||13.2|%|11.5-14.5|N|||F
OBX|9|NM|PLT^Platelet Count||245|10^9/L|150-400|N|||F
OBX|10|NM|MPV^Mean Platelet Volume||9.8|fL|7.5-11.5|N|||F
OBX|11|NM|NEU%^Neutrophils %||58.5|%|40-70|N|||F
OBX|12|NM|LYM%^Lymphocytes %||32.0|%|20-40|N|||F
OBX|13|NM|MONO%^Monocytes %||6.5|%|2-8|N|||F
OBX|14|NM|EOS%^Eosinophils %||2.5|%|1-4|N|||F
OBX|15|NM|BASO%^Basophils %||0.5|%|0-1|N|||F
OBX|16|NM|NEU#^Neutrophils Absolute||4.39|10^9/L|2.0-7.0|N|||F
OBX|17|NM|LYM#^Lymphocytes Absolute||2.40|10^9/L|1.0-3.0|N|||F`,
    },
    chemistry: {
      name: 'Chemistry Panel (BMP)',
      message: `MSH|^~\\&|CHEMISTRY|LAB|LIS|HOSPITAL|${getTimestamp()}||ORU^R01|MSG${Date.now()}|P|2.5
PID|1||PAT001||Doe^John||19800101|M
OBR|1|ORD001|SAM001|BMP^Basic Metabolic Panel||${getTimestamp()}
OBX|1|NM|GLU^Glucose||95|mg/dL|70-100|N|||F
OBX|2|NM|BUN^Blood Urea Nitrogen||15|mg/dL|7-20|N|||F
OBX|3|NM|CREAT^Creatinine||1.0|mg/dL|0.7-1.3|N|||F
OBX|4|NM|NA^Sodium||140|mEq/L|136-145|N|||F
OBX|5|NM|K^Potassium||4.2|mEq/L|3.5-5.0|N|||F
OBX|6|NM|CL^Chloride||102|mEq/L|98-106|N|||F
OBX|7|NM|CO2^Carbon Dioxide||24|mEq/L|23-29|N|||F
OBX|8|NM|CA^Calcium||9.5|mg/dL|8.5-10.5|N|||F`,
    },
    liver: {
      name: 'Liver Function Panel',
      message: `MSH|^~\\&|CHEMISTRY|LAB|LIS|HOSPITAL|${getTimestamp()}||ORU^R01|MSG${Date.now()}|P|2.5
PID|1||PAT001||Doe^John||19800101|M
OBR|1|ORD001|SAM001|LFT^Liver Function Tests||${getTimestamp()}
OBX|1|NM|ALT^Alanine Aminotransferase||25|U/L|7-56|N|||F
OBX|2|NM|AST^Aspartate Aminotransferase||22|U/L|10-40|N|||F
OBX|3|NM|ALP^Alkaline Phosphatase||65|U/L|44-147|N|||F
OBX|4|NM|GGT^Gamma-Glutamyl Transferase||28|U/L|9-48|N|||F
OBX|5|NM|TBIL^Total Bilirubin||0.8|mg/dL|0.1-1.2|N|||F
OBX|6|NM|DBIL^Direct Bilirubin||0.2|mg/dL|0.0-0.3|N|||F
OBX|7|NM|ALB^Albumin||4.2|g/dL|3.5-5.0|N|||F
OBX|8|NM|TP^Total Protein||7.0|g/dL|6.0-8.3|N|||F`,
    },
    lipid: {
      name: 'Lipid Panel',
      message: `MSH|^~\\&|CHEMISTRY|LAB|LIS|HOSPITAL|${getTimestamp()}||ORU^R01|MSG${Date.now()}|P|2.5
PID|1||PAT001||Doe^John||19800101|M
OBR|1|ORD001|SAM001|LIPID^Lipid Panel||${getTimestamp()}
OBX|1|NM|CHOL^Total Cholesterol||185|mg/dL|<200|N|||F
OBX|2|NM|TRIG^Triglycerides||120|mg/dL|<150|N|||F
OBX|3|NM|HDL^HDL Cholesterol||55|mg/dL|>40|N|||F
OBX|4|NM|LDL^LDL Cholesterol||106|mg/dL|<100|H|||F
OBX|5|NM|VLDL^VLDL Cholesterol||24|mg/dL|5-40|N|||F`,
    },
    thyroid: {
      name: 'Thyroid Panel',
      message: `MSH|^~\\&|IMMUNOASSAY|LAB|LIS|HOSPITAL|${getTimestamp()}||ORU^R01|MSG${Date.now()}|P|2.5
PID|1||PAT001||Doe^John||19800101|M
OBR|1|ORD001|SAM001|THYROID^Thyroid Panel||${getTimestamp()}
OBX|1|NM|TSH^Thyroid Stimulating Hormone||2.5|mIU/L|0.4-4.0|N|||F
OBX|2|NM|FT4^Free T4||1.2|ng/dL|0.8-1.8|N|||F
OBX|3|NM|FT3^Free T3||3.0|pg/mL|2.3-4.2|N|||F
OBX|4|NM|T4^Total T4||7.5|ug/dL|4.5-12.0|N|||F
OBX|5|NM|T3^Total T3||120|ng/dL|80-200|N|||F`,
    },
    urinalysis: {
      name: 'Urinalysis',
      message: `MSH|^~\\&|URINALYSIS|LAB|LIS|HOSPITAL|${getTimestamp()}||ORU^R01|MSG${Date.now()}|P|2.5
PID|1||PAT001||Doe^John||19800101|M
OBR|1|ORD001|SAM001|UA^Urinalysis||${getTimestamp()}
OBX|1|ST|COLOR^Color||Yellow|||||F
OBX|2|ST|CLARITY^Clarity||Clear|||||F
OBX|3|NM|SPGR^Specific Gravity||1.020||1.005-1.030|N|||F
OBX|4|NM|PH^pH||6.0||5.0-8.0|N|||F
OBX|5|ST|PROT^Protein||Negative|||||F
OBX|6|ST|GLUC^Glucose||Negative|||||F
OBX|7|ST|KET^Ketones||Negative|||||F
OBX|8|ST|BLOOD^Blood||Negative|||||F
OBX|9|ST|BILI^Bilirubin||Negative|||||F
OBX|10|ST|UROBI^Urobilinogen||Normal|||||F
OBX|11|ST|NIT^Nitrite||Negative|||||F
OBX|12|ST|LEUK^Leukocyte Esterase||Negative|||||F`,
    },
    coag: {
      name: 'Coagulation Panel',
      message: `MSH|^~\\&|COAGULATION|LAB|LIS|HOSPITAL|${getTimestamp()}||ORU^R01|MSG${Date.now()}|P|2.5
PID|1||PAT001||Doe^John||19800101|M
OBR|1|ORD001|SAM001|COAG^Coagulation Panel||${getTimestamp()}
OBX|1|NM|PT^Prothrombin Time||12.5|seconds|11.0-13.5|N|||F
OBX|2|NM|INR^International Normalized Ratio||1.0||0.8-1.2|N|||F
OBX|3|NM|PTT^Partial Thromboplastin Time||28|seconds|25-35|N|||F
OBX|4|NM|FIB^Fibrinogen||280|mg/dL|200-400|N|||F`,
    },
    abnormal: {
      name: 'Abnormal Results (High/Low)',
      message: `MSH|^~\\&|HEMATOLOGY|LAB|LIS|HOSPITAL|${getTimestamp()}||ORU^R01|MSG${Date.now()}|P|2.5
PID|1||PAT001||Doe^John||19800101|M
OBR|1|ORD001|SAM001|CBC^Complete Blood Count||${getTimestamp()}
OBX|1|NM|WBC^White Blood Cell Count||15.8|10^9/L|4.0-11.0|HH|||F
OBX|2|NM|RBC^Red Blood Cell Count||3.2|10^12/L|4.5-5.5|L|||F
OBX|3|NM|HGB^Hemoglobin||8.5|g/dL|12.0-16.0|LL|||F
OBX|4|NM|HCT^Hematocrit||28.0|%|36-46|L|||F
OBX|5|NM|PLT^Platelet Count||45|10^9/L|150-400|LL|||F`,
    },
  };

  const [selectedPanel, setSelectedPanel] = useState<string>('cbc');
  const sampleHL7Message = sampleMessages[selectedPanel]?.message || sampleMessages.cbc.message;

  const columns: ColumnsType<InstrumentDto> = [
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
      width: 180,
    },
    {
      title: 'Protocol',
      dataIndex: 'protocol',
      key: 'protocol',
      width: 100,
      render: (protocol: string) => {
        const opt = protocolOptions.find(o => o.value === protocol);
        return <Tag>{opt?.label || protocol}</Tag>;
      },
    },
    {
      title: 'Connection',
      key: 'connection',
      width: 150,
      render: (_, record) => {
        const opt = connectionTypeOptions.find(o => o.value === record.connectionType);
        return (
          <span>
            <Text type="secondary">{opt?.label.split('(')[0]}</Text>
            {record.port && <Text> :{record.port}</Text>}
          </span>
        );
      },
    },
    {
      title: 'Status',
      key: 'status',
      width: 120,
      render: (_, record) => (
        <Space>
          <Badge status={statusColors[record.status] as 'success' | 'default' | 'error' | 'processing'} />
          <Text>{record.status}</Text>
        </Space>
      ),
    },
    {
      title: 'Active',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 80,
      render: (isActive: boolean, record) => (
        <Switch checked={isActive} onChange={() => handleToggleActive(record.id)} size="small" />
      ),
    },
    {
      title: 'Last Message',
      dataIndex: 'lastMessageAt',
      key: 'lastMessageAt',
      width: 140,
      render: (date: string | null) => date ? dayjs(date).format('MM-DD HH:mm') : '—',
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 220,
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="Live Tracker">
            <Button size="small" type="primary" icon={<EyeOutlined />} onClick={() => handleOpenTracker(record)} />
          </Tooltip>
          <Tooltip title="Details & Mappings">
            <Button size="small" icon={<SettingOutlined />} onClick={() => handleOpenDetail(record)} />
          </Tooltip>
          <Tooltip title="Edit">
            <Button size="small" icon={<EditOutlined />} onClick={() => handleOpenEdit(record)} />
          </Tooltip>
          <Tooltip title="Restart Connection">
            <Button size="small" icon={<ReloadOutlined />} onClick={() => handleRestart(record.id)} />
          </Tooltip>
          <Popconfirm title="Delete this instrument?" onConfirm={() => handleDelete(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const mappingColumns: ColumnsType<InstrumentMappingDto> = [
    {
      title: 'Instrument Code',
      dataIndex: 'instrumentTestCode',
      key: 'instrumentTestCode',
      render: (code: string) => <Text code>{code}</Text>,
    },
    {
      title: 'Instrument Name',
      dataIndex: 'instrumentTestName',
      key: 'instrumentTestName',
      render: (name: string | null) => name || '—',
    },
    {
      title: 'LIS Test',
      dataIndex: 'testId',
      key: 'testId',
      render: (testId: string) => {
        const test = tests.find(t => t.id === testId);
        return test ? `${test.code} - ${test.name}` : testId;
      },
    },
    {
      title: 'Multiplier',
      dataIndex: 'multiplier',
      key: 'multiplier',
      width: 100,
      render: (m: number | null) => m ?? '1',
    },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_, record) => (
        <Popconfirm title="Delete mapping?" onConfirm={() => handleDeleteMapping(record.id)}>
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  const messageColumns: ColumnsType<InstrumentMessageDto> = [
    {
      title: 'Time',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 140,
      render: (date: string) => dayjs(date).format('MM-DD HH:mm:ss'),
    },
    {
      title: 'Direction',
      dataIndex: 'direction',
      key: 'direction',
      width: 80,
      render: (dir: string) => (
        <Tag color={dir === 'IN' ? 'blue' : 'green'}>
          {dir === 'IN' ? <LinkOutlined /> : <DisconnectOutlined />} {dir}
        </Tag>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'messageType',
      key: 'messageType',
      width: 80,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const colors: Record<string, string> = {
          RECEIVED: 'default',
          PROCESSED: 'success',
          ERROR: 'error',
          SENT: 'blue',
          ACKNOWLEDGED: 'green',
        };
        return <Tag color={colors[status]}>{status}</Tag>;
      },
    },
    {
      title: 'Error',
      dataIndex: 'errorMessage',
      key: 'errorMessage',
      ellipsis: true,
      render: (err: string | null) => err ? <Text type="danger">{err}</Text> : '—',
    },
  ];

  const connectionType = Form.useWatch('connectionType', form);

  return (
    <div>
      <Title level={3}>Instrument Integration</Title>

      <Card
        title={
          <Space>
            <ApiOutlined />
            <span>Instruments</span>
          </Space>
        }
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate}>
            Add Instrument
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={instruments}
          rowKey="id"
          loading={loading}
          pagination={false}
          size="small"
        />
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        title={editingInstrument ? 'Edit Instrument' : 'Add Instrument'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Space style={{ display: 'flex' }} align="start">
            <Form.Item name="code" label="Code" rules={[{ required: true }]} style={{ width: 120 }}>
              <Input />
            </Form.Item>
            <Form.Item name="name" label="Name" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Input />
            </Form.Item>
          </Space>

          <Space style={{ display: 'flex' }} align="start">
            <Form.Item name="manufacturer" label="Manufacturer" style={{ flex: 1 }}>
              <Input />
            </Form.Item>
            <Form.Item name="model" label="Model" style={{ flex: 1 }}>
              <Input />
            </Form.Item>
          </Space>

          <Space style={{ display: 'flex' }} align="start">
            <Form.Item name="protocol" label="Protocol" rules={[{ required: true }]} style={{ width: 180 }}>
              <Select options={protocolOptions} />
            </Form.Item>
            <Form.Item name="connectionType" label="Connection Type" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={connectionTypeOptions} />
            </Form.Item>
          </Space>

          {(connectionType === 'TCP_SERVER' || connectionType === 'TCP_CLIENT') && (
            <Space style={{ display: 'flex' }} align="start">
              {connectionType === 'TCP_CLIENT' && (
                <Form.Item name="host" label="Host" rules={[{ required: true }]} style={{ flex: 1 }}>
                  <Input placeholder="e.g., 192.168.1.100" />
                </Form.Item>
              )}
              <Form.Item name="port" label="Port" rules={[{ required: true }]} style={{ width: 120 }}>
                <InputNumber min={1} max={65535} style={{ width: '100%' }} />
              </Form.Item>
            </Space>
          )}

          {connectionType === 'SERIAL' && (
            <Space style={{ display: 'flex' }} align="start">
              <Form.Item name="serialPort" label="Serial Port" rules={[{ required: true }]} style={{ width: 120 }}>
                <Input placeholder="COM1" />
              </Form.Item>
              <Form.Item name="baudRate" label="Baud Rate" style={{ width: 120 }}>
                <Select options={[
                  { value: 9600, label: '9600' },
                  { value: 19200, label: '19200' },
                  { value: 38400, label: '38400' },
                  { value: 57600, label: '57600' },
                  { value: 115200, label: '115200' },
                ]} />
              </Form.Item>
            </Space>
          )}

          {connectionType === 'FILE_WATCH' && (
            <Space style={{ display: 'flex' }} align="start">
              <Form.Item name="watchFolder" label="Watch Folder" rules={[{ required: true }]} style={{ flex: 1 }}>
                <Input placeholder="C:\Results" />
              </Form.Item>
              <Form.Item name="filePattern" label="File Pattern" style={{ width: 120 }}>
                <Input placeholder="*.txt" />
              </Form.Item>
            </Space>
          )}

          <Space style={{ display: 'flex' }} align="start">
            <Form.Item name="autoPost" label="Auto-post Results" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="requireVerification" label="Require Verification" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="isActive" label="Active" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
        </Form>
      </Modal>

      {/* Detail Modal */}
      <Modal
        title={
          <Space>
            <ApiOutlined />
            <span>{selectedInstrument?.name}</span>
            <Badge status={statusColors[selectedInstrument?.status || 'OFFLINE'] as 'success'} />
          </Space>
        }
        open={detailModalOpen}
        onCancel={() => setDetailModalOpen(false)}
        footer={null}
        width={800}
      >
        {selectedInstrument && (
          <>
            <Descriptions size="small" column={3} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Code">{selectedInstrument.code}</Descriptions.Item>
              <Descriptions.Item label="Protocol">{selectedInstrument.protocol}</Descriptions.Item>
              <Descriptions.Item label="Port">{selectedInstrument.port || '—'}</Descriptions.Item>
              <Descriptions.Item label="Last Connected">
                {selectedInstrument.lastConnectedAt
                  ? dayjs(selectedInstrument.lastConnectedAt).format('YYYY-MM-DD HH:mm')
                  : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Last Message">
                {selectedInstrument.lastMessageAt
                  ? dayjs(selectedInstrument.lastMessageAt).format('YYYY-MM-DD HH:mm')
                  : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Auto-post">
                {selectedInstrument.autoPost ? 'Yes' : 'No'}
              </Descriptions.Item>
            </Descriptions>

            {selectedInstrument.lastError && (
              <div style={{ marginBottom: 16, padding: 8, background: '#fff2f0', borderRadius: 4 }}>
                <Text type="danger">Error: {selectedInstrument.lastError}</Text>
              </div>
            )}

            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              items={[
                {
                  key: 'mappings',
                  label: (
                    <span>
                      <SettingOutlined /> Test Mappings
                    </span>
                  ),
                  children: (
                    <>
                      <Button
                        type="primary"
                        size="small"
                        icon={<PlusOutlined />}
                        onClick={handleAddMapping}
                        style={{ marginBottom: 8 }}
                      >
                        Add Mapping
                      </Button>
                      <Table
                        columns={mappingColumns}
                        dataSource={mappings}
                        rowKey="id"
                        pagination={false}
                        size="small"
                      />
                    </>
                  ),
                },
                {
                  key: 'messages',
                  label: (
                    <span>
                      <MessageOutlined /> Messages ({messagesTotal})
                    </span>
                  ),
                  children: (
                    <Table
                      columns={messageColumns}
                      dataSource={messages}
                      rowKey="id"
                      pagination={{
                        total: messagesTotal,
                        pageSize: 20,
                        onChange: (page) => loadMessages(selectedInstrument.id, page),
                      }}
                      size="small"
                    />
                  ),
                },
              ]}
            />
          </>
        )}
      </Modal>

      {/* Mapping Modal */}
      <Modal
        title="Add Test Mapping"
        open={mappingModalOpen}
        onCancel={() => setMappingModalOpen(false)}
        onOk={handleSubmitMapping}
      >
        <Form form={mappingForm} layout="vertical">
          <Form.Item name="instrumentTestCode" label="Instrument Test Code" rules={[{ required: true }]}>
            <Input placeholder="Code used by the instrument" />
          </Form.Item>
          <Form.Item name="instrumentTestName" label="Instrument Test Name">
            <Input placeholder="Optional name" />
          </Form.Item>
          <Form.Item name="testId" label="LIS Test" rules={[{ required: true }]}>
            <Select
              showSearch
              placeholder="Select LIS test"
              optionFilterProp="children"
              filterOption={(input, option) =>
                (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
              }
              options={tests.map(t => ({
                value: t.id,
                label: `${t.code} - ${t.name}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="multiplier" label="Unit Multiplier" help="Multiply instrument value by this factor">
            <InputNumber step={0.1} placeholder="1" style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Live Tracker Modal */}
      <Modal
        title={
          <Space>
            <EyeOutlined />
            <span>Live Message Tracker - {trackerInstrument?.name}</span>
            <Badge
              status={trackerInstrument?.status === 'ONLINE' ? 'success' : 'default'}
              text={trackerInstrument?.status}
            />
          </Space>
        }
        open={trackerModalOpen}
        onCancel={handleCloseTracker}
        footer={null}
        width={1000}
        styles={{ body: { maxHeight: '70vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' } }}
      >
        {trackerInstrument && (
          <>
            {/* Controls */}
            <Space style={{ marginBottom: 16 }}>
              <Button
                type={trackerRunning ? 'default' : 'primary'}
                icon={trackerRunning ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                onClick={() => setTrackerRunning(!trackerRunning)}
              >
                {trackerRunning ? 'Pause' : 'Resume'}
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => loadTrackerMessages(trackerInstrument.id)}
              >
                Refresh Now
              </Button>
              <Button
                icon={<ClearOutlined />}
                onClick={() => {
                  setTrackerMessages([]);
                  setSelectedMessage(null);
                }}
              >
                Clear View
              </Button>
              {trackerRunning && (
                <Tag color="green">
                  <Badge status="processing" /> Auto-refreshing every 3s
                </Tag>
              )}
            </Space>

            {trackerInstrument.lastError && (
              <Alert
                type="error"
                message={trackerInstrument.lastError}
                style={{ marginBottom: 16 }}
                closable
              />
            )}

            {/* Simulator */}
            <Card 
              size="small" 
              title={<><ApiOutlined /> Message Simulator - Test Panels</>}
              style={{ marginBottom: 16 }}
              extra={
                <Space>
                  <Select
                    value={selectedPanel}
                    onChange={(v) => setSelectedPanel(v)}
                    style={{ width: 180 }}
                    size="small"
                    options={Object.entries(sampleMessages).map(([key, val]) => ({
                      value: key,
                      label: val.name,
                    }))}
                  />
                  <Button size="small" type="primary" onClick={() => setSimulatorMessage(sampleHL7Message)}>
                    Load Panel
                  </Button>
                </Space>
              }
            >
              <Input.TextArea
                value={simulatorMessage}
                onChange={(e) => setSimulatorMessage(e.target.value)}
                placeholder="Paste HL7 message here or select a test panel above and click 'Load Panel'..."
                rows={5}
                style={{ fontFamily: 'Consolas, Monaco, monospace', fontSize: 11, marginBottom: 8 }}
              />
              <Space wrap>
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  onClick={handleSimulateSend}
                  loading={simulatorSending}
                  disabled={!simulatorMessage.trim()}
                >
                  Process Message
                </Button>
                <Button onClick={() => setSimulatorMessage('')}>
                  Clear
                </Button>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  Paste an HL7 message and click Process to simulate receiving it from the instrument
                </Text>
              </Space>
            </Card>

            <Divider style={{ margin: '8px 0' }} />

            <div style={{ display: 'flex', flex: 1, gap: 16, minHeight: 0 }}>
              {/* Message List */}
              <div style={{ width: '40%', display: 'flex', flexDirection: 'column' }}>
                <Text strong style={{ marginBottom: 8 }}>
                  Recent Messages ({trackerMessages.length})
                </Text>
                <div
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    border: '1px solid #d9d9d9',
                    borderRadius: 4,
                    maxHeight: '50vh',
                  }}
                >
                  {trackerMessages.length === 0 ? (
                    <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>
                      No messages yet. Waiting for data from instrument...
                    </div>
                  ) : (
                    trackerMessages.map((msg) => (
                      <div
                        key={msg.id}
                        onClick={() => setSelectedMessage(msg)}
                        style={{
                          padding: '8px 12px',
                          borderBottom: '1px solid #f0f0f0',
                          cursor: 'pointer',
                          background: selectedMessage?.id === msg.id ? '#e6f7ff' : 'transparent',
                        }}
                      >
                        <Space size="small" style={{ width: '100%', justifyContent: 'space-between' }}>
                          <Space size="small">
                            <Tag color={msg.direction === 'IN' ? 'blue' : 'green'} style={{ margin: 0 }}>
                              {msg.direction === 'IN' ? <LinkOutlined /> : <DisconnectOutlined />}
                              {msg.direction}
                            </Tag>
                            <Tag
                              color={
                                msg.status === 'PROCESSED' || msg.status === 'ACKNOWLEDGED' ? 'success' :
                                msg.status === 'ERROR' ? 'error' :
                                msg.status === 'RECEIVED' ? 'processing' :
                                msg.status === 'SENT' ? 'cyan' : 'default'
                              }
                              style={{ margin: 0 }}
                            >
                              {msg.status}
                            </Tag>
                          </Space>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {dayjs(msg.createdAt).format('HH:mm:ss')}
                          </Text>
                        </Space>
                        <div style={{ marginTop: 4, fontSize: 12, color: '#666' }}>
                          <Text ellipsis style={{ maxWidth: 250 }}>
                            {msg.messageType || 'Unknown'} - {(msg.rawMessage || '').substring(0, 50)}...
                          </Text>
                        </div>
                        {msg.errorMessage && (
                          <Text type="danger" style={{ fontSize: 11 }}>
                            {msg.errorMessage}
                          </Text>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Message Detail */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <Text strong style={{ marginBottom: 8 }}>
                  Message Content
                </Text>
                <div
                  style={{
                    flex: 1,
                    border: '1px solid #d9d9d9',
                    borderRadius: 4,
                    background: '#1e1e1e',
                    maxHeight: '50vh',
                    overflowY: 'auto',
                  }}
                >
                  {selectedMessage ? (
                    <div style={{ padding: 12 }}>
                      <div style={{ marginBottom: 12 }}>
                        <Space split={<Divider type="vertical" />}>
                          <Text style={{ color: '#fff' }}>
                            <strong>Type:</strong> {selectedMessage.messageType || 'Unknown'}
                          </Text>
                          <Text style={{ color: '#fff' }}>
                            <strong>Time:</strong> {dayjs(selectedMessage.createdAt).format('YYYY-MM-DD HH:mm:ss')}
                          </Text>
                          <Tag color={selectedMessage.direction === 'IN' ? 'blue' : 'green'}>
                            {selectedMessage.direction}
                          </Tag>
                        </Space>
                      </div>
                      <Divider style={{ borderColor: '#444', margin: '8px 0' }} />
                      <pre
                        style={{
                          margin: 0,
                          fontFamily: 'Consolas, Monaco, monospace',
                          fontSize: 13,
                          lineHeight: 1.5,
                          color: '#d4d4d4',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all',
                        }}
                      >
                        {formatHL7Message(selectedMessage.rawMessage || '')}
                      </pre>
                      {selectedMessage.parsedMessage && (
                        <>
                          <Divider style={{ borderColor: '#444', margin: '12px 0' }} />
                          <Text strong style={{ color: '#4fc3f7' }}>Parsed Data:</Text>
                          <pre
                            style={{
                              margin: '8px 0 0 0',
                              fontFamily: 'Consolas, Monaco, monospace',
                              fontSize: 12,
                              lineHeight: 1.4,
                              color: '#81c784',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-all',
                            }}
                          >
                            {JSON.stringify(selectedMessage.parsedMessage, null, 2)}
                          </pre>
                        </>
                      )}
                    </div>
                  ) : (
                    <div style={{ padding: 24, textAlign: 'center', color: '#666' }}>
                      Select a message from the list to view its content
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
