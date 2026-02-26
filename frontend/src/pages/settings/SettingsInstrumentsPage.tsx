import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  sendInstrumentTestOrder,
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

const COBAS_E411_ASTM_PRESET = {
  manufacturer: 'Roche',
  model: 'cobas e411',
  protocol: 'ASTM',
  connectionType: 'TCP_SERVER',
  port: 5001,
  autoPost: true,
  requireVerification: true,
  bidirectionalEnabled: false,
  isActive: true,
};

const COBAS_E411_SERIAL_PRESET = {
  manufacturer: 'Roche',
  model: 'cobas e411',
  protocol: 'ASTM',
  connectionType: 'SERIAL',
  serialPort: 'COM1',
  baudRate: 9600,
  dataBits: '8',
  parity: 'NONE',
  stopBits: '1',
  autoPost: true,
  requireVerification: true,
  bidirectionalEnabled: false,
  isActive: true,
};

const COBAS_C111_ASTM_PRESET = {
  manufacturer: 'Roche',
  model: 'cobas c111',
  protocol: 'ASTM',
  connectionType: 'TCP_SERVER',
  port: 5001,
  autoPost: true,
  requireVerification: true,
  bidirectionalEnabled: false,
  isActive: true,
};

const COBAS_C111_SERIAL_PRESET = {
  manufacturer: 'Roche',
  model: 'cobas c111',
  protocol: 'ASTM',
  connectionType: 'SERIAL',
  serialPort: 'COM1',
  baudRate: 9600,
  dataBits: '8',
  parity: 'NONE',
  stopBits: '1',
  autoPost: true,
  requireVerification: true,
  bidirectionalEnabled: false,
  isActive: true,
};

const MEDONIC_M51_HL7_PRESET = {
  manufacturer: 'Boule',
  model: 'Medonic M51',
  protocol: 'HL7_V2',
  connectionType: 'TCP_SERVER',
  port: 5600,
  autoPost: true,
  requireVerification: true,
  bidirectionalEnabled: false,
  isActive: true,
};

const MEDONIC_M51_CBC_MAPPING_SUGGESTIONS: Array<{
  instrumentCode: string;
  lisCandidates: string[];
}> = [
  { instrumentCode: 'WBC', lisCandidates: ['WBC'] },
  { instrumentCode: 'RBC', lisCandidates: ['RBC'] },
  { instrumentCode: 'HGB', lisCandidates: ['HGB', 'HB'] },
  { instrumentCode: 'HCT', lisCandidates: ['HCT'] },
  { instrumentCode: 'MCV', lisCandidates: ['MCV'] },
  { instrumentCode: 'MCH', lisCandidates: ['MCH'] },
  { instrumentCode: 'MCHC', lisCandidates: ['MCHC'] },
  { instrumentCode: 'PLT', lisCandidates: ['PLT'] },
  { instrumentCode: 'MPV', lisCandidates: ['MPV'] },
  { instrumentCode: 'RDW', lisCandidates: ['RDW', 'RDW-CV'] },
  { instrumentCode: 'LYM%', lisCandidates: ['LYM%', 'LYM_PCT', 'LYM PCT'] },
  { instrumentCode: 'MID%', lisCandidates: ['MID%', 'MID_PCT', 'MID PCT'] },
  { instrumentCode: 'GRA%', lisCandidates: ['GRA%', 'NEU%', 'NEUT%', 'NEUTROPHIL%'] },
  { instrumentCode: 'LYM#', lisCandidates: ['LYM#', 'LYM_ABS', 'LYM ABS'] },
  { instrumentCode: 'MID#', lisCandidates: ['MID#', 'MID_ABS', 'MID ABS'] },
  { instrumentCode: 'GRA#', lisCandidates: ['GRA#', 'NEU#', 'NEUT#', 'ANC'] },
  { instrumentCode: 'PCT', lisCandidates: ['PCT'] },
  { instrumentCode: 'PDW', lisCandidates: ['PDW'] },
];

const COBAS_C111_CHEM_MAPPING_SUGGESTIONS: Array<{
  instrumentCode: string;
  lisCandidates: string[];
}> = [
  { instrumentCode: 'GLU', lisCandidates: ['GLU', 'GLUCOSE'] },
  { instrumentCode: 'CRE', lisCandidates: ['CRE', 'CREAT', 'CREATININE'] },
  { instrumentCode: 'UREA', lisCandidates: ['UREA', 'BUN'] },
  { instrumentCode: 'ALT', lisCandidates: ['ALT', 'SGPT'] },
  { instrumentCode: 'AST', lisCandidates: ['AST', 'SGOT'] },
  { instrumentCode: 'ALP', lisCandidates: ['ALP'] },
  { instrumentCode: 'GGT', lisCandidates: ['GGT'] },
  { instrumentCode: 'TBIL', lisCandidates: ['TBIL', 'BILI-T', 'TOTAL BILIRUBIN'] },
  { instrumentCode: 'DBIL', lisCandidates: ['DBIL', 'BILI-D', 'DIRECT BILIRUBIN'] },
  { instrumentCode: 'TP', lisCandidates: ['TP', 'TOTAL PROTEIN'] },
  { instrumentCode: 'ALB', lisCandidates: ['ALB', 'ALBUMIN'] },
  { instrumentCode: 'CHOL', lisCandidates: ['CHOL', 'CHOLESTEROL'] },
  { instrumentCode: 'TRIG', lisCandidates: ['TRIG', 'TG', 'TRIGLYCERIDES'] },
  { instrumentCode: 'HDL', lisCandidates: ['HDL', 'HDL-C'] },
  { instrumentCode: 'LDL', lisCandidates: ['LDL', 'LDL-C'] },
  { instrumentCode: 'UA', lisCandidates: ['UA', 'URIC', 'URIC ACID'] },
  { instrumentCode: 'CA', lisCandidates: ['CA', 'CALCIUM'] },
  { instrumentCode: 'NA', lisCandidates: ['NA', 'SODIUM'] },
  { instrumentCode: 'K', lisCandidates: ['K', 'POTASSIUM'] },
  { instrumentCode: 'CL', lisCandidates: ['CL', 'CHLORIDE'] },
];

const normalizeCode = (value: string) =>
  value
    .trim()
    .toUpperCase()
    .replace(/%/g, 'PCT')
    .replace(/#/g, 'ABS')
    .replace(/[^A-Z0-9]/g, '');

const serialDataBitsOptions = [
  { value: '7', label: '7' },
  { value: '8', label: '8' },
];

const serialParityOptions = [
  { value: 'NONE', label: 'None' },
  { value: 'EVEN', label: 'Even' },
  { value: 'ODD', label: 'Odd' },
];

const serialStopBitsOptions = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
];

type M51MappingStatus = 'MAPPED' | 'READY_TO_MAP' | 'MISSING_LIS_TEST';

interface M51MappingAuditRow {
  instrumentCode: string;
  lisCandidates: string;
  currentLisCode: string | null;
  suggestedLisCode: string | null;
  status: M51MappingStatus;
}

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
  const [sendOrderModalOpen, setSendOrderModalOpen] = useState(false);
  const [sendOrderSubmitting, setSendOrderSubmitting] = useState(false);
  const [sendOrderForm] = Form.useForm();
  const [m51AuditModalOpen, setM51AuditModalOpen] = useState(false);

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
  const [simulatorOrderNumber, setSimulatorOrderNumber] = useState('');
  const [simulatorPatientId, setSimulatorPatientId] = useState('PAT001');

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

  const m51MappingAuditRows = useMemo<M51MappingAuditRow[]>(() => {
    const testsById = new Map(tests.map((test) => [test.id, test]));
    const testsByCode = new Map<string, TestDto>();
    for (const test of tests) {
      testsByCode.set(normalizeCode(test.code), test);
    }

    const mappingsByCode = new Map(
      mappings.map((mapping) => [normalizeCode(mapping.instrumentTestCode || ''), mapping]),
    );

    return MEDONIC_M51_CBC_MAPPING_SUGGESTIONS.map((suggestion) => {
      const normalizedInstrumentCode = normalizeCode(suggestion.instrumentCode);
      const existing = mappingsByCode.get(normalizedInstrumentCode);

      if (existing) {
        const mappedTest = testsById.get(existing.testId);
        return {
          instrumentCode: suggestion.instrumentCode,
          lisCandidates: suggestion.lisCandidates.join(', '),
          currentLisCode: mappedTest?.code || existing.testId,
          suggestedLisCode: mappedTest?.code || null,
          status: 'MAPPED',
        };
      }

      const candidate = suggestion.lisCandidates
        .map((code) => testsByCode.get(normalizeCode(code)))
        .find((test) => Boolean(test));

      return {
        instrumentCode: suggestion.instrumentCode,
        lisCandidates: suggestion.lisCandidates.join(', '),
        currentLisCode: null,
        suggestedLisCode: candidate?.code || null,
        status: candidate ? 'READY_TO_MAP' : 'MISSING_LIS_TEST',
      };
    });
  }, [mappings, tests]);

  const m51MappingSummary = useMemo(() => {
    return {
      mapped: m51MappingAuditRows.filter((row) => row.status === 'MAPPED').length,
      readyToMap: m51MappingAuditRows.filter((row) => row.status === 'READY_TO_MAP').length,
      missingLisTests: m51MappingAuditRows.filter((row) => row.status === 'MISSING_LIS_TEST').length,
    };
  }, [m51MappingAuditRows]);

  const handleOpenCreate = () => {
    setEditingInstrument(null);
    form.resetFields();
    form.setFieldsValue({
      ...COBAS_E411_ASTM_PRESET,
      protocol: 'HL7_V2',
      manufacturer: undefined,
      model: undefined,
      port: undefined,
      requireVerification: false,
      bidirectionalEnabled: false,
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (instrument: InstrumentDto) => {
    setEditingInstrument(instrument);
    form.setFieldsValue(instrument);
    setModalOpen(true);
  };

  const handleApplyCobasPreset = () => {
    form.setFieldsValue({
      ...COBAS_E411_ASTM_PRESET,
      host: undefined,
      port: COBAS_E411_ASTM_PRESET.port,
      serialPort: undefined,
      baudRate: undefined,
      dataBits: undefined,
      parity: undefined,
      stopBits: undefined,
      watchFolder: undefined,
      filePattern: undefined,
    });
    message.success('Cobas e411 ASTM preset applied');
  };

  const handleApplyCobasSerialPreset = () => {
    form.setFieldsValue({
      ...COBAS_E411_SERIAL_PRESET,
      host: undefined,
      port: undefined,
      watchFolder: undefined,
      filePattern: undefined,
    });
    message.success('Cobas e411 serial preset applied');
  };

  const handleApplyCobasC111Preset = () => {
    form.setFieldsValue({
      ...COBAS_C111_ASTM_PRESET,
      host: undefined,
      port: COBAS_C111_ASTM_PRESET.port,
      serialPort: undefined,
      baudRate: undefined,
      dataBits: undefined,
      parity: undefined,
      stopBits: undefined,
      watchFolder: undefined,
      filePattern: undefined,
    });
    message.success('Cobas c111 ASTM preset applied');
  };

  const handleApplyCobasC111SerialPreset = () => {
    form.setFieldsValue({
      ...COBAS_C111_SERIAL_PRESET,
      host: undefined,
      port: undefined,
      watchFolder: undefined,
      filePattern: undefined,
    });
    message.success('Cobas c111 serial preset applied');
  };

  const handleApplyMedonicM51Preset = () => {
    form.setFieldsValue({
      ...MEDONIC_M51_HL7_PRESET,
      host: undefined,
      serialPort: undefined,
      baudRate: undefined,
      dataBits: undefined,
      parity: undefined,
      stopBits: undefined,
      watchFolder: undefined,
      filePattern: undefined,
    });
    message.success('Medonic M51 HL7 preset applied');
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

  const handleOpenSendOrderModal = () => {
    if (!selectedInstrument) return;
    if (!selectedInstrument.bidirectionalEnabled) {
      message.warning('Enable bidirectional mode for this instrument first');
      return;
    }
    if (selectedInstrument.protocol !== 'HL7_V2') {
      message.warning('Send test order is currently available for HL7 instruments only');
      return;
    }
    if (mappings.length === 0) {
      message.warning('Add at least one test mapping before sending a test order');
      return;
    }

    const firstMapping = mappings[0];
    sendOrderForm.setFieldsValue({
      orderNumber: `TEST-${dayjs().format('YYYYMMDD-HHmmss')}`,
      patientId: 'P-TEST-001',
      patientName: 'Test Patient',
      patientDob: '',
      patientSex: 'M',
      priority: 'R',
      selectedTestCodes: [firstMapping.instrumentTestCode],
    });
    setSendOrderModalOpen(true);
  };

  const handleSubmitSendOrder = async () => {
    if (!selectedInstrument) return;

    try {
      const values = await sendOrderForm.validateFields();
      const selectedTestCodes = values.selectedTestCodes as string[];
      const selectedTests = selectedTestCodes
        .map((code) => {
          const mapping = mappings.find((m) => m.instrumentTestCode === code);
          if (!mapping) return null;
          const lisTest = tests.find((t) => t.id === mapping.testId);
          return {
            code: mapping.instrumentTestCode,
            name: lisTest?.name || mapping.instrumentTestName || mapping.instrumentTestCode,
          };
        })
        .filter((test): test is { code: string; name: string } => Boolean(test));

      if (selectedTests.length === 0) {
        message.error('Select at least one mapped test');
        return;
      }

      setSendOrderSubmitting(true);
      const result = await sendInstrumentTestOrder(selectedInstrument.id, {
        orderNumber: values.orderNumber,
        patientId: values.patientId,
        patientName: values.patientName,
        patientDob: values.patientDob || undefined,
        patientSex: values.patientSex || undefined,
        priority: values.priority || 'R',
        tests: selectedTests,
      });

      message.success(result.message || 'Order sent to instrument');
      setSendOrderModalOpen(false);
      await loadMessages(selectedInstrument.id);
      await loadInstruments();
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return;
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : 'Failed to send test order';
      message.error(msg || 'Failed to send test order');
    } finally {
      setSendOrderSubmitting(false);
    }
  };

  const handleAutoMapMedonicM51 = async () => {
    if (!selectedInstrument) return;

    const testsByCode = new Map<string, TestDto>();
    for (const test of tests) {
      testsByCode.set(normalizeCode(test.code), test);
    }

    const existingCodes = new Set(
      mappings.map((m) => normalizeCode(m.instrumentTestCode || '')),
    );

    let added = 0;
    let skippedExisting = 0;
    let skippedMissingTest = 0;
    let failed = 0;

    for (const suggestion of MEDONIC_M51_CBC_MAPPING_SUGGESTIONS) {
      const instrumentCode = normalizeCode(suggestion.instrumentCode);
      if (existingCodes.has(instrumentCode)) {
        skippedExisting += 1;
        continue;
      }

      const matchedTest = suggestion.lisCandidates
        .map((candidate) => testsByCode.get(normalizeCode(candidate)))
        .find((test) => Boolean(test));

      if (!matchedTest) {
        skippedMissingTest += 1;
        continue;
      }

      try {
        await createInstrumentMapping(selectedInstrument.id, {
          testId: matchedTest.id,
          instrumentTestCode: suggestion.instrumentCode,
          instrumentTestName: matchedTest.name,
        });
        existingCodes.add(instrumentCode);
        added += 1;
      } catch {
        failed += 1;
      }
    }

    await loadMappings(selectedInstrument.id);

    if (added > 0) {
      message.success(
        `M51 auto-mapping done: added ${added}, existing ${skippedExisting}, missing LIS tests ${skippedMissingTest}, failed ${failed}.`,
      );
      return;
    }

    message.info(
      `No new mappings added. Existing ${skippedExisting}, missing LIS tests ${skippedMissingTest}, failed ${failed}.`,
    );
  };

  const handleAutoMapCobasC111 = async () => {
    if (!selectedInstrument) return;
    const model = selectedInstrument.model?.toLowerCase() || '';
    if (!model.includes('c111')) {
      message.warning('Select a Cobas c111 instrument first');
      return;
    }

    const testsByCode = new Map<string, TestDto>();
    for (const test of tests) {
      testsByCode.set(normalizeCode(test.code), test);
    }

    const existingCodes = new Set(
      mappings.map((m) => normalizeCode(m.instrumentTestCode || '')),
    );

    let added = 0;
    let skippedExisting = 0;
    let skippedMissingTest = 0;
    let failed = 0;

    for (const suggestion of COBAS_C111_CHEM_MAPPING_SUGGESTIONS) {
      const instrumentCode = normalizeCode(suggestion.instrumentCode);
      if (existingCodes.has(instrumentCode)) {
        skippedExisting += 1;
        continue;
      }

      const matchedTest = suggestion.lisCandidates
        .map((candidate) => testsByCode.get(normalizeCode(candidate)))
        .find((test) => Boolean(test));

      if (!matchedTest) {
        skippedMissingTest += 1;
        continue;
      }

      try {
        await createInstrumentMapping(selectedInstrument.id, {
          testId: matchedTest.id,
          instrumentTestCode: suggestion.instrumentCode,
          instrumentTestName: matchedTest.name,
        });
        existingCodes.add(instrumentCode);
        added += 1;
      } catch {
        failed += 1;
      }
    }

    await loadMappings(selectedInstrument.id);

    if (added > 0) {
      message.success(
        `c111 auto-mapping done: added ${added}, existing ${skippedExisting}, missing LIS tests ${skippedMissingTest}, failed ${failed}.`,
      );
      return;
    }

    message.info(
      `No new c111 mappings added. Existing ${skippedExisting}, missing LIS tests ${skippedMissingTest}, failed ${failed}.`,
    );
  };

  // Live Tracker functions
  const handleOpenTracker = (instrument: InstrumentDto) => {
    const model = instrument.model?.toLowerCase() || '';
    setTrackerInstrument(instrument);
    setTrackerMessages([]);
    setSelectedMessage(null);
    setTrackerRunning(true);
    setSelectedPanel(
      instrument.protocol === 'ASTM'
        ? model.includes('c111')
          ? 'cobasC111Astm'
          : 'cobasE411Astm'
        : model.includes('m51')
          ? 'medonicM51CbcHl7'
          : 'cbc',
    );
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

  const formatInstrumentMessage = (raw: string) => {
    const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // HL7 formatting
    if (/(^|\n)MSH\|/.test(normalized)) {
      return normalized
        .split(/(?=MSH\||PID\||PV1\||ORC\||OBR\||OBX\||NTE\||MSA\||ERR\|)/g)
        .filter((s) => s.trim())
        .join('\n');
    }

    // ASTM or plain text formatting
    return normalized
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n');
  };

  const handleSimulateSend = async () => {
    if (!trackerInstrument || !simulatorMessage.trim()) {
      message.warning('Please enter a message to simulate');
      return;
    }

    const orderNumber = simulatorOrderNumber.trim();
    const patientId = simulatorPatientId.trim() || 'PAT001';
    if (!orderNumber) {
      message.warning('Enter Order Number from LIS first');
      return;
    }

    const payload = simulatorMessage
      .split('{{SAMPLE_ID}}').join(orderNumber)
      .split('{{ORDER_ID}}').join(orderNumber)
      .split('{{PATIENT_ID}}').join(patientId);

    setSimulatorSending(true);
    try {
      const result = await simulateInstrumentMessage(trackerInstrument.id, payload);
      if (result.success) {
        message.success(result.message || 'Message processed successfully');
        setSimulatorMessage('');
        // Refresh messages to see the result
        loadTrackerMessages(trackerInstrument.id);
      } else {
        const resultMessage = result.message || 'Failed to process message';
        const normalizedMessage = resultMessage.toLowerCase();
        if (normalizedMessage.includes('order number') && normalizedMessage.includes('not found')) {
          message.error(`${resultMessage}. Use an existing LIS order number in the Order Number field.`);
        } else {
          message.error(resultMessage);
        }
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

  // Sample HL7/ASTM messages for testing
  const getTimestamp = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  
  const sampleMessages: Record<string, { name: string; message: string }> = {
    cbc: {
      name: 'CBC Panel (Full)',
      message: `MSH|^~\\&|HEMATOLOGY|LAB|LIS|HOSPITAL|${getTimestamp()}||ORU^R01|MSG${Date.now()}|P|2.5
PID|1||{{PATIENT_ID}}||Doe^John||19800101|M
OBR|1|{{ORDER_ID}}|{{SAMPLE_ID}}|CBC^Complete Blood Count||${getTimestamp()}
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
PID|1||{{PATIENT_ID}}||Doe^John||19800101|M
OBR|1|{{ORDER_ID}}|{{SAMPLE_ID}}|BMP^Basic Metabolic Panel||${getTimestamp()}
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
PID|1||{{PATIENT_ID}}||Doe^John||19800101|M
OBR|1|{{ORDER_ID}}|{{SAMPLE_ID}}|LFT^Liver Function Tests||${getTimestamp()}
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
PID|1||{{PATIENT_ID}}||Doe^John||19800101|M
OBR|1|{{ORDER_ID}}|{{SAMPLE_ID}}|LIPID^Lipid Panel||${getTimestamp()}
OBX|1|NM|CHOL^Total Cholesterol||185|mg/dL|<200|N|||F
OBX|2|NM|TRIG^Triglycerides||120|mg/dL|<150|N|||F
OBX|3|NM|HDL^HDL Cholesterol||55|mg/dL|>40|N|||F
OBX|4|NM|LDL^LDL Cholesterol||106|mg/dL|<100|H|||F
OBX|5|NM|VLDL^VLDL Cholesterol||24|mg/dL|5-40|N|||F`,
    },
    thyroid: {
      name: 'Thyroid Panel',
      message: `MSH|^~\\&|IMMUNOASSAY|LAB|LIS|HOSPITAL|${getTimestamp()}||ORU^R01|MSG${Date.now()}|P|2.5
PID|1||{{PATIENT_ID}}||Doe^John||19800101|M
OBR|1|{{ORDER_ID}}|{{SAMPLE_ID}}|THYROID^Thyroid Panel||${getTimestamp()}
OBX|1|NM|TSH^Thyroid Stimulating Hormone||2.5|mIU/L|0.4-4.0|N|||F
OBX|2|NM|FT4^Free T4||1.2|ng/dL|0.8-1.8|N|||F
OBX|3|NM|FT3^Free T3||3.0|pg/mL|2.3-4.2|N|||F
OBX|4|NM|T4^Total T4||7.5|ug/dL|4.5-12.0|N|||F
OBX|5|NM|T3^Total T3||120|ng/dL|80-200|N|||F`,
    },
    urinalysis: {
      name: 'Urinalysis',
      message: `MSH|^~\\&|URINALYSIS|LAB|LIS|HOSPITAL|${getTimestamp()}||ORU^R01|MSG${Date.now()}|P|2.5
PID|1||{{PATIENT_ID}}||Doe^John||19800101|M
OBR|1|{{ORDER_ID}}|{{SAMPLE_ID}}|UA^Urinalysis||${getTimestamp()}
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
PID|1||{{PATIENT_ID}}||Doe^John||19800101|M
OBR|1|{{ORDER_ID}}|{{SAMPLE_ID}}|COAG^Coagulation Panel||${getTimestamp()}
OBX|1|NM|PT^Prothrombin Time||12.5|seconds|11.0-13.5|N|||F
OBX|2|NM|INR^International Normalized Ratio||1.0||0.8-1.2|N|||F
OBX|3|NM|PTT^Partial Thromboplastin Time||28|seconds|25-35|N|||F
OBX|4|NM|FIB^Fibrinogen||280|mg/dL|200-400|N|||F`,
    },
    abnormal: {
      name: 'Abnormal Results (High/Low)',
      message: `MSH|^~\\&|HEMATOLOGY|LAB|LIS|HOSPITAL|${getTimestamp()}||ORU^R01|MSG${Date.now()}|P|2.5
PID|1||{{PATIENT_ID}}||Doe^John||19800101|M
OBR|1|{{ORDER_ID}}|{{SAMPLE_ID}}|CBC^Complete Blood Count||${getTimestamp()}
OBX|1|NM|WBC^White Blood Cell Count||15.8|10^9/L|4.0-11.0|HH|||F
OBX|2|NM|RBC^Red Blood Cell Count||3.2|10^12/L|4.5-5.5|L|||F
OBX|3|NM|HGB^Hemoglobin||8.5|g/dL|12.0-16.0|LL|||F
OBX|4|NM|HCT^Hematocrit||28.0|%|36-46|L|||F
OBX|5|NM|PLT^Platelet Count||45|10^9/L|150-400|LL|||F`,
    },
    medonicM51CbcHl7: {
      name: 'Medonic M51 CBC (HL7)',
      message: `MSH|^~\\&|M51|HEMATOLOGY|LIS|LAB|${getTimestamp()}||ORU^R01|M51${Date.now()}|P|2.3
PID|1||{{PATIENT_ID}}||Doe^John||19800101|M
OBR|1|{{ORDER_ID}}|{{SAMPLE_ID}}|CBC^Complete Blood Count||${getTimestamp()}
OBX|1|NM|WBC^White Blood Cell Count||7.20|10^9/L|4.0-10.0|N|||F
OBX|2|NM|RBC^Red Blood Cell Count||4.95|10^12/L|4.5-5.9|N|||F
OBX|3|NM|HGB^Hemoglobin||14.8|g/dL|13.0-17.0|N|||F
OBX|4|NM|HCT^Hematocrit||44.2|%|40-52|N|||F
OBX|5|NM|MCV^Mean Corpuscular Volume||89.3|fL|80-100|N|||F
OBX|6|NM|MCH^Mean Corpuscular Hemoglobin||29.9|pg|27-33|N|||F
OBX|7|NM|MCHC^Mean Corpuscular Hemoglobin Concentration||33.5|g/dL|32-36|N|||F
OBX|8|NM|PLT^Platelet Count||268|10^9/L|150-400|N|||F
OBX|9|NM|LYM%^Lymphocytes %||31.6|%|20-45|N|||F
OBX|10|NM|MID%^MID %||7.9|%|2-12|N|||F
OBX|11|NM|GRA%^Granulocytes %||60.5|%|40-75|N|||F
OBX|12|NM|LYM#^Lymphocytes Absolute||2.28|10^9/L|1.0-4.0|N|||F
OBX|13|NM|MID#^MID Absolute||0.57|10^9/L|0.1-1.5|N|||F
OBX|14|NM|GRA#^Granulocytes Absolute||4.35|10^9/L|2.0-7.0|N|||F
OBX|15|NM|RDW^Red Cell Distribution Width||13.4|%|11.5-14.5|N|||F
OBX|16|NM|MPV^Mean Platelet Volume||9.6|fL|7.5-11.5|N|||F`,
    },
    cobasE411Astm: {
      name: 'Cobas e411 ASTM (TSH sample)',
      message: `H|\\^&|||cobas-e411|||||P|1
P|1
O|1|{{SAMPLE_ID}}||^^^TSH|R
R|1|^^^TSH|2.31|mIU/L|0.27-4.2|N|||F
L|1|N`,
    },
    cobasC111Astm: {
      name: 'Cobas c111 ASTM (Chemistry sample)',
      message: `H|\\^&|||cobas-c111|||||P|1
P|1
O|1|{{SAMPLE_ID}}||^^^GLU^Glucose|R
R|1|^^^GLU^Glucose|92|mg/dL|70-100|N|||F
R|2|^^^CRE^Creatinine|1.03|mg/dL|0.70-1.30|N|||F
L|1|N`,
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
      title: 'Mode',
      key: 'mode',
      width: 90,
      render: (_, record) => (
        <Tag color={record.bidirectionalEnabled ? 'green' : 'default'}>
          {record.bidirectionalEnabled ? 'BIDIR' : 'UNI'}
        </Tag>
      ),
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

  const m51MappingColumns: ColumnsType<M51MappingAuditRow> = [
    {
      title: 'Instrument code',
      dataIndex: 'instrumentCode',
      key: 'instrumentCode',
      width: 140,
      render: (value: string) => <Text code>{value}</Text>,
    },
    {
      title: 'Current mapped LIS test',
      dataIndex: 'currentLisCode',
      key: 'currentLisCode',
      width: 220,
      render: (value: string | null) => value || <Text type="secondary">-</Text>,
    },
    {
      title: 'Suggested LIS test',
      dataIndex: 'suggestedLisCode',
      key: 'suggestedLisCode',
      width: 200,
      render: (value: string | null) => value || <Text type="secondary">-</Text>,
    },
    {
      title: 'Candidate aliases',
      dataIndex: 'lisCandidates',
      key: 'lisCandidates',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 170,
      render: (status: M51MappingStatus) => {
        if (status === 'MAPPED') return <Tag color="green">Mapped</Tag>;
        if (status === 'READY_TO_MAP') return <Tag color="gold">Ready to map</Tag>;
        return <Tag color="red">Missing LIS test</Tag>;
      },
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
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message="Quick Preset"
            description={(
              <Space wrap>
                <Button size="small" onClick={handleApplyCobasPreset}>
                  Cobas e411 ASTM (TCP)
                </Button>
                <Button size="small" onClick={handleApplyCobasSerialPreset}>
                  Cobas e411 ASTM (Serial)
                </Button>
                <Button size="small" onClick={handleApplyCobasC111Preset}>
                  Cobas c111 ASTM (TCP)
                </Button>
                <Button size="small" onClick={handleApplyCobasC111SerialPreset}>
                  Cobas c111 ASTM (Serial)
                </Button>
                <Button size="small" onClick={handleApplyMedonicM51Preset}>
                  Medonic M51 HL7 (TCP)
                </Button>
                <Text type="secondary">
                  TCP presets are for network analyzer connectivity. Serial preset is for COM/RS-232 setups.
                </Text>
              </Space>
            )}
          />

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
            <>
              <Space style={{ display: 'flex' }} align="start">
                <Form.Item name="serialPort" label="Serial Port" rules={[{ required: true }]} style={{ width: 140 }}>
                  <Input placeholder="COM1" />
                </Form.Item>
                <Form.Item name="baudRate" label="Baud Rate" style={{ width: 140 }}>
                  <Select options={[
                    { value: 9600, label: '9600' },
                    { value: 19200, label: '19200' },
                    { value: 38400, label: '38400' },
                    { value: 57600, label: '57600' },
                    { value: 115200, label: '115200' },
                  ]} />
                </Form.Item>
              </Space>
              <Space style={{ display: 'flex' }} align="start">
                <Form.Item name="dataBits" label="Data Bits" style={{ width: 140 }}>
                  <Select options={serialDataBitsOptions} />
                </Form.Item>
                <Form.Item name="parity" label="Parity" style={{ width: 140 }}>
                  <Select options={serialParityOptions} />
                </Form.Item>
                <Form.Item name="stopBits" label="Stop Bits" style={{ width: 140 }}>
                  <Select options={serialStopBitsOptions} />
                </Form.Item>
              </Space>
            </>
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
            <Form.Item
              name="bidirectionalEnabled"
              label="Bidirectional mode"
              valuePropName="checked"
              tooltip="Enable when this instrument should receive LIS order/query responses."
            >
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
              <Descriptions.Item label="Bidirectional">
                {selectedInstrument.bidirectionalEnabled ? 'Enabled' : 'Disabled'}
              </Descriptions.Item>
            </Descriptions>

            {selectedInstrument.lastError && (
              <div style={{ marginBottom: 16, padding: 8, background: '#fff2f0', borderRadius: 4 }}>
                <Text type="danger">Error: {selectedInstrument.lastError}</Text>
              </div>
            )}

            <Space style={{ marginBottom: 12 }} wrap>
              <Button
                type="primary"
                onClick={handleOpenSendOrderModal}
                disabled={
                  !selectedInstrument.bidirectionalEnabled || selectedInstrument.protocol !== 'HL7_V2'
                }
              >
                Send Test Order
              </Button>
              {!selectedInstrument.bidirectionalEnabled && (
                <Tag color="orange">Enable bidirectional mode to send orders</Tag>
              )}
              {selectedInstrument.protocol !== 'HL7_V2' && (
                <Tag color="default">Currently supported for HL7 instruments</Tag>
              )}
            </Space>

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
                      <Space style={{ marginBottom: 8 }} wrap>
                        <Button
                          type="primary"
                          size="small"
                          icon={<PlusOutlined />}
                          onClick={handleAddMapping}
                        >
                          Add Mapping
                        </Button>
                        <Button
                          size="small"
                          onClick={handleAutoMapMedonicM51}
                        >
                          Auto-map M51 CBC
                        </Button>
                        <Button
                          size="small"
                          onClick={handleAutoMapCobasC111}
                        >
                          Auto-map c111 chemistry
                        </Button>
                        <Button
                          size="small"
                          onClick={() => setM51AuditModalOpen(true)}
                        >
                          Show missing M51 mappings
                        </Button>
                      </Space>
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

      {/* M51 Mapping Coverage Modal */}
      <Modal
        title="Medonic M51 CBC mapping coverage"
        open={m51AuditModalOpen}
        onCancel={() => setM51AuditModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setM51AuditModalOpen(false)}>
            Close
          </Button>,
        ]}
        width={980}
      >
        <Space style={{ marginBottom: 12 }} wrap>
          <Tag color="green">Mapped: {m51MappingSummary.mapped}</Tag>
          <Tag color="gold">Ready to map: {m51MappingSummary.readyToMap}</Tag>
          <Tag color="red">Missing LIS tests: {m51MappingSummary.missingLisTests}</Tag>
        </Space>
        <Table
          columns={m51MappingColumns}
          dataSource={m51MappingAuditRows}
          rowKey="instrumentCode"
          pagination={false}
          size="small"
        />
      </Modal>

      {/* Send Test Order Modal */}
      <Modal
        title="Send Test Order to Instrument"
        open={sendOrderModalOpen}
        onCancel={() => setSendOrderModalOpen(false)}
        onOk={handleSubmitSendOrder}
        okText="Send"
        confirmLoading={sendOrderSubmitting}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="This sends an HL7 ORM order (OBR-3 = order number) to the selected instrument."
        />
        <Form form={sendOrderForm} layout="vertical">
          <Form.Item name="orderNumber" label="Order Number" rules={[{ required: true }]}>
            <Input />
          </Form.Item>

          <Space style={{ display: 'flex' }} align="start">
            <Form.Item name="patientId" label="Patient ID" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Input />
            </Form.Item>
            <Form.Item name="patientName" label="Patient Name" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Input />
            </Form.Item>
          </Space>

          <Space style={{ display: 'flex' }} align="start">
            <Form.Item name="patientSex" label="Sex" style={{ width: 120 }}>
              <Select
                allowClear
                options={[
                  { value: 'M', label: 'Male' },
                  { value: 'F', label: 'Female' },
                  { value: 'O', label: 'Other' },
                  { value: 'U', label: 'Unknown' },
                ]}
              />
            </Form.Item>
            <Form.Item
              name="patientDob"
              label="DOB (YYYYMMDD)"
              style={{ flex: 1 }}
              extra="Optional HL7 date format, e.g. 19920130"
            >
              <Input />
            </Form.Item>
            <Form.Item name="priority" label="Priority" style={{ width: 140 }}>
              <Select
                options={[
                  { value: 'R', label: 'Routine (R)' },
                  { value: 'S', label: 'STAT (S)' },
                ]}
              />
            </Form.Item>
          </Space>

          <Form.Item
            name="selectedTestCodes"
            label="Mapped Tests"
            rules={[{ required: true, type: 'array', min: 1 }]}
            extra="Choose the mapped tests to include in the outbound order message."
          >
            <Select
              mode="multiple"
              placeholder="Select one or more mapped tests"
              options={mappings.map((m) => {
                const lisTest = tests.find((t) => t.id === m.testId);
                const lisLabel = lisTest ? `${lisTest.code} - ${lisTest.name}` : (m.instrumentTestName || m.testId);
                return {
                  value: m.instrumentTestCode,
                  label: `${m.instrumentTestCode} -> ${lisLabel}`,
                };
              })}
            />
          </Form.Item>
        </Form>
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
                  <Input
                    size="small"
                    style={{ width: 190 }}
                    placeholder="Order Number in LIS"
                    value={simulatorOrderNumber}
                    onChange={(e) => setSimulatorOrderNumber(e.target.value)}
                  />
                  <Input
                    size="small"
                    style={{ width: 150 }}
                    placeholder="Patient ID (optional)"
                    value={simulatorPatientId}
                    onChange={(e) => setSimulatorPatientId(e.target.value)}
                  />
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
                    Load Template
                  </Button>
                </Space>
              }
            >
              <Input.TextArea
                value={simulatorMessage}
                onChange={(e) => setSimulatorMessage(e.target.value)}
                placeholder="Paste HL7 or ASTM message here, or select a template above and click 'Load Template'..."
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
                  Use a real LIS order number. Templates auto-replace {'{{SAMPLE_ID}}'}, {'{{ORDER_ID}}'}, {'{{PATIENT_ID}}'}.
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
                        {formatInstrumentMessage(selectedMessage.rawMessage || '')}
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
