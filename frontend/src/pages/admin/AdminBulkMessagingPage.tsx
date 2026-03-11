import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Drawer,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import {
  getAdminBulkMessagingJobDetail,
  getAdminBulkMessagingJobs,
  getAdminBulkMessagingLabConfig,
  getAdminBulkMessagingTemplates,
  previewAdminBulkMessaging,
  sendAdminBulkMessaging,
  updateAdminBulkMessagingLabConfig,
  updateAdminBulkMessagingTemplates,
  type AdminBulkMessagingJobDetailDto,
  type AdminBulkMessagingJobItemDto,
  type AdminBulkMessagingLabConfigDto,
  type AdminBulkMessagingPreviewDto,
  type AdminBulkMessagingTemplatesDto,
  type AdminLabDto,
  type AdminMarketingBatchStatus,
  type AdminMarketingChannel,
} from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { loadAdminLabs } from '../../utils/admin-labs-cache';
import {
  ADMIN_DATE_RANGE_EVENT,
  ADMIN_DATE_RANGE_KEY,
  ADMIN_LAB_SCOPE_EVENT,
  ADMIN_SELECTED_LAB_KEY,
  type StoredAdminDateRange,
} from '../../utils/admin-ui';

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;
const CHANNELS: AdminMarketingChannel[] = ['WHATSAPP', 'VIBER', 'SMS'];
const DEFAULT_PAGE_SIZE = 20;

type OrderStatusFilter = '' | 'REGISTERED' | 'COLLECTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
type ConfigDraftRecord = Record<AdminMarketingChannel, {
  enabled: boolean;
  webhookUrl: string;
  senderLabel: string;
  timeoutMs: number;
  maxRetries: number;
  authToken: string;
  hasAuthToken: boolean;
}>;

type TemplateDraftRecord = Record<AdminMarketingChannel, string>;

export function AdminBulkMessagingPage() {
  const { user } = useAuth();
  const isAuditor = user?.role === 'AUDITOR';
  const [labs, setLabs] = useState<AdminLabDto[]>([]);
  const [loadingLabs, setLoadingLabs] = useState(false);

  const [labId, setLabId] = useState<string | undefined>(
    () => localStorage.getItem(ADMIN_SELECTED_LAB_KEY) || undefined,
  );
  const [status, setStatus] = useState<OrderStatusFilter>('');
  const [searchText, setSearchText] = useState('');
  const [searchApplied, setSearchApplied] = useState('');
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>(() => getInitialDateRange());

  const [config, setConfig] = useState<AdminBulkMessagingLabConfigDto | null>(null);
  const [configDraft, setConfigDraft] = useState<ConfigDraftRecord | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);

  const [templates, setTemplates] = useState<AdminBulkMessagingTemplatesDto | null>(null);
  const [templateDrafts, setTemplateDrafts] = useState<TemplateDraftRecord | null>(null);
  const [savingTemplates, setSavingTemplates] = useState(false);

  const [selectedChannels, setSelectedChannels] = useState<AdminMarketingChannel[]>([]);
  const [excludedPhonesText, setExcludedPhonesText] = useState('');
  const [previewResult, setPreviewResult] = useState<AdminBulkMessagingPreviewDto | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const [jobs, setJobs] = useState<AdminBulkMessagingJobItemDto[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsPage, setJobsPage] = useState(1);
  const [jobsTotal, setJobsTotal] = useState(0);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<AdminBulkMessagingJobDetailDto | null>(null);

  const loadLabs = async () => {
    setLoadingLabs(true);
    try {
      const items = await loadAdminLabs();
      setLabs(items);
      if (!labId && items[0]) {
        setLabId(items[0].id);
      }
    } catch (error) {
      message.error(getErrorMessage(error) || 'Failed to load labs');
    } finally {
      setLoadingLabs(false);
    }
  };

  const loadConfigAndTemplates = async (targetLabId: string) => {
    try {
      const [cfg, tpl] = await Promise.all([
        getAdminBulkMessagingLabConfig(targetLabId),
        getAdminBulkMessagingTemplates(targetLabId),
      ]);
      setConfig(cfg);
      setConfigDraft(toConfigDraft(cfg));
      setTemplates(tpl);
      setTemplateDrafts(toTemplateDraft(tpl));
      const enabled = CHANNELS.filter((channel) => cfg.channels[channel]?.enabled);
      setSelectedChannels(enabled.length > 0 ? enabled : CHANNELS);
    } catch (error) {
      message.error(getErrorMessage(error) || 'Failed to load bulk messaging settings');
      setConfig(null);
      setConfigDraft(null);
      setTemplates(null);
      setTemplateDrafts(null);
      setSelectedChannels([]);
    }
  };

  const loadJobs = async () => {
    if (!labId) return;
    setJobsLoading(true);
    try {
      const result = await getAdminBulkMessagingJobs({
        labId,
        page: jobsPage,
        size: DEFAULT_PAGE_SIZE,
      });
      setJobs(result.items);
      setJobsTotal(result.total);
    } catch (error) {
      message.error(getErrorMessage(error) || 'Failed to load batch history');
      setJobs([]);
      setJobsTotal(0);
    } finally {
      setJobsLoading(false);
    }
  };

  useEffect(() => {
    void loadLabs();
  }, []);

  useEffect(() => {
    if (!labId) return;
    localStorage.setItem(ADMIN_SELECTED_LAB_KEY, labId);
    window.dispatchEvent(new CustomEvent(ADMIN_LAB_SCOPE_EVENT, { detail: { labId } }));
    setJobsPage(1);
    void loadConfigAndTemplates(labId);
  }, [labId]);

  useEffect(() => {
    if (!labId) return;
    void loadJobs();
  }, [labId, jobsPage]);

  useEffect(() => {
    const syncScope = () => {
      const storedLabId = localStorage.getItem(ADMIN_SELECTED_LAB_KEY) || undefined;
      const nextRange = getInitialDateRange();
      setLabId((current) => (current === storedLabId ? current : storedLabId));
      setDateRange((current) =>
        serializeRange(current) === serializeRange(nextRange) ? current : nextRange,
      );
    };

    window.addEventListener(ADMIN_LAB_SCOPE_EVENT, syncScope as EventListener);
    window.addEventListener(ADMIN_DATE_RANGE_EVENT, syncScope as EventListener);
    window.addEventListener('storage', syncScope);
    return () => {
      window.removeEventListener(ADMIN_LAB_SCOPE_EVENT, syncScope as EventListener);
      window.removeEventListener(ADMIN_DATE_RANGE_EVENT, syncScope as EventListener);
      window.removeEventListener('storage', syncScope);
    };
  }, []);

  const handleSaveConfig = async () => {
    if (isAuditor) return;
    if (!labId || !configDraft) return;
    setSavingConfig(true);
    try {
      const payloadChannels: Partial<Record<AdminMarketingChannel, {
        enabled?: boolean;
        webhookUrl?: string | null;
        authToken?: string | null;
        senderLabel?: string | null;
        timeoutMs?: number;
        maxRetries?: number;
      }>> = {};
      for (const channel of CHANNELS) {
        const row = configDraft[channel];
        const payload: {
          enabled?: boolean;
          webhookUrl?: string | null;
          authToken?: string | null;
          senderLabel?: string | null;
          timeoutMs?: number;
          maxRetries?: number;
        } = {
          enabled: row.enabled,
          webhookUrl: row.webhookUrl.trim() || null,
          senderLabel: row.senderLabel.trim() || null,
          timeoutMs: row.timeoutMs,
          maxRetries: row.maxRetries,
        };
        if (row.authToken.trim()) {
          payload.authToken = row.authToken.trim();
        }
        payloadChannels[channel] = payload;
      }

      const next = await updateAdminBulkMessagingLabConfig(labId, {
        channels: payloadChannels,
      });
      setConfig(next);
      setConfigDraft(toConfigDraft(next));
      const enabled = CHANNELS.filter((channel) => next.channels[channel]?.enabled);
      if (enabled.length > 0) {
        setSelectedChannels((current) => {
          const filtered = current.filter((channel) => enabled.includes(channel));
          return filtered.length > 0 ? filtered : enabled;
        });
      }
      message.success('Channel configuration updated');
    } catch (error) {
      message.error(getErrorMessage(error) || 'Failed to update channel configuration');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSaveTemplates = async () => {
    if (isAuditor) return;
    if (!labId || !templateDrafts) return;
    setSavingTemplates(true);
    try {
      const next = await updateAdminBulkMessagingTemplates(labId, {
        templates: templateDrafts,
      });
      setTemplates(next);
      setTemplateDrafts(toTemplateDraft(next));
      message.success('Templates updated');
    } catch (error) {
      message.error(getErrorMessage(error) || 'Failed to update templates');
    } finally {
      setSavingTemplates(false);
    }
  };

  const handlePreview = async () => {
    if (!labId) return;
    setPreviewLoading(true);
    try {
      const result = await previewAdminBulkMessaging({
        labId,
        status: status || undefined,
        q: searchApplied || undefined,
        dateFrom: dateRange[0].startOf('day').toISOString(),
        dateTo: dateRange[1].endOf('day').toISOString(),
        excludedPhones: excludedPhonesText,
      });
      setPreviewResult(result);
    } catch (error) {
      setPreviewResult(null);
      message.error(getErrorMessage(error) || 'Failed to preview recipients');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSend = async () => {
    if (isAuditor) return;
    if (!labId || !templateDrafts) return;
    if (selectedChannels.length === 0) {
      message.warning('Select at least one channel');
      return;
    }

    setSending(true);
    try {
      const result = await sendAdminBulkMessaging({
        labId,
        status: status || undefined,
        q: searchApplied || undefined,
        dateFrom: dateRange[0].startOf('day').toISOString(),
        dateTo: dateRange[1].endOf('day').toISOString(),
        excludedPhones: excludedPhonesText,
        channels: selectedChannels,
        templateOverrides: selectedChannels.reduce((acc, channel) => {
          acc[channel] = templateDrafts[channel];
          return acc;
        }, {} as Partial<Record<AdminMarketingChannel, string>>),
      });
      message.success(`Batch queued (${result.queuedRecipientsCount} recipient sends)`);
      void loadJobs();
      setSelectedBatchId(result.batchId);
      void openJobDrawer(result.batchId);
    } catch (error) {
      message.error(getErrorMessage(error) || 'Failed to queue batch');
    } finally {
      setSending(false);
    }
  };

  const openJobDrawer = async (batchId: string) => {
    setDrawerOpen(true);
    setDrawerLoading(true);
    setSelectedBatchId(batchId);
    try {
      const detail = await getAdminBulkMessagingJobDetail(batchId, { page: 1, size: 200 });
      setSelectedJob(detail);
    } catch (error) {
      setSelectedJob(null);
      message.error(getErrorMessage(error) || 'Failed to load batch details');
    } finally {
      setDrawerLoading(false);
    }
  };

  const channelOptions = useMemo(
    () => CHANNELS.map((value) => ({ value, label: value })),
    [],
  );

  const jobsColumns: ColumnsType<AdminBulkMessagingJobItemDto> = [
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (value: string) => formatDate(value),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 190,
      render: (value: AdminMarketingBatchStatus) => <Tag color={batchStatusColor(value)}>{value}</Tag>,
    },
    {
      title: 'Channels',
      dataIndex: 'channels',
      key: 'channels',
      width: 170,
      render: (value: AdminMarketingChannel[]) => value.join(', '),
    },
    {
      title: 'Recipients',
      key: 'counts',
      render: (_, row) => (
        <Space size={4} wrap>
          <Tag color="default">Total {row.requestedRecipientsCount}</Tag>
          <Tag color="green">Sent {row.sentCount}</Tag>
          <Tag color="red">Failed {row.failedCount}</Tag>
          <Tag color="gold">Skipped {row.skippedCount}</Tag>
        </Space>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_, row) => (
        <Button size="small" onClick={() => void openJobDrawer(row.id)}>
          View
        </Button>
      ),
    },
  ];

  return (
    <div>
      <Space align="start" style={{ width: '100%', justifyContent: 'space-between' }}>
        <div>
          <Title level={4} style={{ marginTop: 0 }}>Bulk Messaging</Title>
          <Text type="secondary">Send WhatsApp, Viber, and SMS campaigns from admin scope.</Text>
        </div>
        <Button onClick={() => void Promise.all([loadLabs(), labId ? loadConfigAndTemplates(labId) : Promise.resolve(), loadJobs()])}>
          Refresh
        </Button>
      </Space>

      {isAuditor ? (
        <Alert
          style={{ marginTop: 12 }}
          type="warning"
          showIcon
          message="Read-only mode"
          description="AUDITOR can preview and monitor jobs but cannot update config/templates or send batches."
        />
      ) : null}

      <Card title="Scope" style={{ marginTop: 16 }}>
        <Space wrap style={{ width: '100%' }}>
          <Select
            showSearch
            optionFilterProp="label"
            style={{ minWidth: 260 }}
            loading={loadingLabs}
            value={labId}
            placeholder="Select lab"
            onChange={(value) => {
              setLabId(value);
              setJobsPage(1);
            }}
            options={labs.map((lab) => ({ value: lab.id, label: `${lab.name} (${lab.code})` }))}
          />
          <Select
            style={{ width: 170 }}
            value={status}
            onChange={(value) => setStatus(value)}
            options={[
              { value: '', label: 'All statuses' },
              { value: 'REGISTERED', label: 'REGISTERED' },
              { value: 'COLLECTED', label: 'COLLECTED' },
              { value: 'IN_PROGRESS', label: 'IN_PROGRESS' },
              { value: 'COMPLETED', label: 'COMPLETED' },
              { value: 'CANCELLED', label: 'CANCELLED' },
            ]}
          />
          <Input.Search
            allowClear
            style={{ width: 320 }}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onSearch={(value) => setSearchApplied(value.trim())}
            placeholder="Order #, patient, phone, barcode"
            enterButton="Apply"
          />
          <RangePicker
            value={dateRange}
            onChange={(value) => {
              if (!value) return;
              setDateRange(value as [Dayjs, Dayjs]);
              const payload: StoredAdminDateRange = {
                preset: 'custom',
                start: value[0].toISOString(),
                end: value[1].toISOString(),
              };
              localStorage.setItem(ADMIN_DATE_RANGE_KEY, JSON.stringify(payload));
              window.dispatchEvent(new CustomEvent(ADMIN_DATE_RANGE_EVENT, { detail: payload }));
            }}
          />
          <Input.TextArea
            style={{ width: 340 }}
            rows={2}
            placeholder="Excluded phones (comma/newline separated)"
            value={excludedPhonesText}
            onChange={(e) => setExcludedPhonesText(e.target.value)}
          />
          <Button onClick={() => void handlePreview()} loading={previewLoading}>
            Preview recipients
          </Button>
        </Space>
      </Card>

      <Row gutter={[16, 16]} style={{ marginTop: 8 }}>
        <Col xs={24} lg={12}>
          <Card
            title="Channel Config"
            extra={
              <Button type="primary" disabled={isAuditor || !configDraft} loading={savingConfig} onClick={() => void handleSaveConfig()}>
                Save config
              </Button>
            }
          >
            {!configDraft ? (
              <Text type="secondary">Select a lab to load channel settings.</Text>
            ) : (
              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                {CHANNELS.map((channel) => {
                  const row = configDraft[channel];
                  return (
                    <Card key={channel} size="small" title={channel}>
                      <Space direction="vertical" style={{ width: '100%' }}>
                        <Space>
                          <Text>Enabled</Text>
                          <Switch
                            checked={row.enabled}
                            disabled={isAuditor}
                            onChange={(checked) => {
                              setConfigDraft((current) => current ? {
                                ...current,
                                [channel]: { ...current[channel], enabled: checked },
                              } : current);
                            }}
                          />
                        </Space>
                        <Input
                          value={row.webhookUrl}
                          disabled={isAuditor}
                          placeholder="Webhook URL"
                          onChange={(e) => {
                            const next = e.target.value;
                            setConfigDraft((current) => current ? {
                              ...current,
                              [channel]: { ...current[channel], webhookUrl: next },
                            } : current);
                          }}
                        />
                        <Input
                          value={row.senderLabel}
                          disabled={isAuditor}
                          placeholder="Sender label (optional)"
                          onChange={(e) => {
                            const next = e.target.value;
                            setConfigDraft((current) => current ? {
                              ...current,
                              [channel]: { ...current[channel], senderLabel: next },
                            } : current);
                          }}
                        />
                        <Input.Password
                          value={row.authToken}
                          disabled={isAuditor}
                          placeholder={row.hasAuthToken ? 'Auth token set (enter to replace)' : 'Auth token (optional)'}
                          onChange={(e) => {
                            const next = e.target.value;
                            setConfigDraft((current) => current ? {
                              ...current,
                              [channel]: { ...current[channel], authToken: next },
                            } : current);
                          }}
                        />
                        <Space>
                          <InputNumber
                            min={1000}
                            max={60000}
                            value={row.timeoutMs}
                            disabled={isAuditor}
                            addonBefore="Timeout ms"
                            onChange={(value) => {
                              setConfigDraft((current) => current ? {
                                ...current,
                                [channel]: { ...current[channel], timeoutMs: Number(value ?? current[channel].timeoutMs) },
                              } : current);
                            }}
                          />
                          <InputNumber
                            min={0}
                            max={5}
                            value={row.maxRetries}
                            disabled={isAuditor}
                            addonBefore="Retries"
                            onChange={(value) => {
                              setConfigDraft((current) => current ? {
                                ...current,
                                [channel]: { ...current[channel], maxRetries: Number(value ?? current[channel].maxRetries) },
                              } : current);
                            }}
                          />
                        </Space>
                      </Space>
                    </Card>
                  );
                })}
              </Space>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card
            title="Templates"
            extra={
              <Space>
                <Select
                  mode="multiple"
                  style={{ minWidth: 220 }}
                  value={selectedChannels}
                  options={channelOptions}
                  onChange={(value) => setSelectedChannels(value as AdminMarketingChannel[])}
                />
                <Button type="primary" disabled={isAuditor || !templateDrafts} loading={savingTemplates} onClick={() => void handleSaveTemplates()}>
                  Save templates
                </Button>
              </Space>
            }
          >
            {!templateDrafts ? (
              <Text type="secondary">Select a lab to load templates.</Text>
            ) : (
              <Tabs
                items={CHANNELS.map((channel) => ({
                  key: channel,
                  label: channel,
                  children: (
                    <Input.TextArea
                      rows={8}
                      disabled={isAuditor}
                      value={templateDrafts[channel]}
                      onChange={(e) => {
                        const next = e.target.value;
                        setTemplateDrafts((current) => current ? { ...current, [channel]: next } : current);
                      }}
                      placeholder={`Template for ${channel}. Supports {{patientName}} and {{labName}}`}
                    />
                  ),
                }))}
              />
            )}
          </Card>
        </Col>
      </Row>

      <Card title="Preview & Send" style={{ marginTop: 16 }}>
        <Space align="start" wrap>
          <Button onClick={() => void handlePreview()} loading={previewLoading}>
            Refresh preview
          </Button>
          <Button type="primary" disabled={isAuditor || sending || !labId} loading={sending} onClick={() => void handleSend()}>
            Send campaign
          </Button>
          {previewResult ? (
            <Space size={20} wrap>
              <Statistic title="Matched orders" value={previewResult.matchedOrdersCount} />
              <Statistic title="With phone" value={previewResult.phonesWithValueCount} />
              <Statistic title="Unique phones" value={previewResult.uniquePhonesCount} />
              <Statistic title="Excluded" value={previewResult.excludedCount} />
              <Statistic title="Final send count" value={previewResult.finalSendCount} />
            </Space>
          ) : (
            <Text type="secondary">Run preview to inspect recipient counts before send.</Text>
          )}
        </Space>
      </Card>

      <Card title="Batch History" style={{ marginTop: 16 }}>
        <Table
          rowKey="id"
          loading={jobsLoading}
          columns={jobsColumns}
          dataSource={jobs}
          pagination={{
            current: jobsPage,
            total: jobsTotal,
            pageSize: DEFAULT_PAGE_SIZE,
            onChange: (page) => setJobsPage(page),
          }}
        />
      </Card>

      <Drawer
        title={selectedBatchId ? `Batch ${selectedBatchId}` : 'Batch details'}
        width={980}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedBatchId(null);
          setSelectedJob(null);
        }}
      >
        {!selectedJob ? (
          drawerLoading ? <Text>Loading...</Text> : <Text type="secondary">No batch selected.</Text>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Status">
                <Tag color={batchStatusColor(selectedJob.batch.status)}>{selectedJob.batch.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Channels">{selectedJob.batch.channels.join(', ')}</Descriptions.Item>
              <Descriptions.Item label="Created">{formatDate(selectedJob.batch.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="Started">{formatDate(selectedJob.batch.startedAt)}</Descriptions.Item>
              <Descriptions.Item label="Completed">{formatDate(selectedJob.batch.completedAt)}</Descriptions.Item>
              <Descriptions.Item label="Requested">{selectedJob.batch.requestedRecipientsCount}</Descriptions.Item>
              <Descriptions.Item label="Sent">{selectedJob.batch.sentCount}</Descriptions.Item>
              <Descriptions.Item label="Failed">{selectedJob.batch.failedCount}</Descriptions.Item>
              <Descriptions.Item label="Skipped">{selectedJob.batch.skippedCount}</Descriptions.Item>
              <Descriptions.Item label="Excluded phones" span={2}>
                {selectedJob.batch.excludedPhones.length > 0
                  ? selectedJob.batch.excludedPhones.join(', ')
                  : '-'}
              </Descriptions.Item>
              {selectedJob.batch.errorMessage ? (
                <Descriptions.Item label="Error" span={2}>
                  <Text type="danger">{selectedJob.batch.errorMessage}</Text>
                </Descriptions.Item>
              ) : null}
            </Descriptions>

            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={selectedJob.recipients.items}
              columns={[
                { title: 'Channel', dataIndex: 'channel', key: 'channel', width: 110 },
                {
                  title: 'Status',
                  dataIndex: 'status',
                  key: 'status',
                  width: 140,
                  render: (value: string) => <Tag color={recipientStatusColor(value)}>{value}</Tag>,
                },
                { title: 'Name', dataIndex: 'recipientName', key: 'recipientName', width: 220 },
                { title: 'Phone', dataIndex: 'recipientPhoneRaw', key: 'recipientPhoneRaw', width: 160 },
                { title: 'Attempts', dataIndex: 'attemptCount', key: 'attemptCount', width: 90 },
                {
                  title: 'Sent At',
                  dataIndex: 'sentAt',
                  key: 'sentAt',
                  width: 170,
                  render: (value: string | null) => formatDate(value),
                },
                {
                  title: 'Error',
                  dataIndex: 'errorMessage',
                  key: 'errorMessage',
                  render: (value: string | null) => value || '-',
                },
              ]}
            />
          </Space>
        )}
      </Drawer>
    </div>
  );
}

function toConfigDraft(config: AdminBulkMessagingLabConfigDto): ConfigDraftRecord {
  return {
    WHATSAPP: {
      enabled: config.channels.WHATSAPP.enabled,
      webhookUrl: config.channels.WHATSAPP.webhookUrl ?? '',
      senderLabel: config.channels.WHATSAPP.senderLabel ?? '',
      timeoutMs: config.channels.WHATSAPP.timeoutMs ?? 10000,
      maxRetries: config.channels.WHATSAPP.maxRetries ?? 2,
      authToken: '',
      hasAuthToken: config.channels.WHATSAPP.hasAuthToken,
    },
    VIBER: {
      enabled: config.channels.VIBER.enabled,
      webhookUrl: config.channels.VIBER.webhookUrl ?? '',
      senderLabel: config.channels.VIBER.senderLabel ?? '',
      timeoutMs: config.channels.VIBER.timeoutMs ?? 10000,
      maxRetries: config.channels.VIBER.maxRetries ?? 2,
      authToken: '',
      hasAuthToken: config.channels.VIBER.hasAuthToken,
    },
    SMS: {
      enabled: config.channels.SMS.enabled,
      webhookUrl: config.channels.SMS.webhookUrl ?? '',
      senderLabel: config.channels.SMS.senderLabel ?? '',
      timeoutMs: config.channels.SMS.timeoutMs ?? 10000,
      maxRetries: config.channels.SMS.maxRetries ?? 2,
      authToken: '',
      hasAuthToken: config.channels.SMS.hasAuthToken,
    },
  };
}

function toTemplateDraft(templates: AdminBulkMessagingTemplatesDto): TemplateDraftRecord {
  return {
    WHATSAPP: templates.templates.WHATSAPP.templateText ?? '',
    VIBER: templates.templates.VIBER.templateText ?? '',
    SMS: templates.templates.SMS.templateText ?? '',
  };
}

function getInitialDateRange(): [Dayjs, Dayjs] {
  const fallback: [Dayjs, Dayjs] = [
    dayjs().subtract(6, 'day').startOf('day'),
    dayjs().endOf('day'),
  ];
  const stored = localStorage.getItem(ADMIN_DATE_RANGE_KEY);
  if (!stored) return fallback;
  try {
    const parsed = JSON.parse(stored) as StoredAdminDateRange;
    const start = dayjs(parsed.start);
    const end = dayjs(parsed.end);
    if (!start.isValid() || !end.isValid()) return fallback;
    return [start, end];
  } catch {
    return fallback;
  }
}

function serializeRange(range: [Dayjs, Dayjs]): string {
  return `${range[0].toISOString()}_${range[1].toISOString()}`;
}

function batchStatusColor(status: AdminMarketingBatchStatus): string {
  if (status === 'COMPLETED') return 'green';
  if (status === 'COMPLETED_WITH_ERRORS') return 'gold';
  if (status === 'RUNNING') return 'blue';
  if (status === 'FAILED') return 'red';
  return 'default';
}

function recipientStatusColor(status: string): string {
  if (status === 'SENT') return 'green';
  if (status === 'FAILED') return 'red';
  if (status === 'SKIPPED') return 'gold';
  return 'default';
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function getErrorMessage(err: unknown): string | null {
  if (!err || typeof err !== 'object' || !('response' in err)) return null;
  const data = (err as { response?: { data?: { message?: string | string[] } } }).response?.data;
  const msg = data?.message;
  if (Array.isArray(msg)) return msg[0] ?? null;
  if (typeof msg === 'string') return msg;
  return null;
}
