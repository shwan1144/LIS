import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Col, Empty, Input, Row, Select, Space, Tabs, Tag, Typography, message } from 'antd';
import {
  getAdminLabSettings,
  updateAdminLabSettings,
  type ReportBrandingDto,
} from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminLabSelection } from './useAdminLabSelection';

const { Title, Text } = Typography;

type BrandingKey = keyof ReportBrandingDto;

type ImageSettingMeta = {
  key: BrandingKey;
  title: string;
  recommendedSize: string;
  note: string;
  maxBytes: number;
};

const IMAGE_SETTINGS: ImageSettingMeta[] = [
  {
    key: 'bannerDataUrl',
    title: 'Report Banner',
    recommendedSize: '2480 x 220 px',
    note: 'Wide image for the top of every report page.',
    maxBytes: 2 * 1024 * 1024,
  },
  {
    key: 'footerDataUrl',
    title: 'Report Footer',
    recommendedSize: '2480 x 220 px',
    note: 'Wide image for the bottom of every report page.',
    maxBytes: 2 * 1024 * 1024,
  },
  {
    key: 'logoDataUrl',
    title: 'Report Logo',
    recommendedSize: '500 x 500 px',
    note: 'Square logo used in report header.',
    maxBytes: 1 * 1024 * 1024,
  },
  {
    key: 'watermarkDataUrl',
    title: 'Report Watermark',
    recommendedSize: '1200 x 1200 px',
    note: 'Use transparent PNG for best watermark quality.',
    maxBytes: 1 * 1024 * 1024,
  },
];

const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);

function emptyBranding(): ReportBrandingDto {
  return {
    bannerDataUrl: null,
    footerDataUrl: null,
    logoDataUrl: null,
    watermarkDataUrl: null,
  };
}

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : '';
      if (!value) {
        reject(new Error('Could not read image file'));
        return;
      }
      resolve(value);
    };
    reader.onerror = () => reject(new Error('Could not read image file'));
    reader.readAsDataURL(file);
  });
}

export function AdminLabReportDesignPage() {
  const { user } = useAuth();
  const canMutate = user?.role === 'SUPER_ADMIN';
  const { labs, selectedLab, selectedLabId, loadingLabs, selectLab } = useAdminLabSelection();
  const fileInputRefs = useRef<Partial<Record<BrandingKey, HTMLInputElement | null>>>({});
  const onlineWatermarkInputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<BrandingKey | null>(null);
  const [uploadingOnlineWatermark, setUploadingOnlineWatermark] = useState(false);
  const [branding, setBranding] = useState<ReportBrandingDto>(emptyBranding);
  const [onlineResultWatermarkDataUrl, setOnlineResultWatermarkDataUrl] = useState<string | null>(null);
  const [onlineResultWatermarkText, setOnlineResultWatermarkText] = useState('');
  const [savedSnapshot, setSavedSnapshot] = useState<{
    branding: ReportBrandingDto;
    onlineResultWatermarkDataUrl: string | null;
    onlineResultWatermarkText: string;
  } | null>(null);

  useEffect(() => {
    if (!selectedLabId) return;
    const load = async () => {
      setLoading(true);
      try {
        const data = await getAdminLabSettings(selectedLabId);
        const nextBranding = data.reportBranding || emptyBranding();
        const nextWatermarkDataUrl = data.onlineResultWatermarkDataUrl || null;
        const nextWatermarkText = data.onlineResultWatermarkText || '';
        setBranding(nextBranding);
        setOnlineResultWatermarkDataUrl(nextWatermarkDataUrl);
        setOnlineResultWatermarkText(nextWatermarkText);
        setSavedSnapshot({
          branding: nextBranding,
          onlineResultWatermarkDataUrl: nextWatermarkDataUrl,
          onlineResultWatermarkText: nextWatermarkText,
        });
      } catch (error) {
        message.error(getErrorMessage(error) || 'Failed to load report design settings');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [selectedLabId]);

  const hasChanges = useMemo(() => {
    if (!savedSnapshot) return false;
    return (
      savedSnapshot.branding.bannerDataUrl !== branding.bannerDataUrl ||
      savedSnapshot.branding.footerDataUrl !== branding.footerDataUrl ||
      savedSnapshot.branding.logoDataUrl !== branding.logoDataUrl ||
      savedSnapshot.branding.watermarkDataUrl !== branding.watermarkDataUrl ||
      savedSnapshot.onlineResultWatermarkDataUrl !== onlineResultWatermarkDataUrl ||
      savedSnapshot.onlineResultWatermarkText !== onlineResultWatermarkText
    );
  }, [branding, onlineResultWatermarkDataUrl, onlineResultWatermarkText, savedSnapshot]);

  const setImage = (key: BrandingKey, value: string | null) => {
    setBranding((prev) => ({ ...prev, [key]: value }));
  };

  const handleFileSelect = async (key: BrandingKey, maxBytes: number, event: ChangeEvent<HTMLInputElement>) => {
    if (!canMutate) {
      message.warning('Read-only mode: AUDITOR cannot upload report design');
      event.currentTarget.value = '';
      return;
    }
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      message.error('Only PNG, JPG/JPEG, and WebP images are allowed');
      return;
    }
    if (file.size > maxBytes) {
      const maxMb = (maxBytes / (1024 * 1024)).toFixed(0);
      message.error(`Image is too large. Max size is ${maxMb} MB.`);
      return;
    }
    setUploadingKey(key);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setImage(key, dataUrl);
      message.success('Image uploaded');
    } catch {
      message.error('Failed to read image file');
    } finally {
      setUploadingKey(null);
    }
  };

  const handleOnlineWatermarkFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!canMutate) {
      message.warning('Read-only mode: AUDITOR cannot upload watermark');
      event.currentTarget.value = '';
      return;
    }
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const maxBytes = 2 * 1024 * 1024;
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      message.error('Only PNG, JPG/JPEG, and WebP images are allowed');
      return;
    }
    if (file.size > maxBytes) {
      message.error('Image is too large. Max size is 2 MB.');
      return;
    }
    setUploadingOnlineWatermark(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setOnlineResultWatermarkDataUrl(dataUrl);
      message.success('Online watermark image uploaded');
    } catch {
      message.error('Failed to read image file');
    } finally {
      setUploadingOnlineWatermark(false);
    }
  };

  const handleSave = async () => {
    if (!selectedLabId) return;
    if (!canMutate) {
      message.warning('Read-only mode: AUDITOR cannot save report design');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateAdminLabSettings(selectedLabId, {
        reportBranding: branding,
        onlineResultWatermarkDataUrl,
        onlineResultWatermarkText: onlineResultWatermarkText.trim() || null,
      });
      const nextBranding = updated.reportBranding || emptyBranding();
      const nextWatermarkDataUrl = updated.onlineResultWatermarkDataUrl || null;
      const nextWatermarkText = updated.onlineResultWatermarkText || '';
      setBranding(nextBranding);
      setOnlineResultWatermarkDataUrl(nextWatermarkDataUrl);
      setOnlineResultWatermarkText(nextWatermarkText);
      setSavedSnapshot({
        branding: nextBranding,
        onlineResultWatermarkDataUrl: nextWatermarkDataUrl,
        onlineResultWatermarkText: nextWatermarkText,
      });
      message.success('Report design settings saved');
    } catch (error) {
      message.error(getErrorMessage(error) || 'Failed to save report design settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Title level={4} style={{ marginTop: 0 }}>
        Report Design
      </Title>
      <Text type="secondary">Manage report branding per lab from admin panel.</Text>

      <Card style={{ marginTop: 16 }}>
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
      </Card>

      {!selectedLab ? (
        <Card style={{ marginTop: 16 }}>
          <Empty description="No lab selected" />
        </Card>
      ) : (
        <>
          <Alert
            type="info"
            showIcon
            style={{ marginTop: 16 }}
            message={`${selectedLab.name} (${selectedLab.code})`}
            description={
              canMutate
                ? 'Use PNG for transparent logo/watermark. Keep banner/footer wide for A4 width.'
                : 'Read-only mode: AUDITOR can view design but cannot change it.'
            }
          />

          <Tabs
            style={{ marginTop: 16 }}
            defaultActiveKey="pdf-design"
            items={[
              {
                key: 'pdf-design',
                label: 'PDF Design',
                children: (
                  <Row gutter={[16, 16]}>
                    {IMAGE_SETTINGS.map((item) => {
                      const currentImage = branding[item.key];
                      return (
                        <Col key={item.key} xs={24} lg={12}>
                          <Card title={item.title} loading={loading}>
                            <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
                              Recommended size: {item.recommendedSize}
                            </Text>
                            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                              {item.note}
                            </Text>

                            <div
                              style={{
                                border: '1px dashed #d9d9d9',
                                borderRadius: 8,
                                minHeight: 120,
                                padding: 8,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginBottom: 12,
                                background: '#fafafa',
                              }}
                            >
                              {currentImage ? (
                                <img
                                  src={currentImage}
                                  alt={item.title}
                                  style={{ maxWidth: '100%', maxHeight: 180, objectFit: 'contain' }}
                                />
                              ) : (
                                <Text type="secondary">No image uploaded</Text>
                              )}
                            </div>

                            <Space wrap>
                              <input
                                ref={(el) => {
                                  fileInputRefs.current[item.key] = el;
                                }}
                                type="file"
                                accept="image/png,image/jpeg,image/jpg,image/webp"
                                onChange={(event) => void handleFileSelect(item.key, item.maxBytes, event)}
                                style={{ display: 'none' }}
                              />
                              <Button
                                loading={uploadingKey === item.key}
                                onClick={() => fileInputRefs.current[item.key]?.click()}
                                disabled={!canMutate}
                              >
                                {currentImage ? 'Replace image' : 'Upload image'}
                              </Button>
                              <Button
                                danger
                                onClick={() => setImage(item.key, null)}
                                disabled={!currentImage || !canMutate}
                              >
                                Clear
                              </Button>
                            </Space>
                          </Card>
                        </Col>
                      );
                    })}
                  </Row>
                ),
              },
              {
                key: 'online-watermark',
                label: 'Online Result Watermark',
                children: (
                  <Card title="Online Result Watermark" loading={loading}>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                      Optional image/text watermark for patient online result page.
                    </Text>
                    <div
                      style={{
                        border: '1px dashed #d9d9d9',
                        borderRadius: 8,
                        minHeight: 140,
                        padding: 10,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: 12,
                        background: '#fafafa',
                      }}
                    >
                      {onlineResultWatermarkDataUrl ? (
                        <img
                          src={onlineResultWatermarkDataUrl}
                          alt="Online result watermark"
                          style={{ maxWidth: '100%', maxHeight: 220, objectFit: 'contain' }}
                        />
                      ) : (
                        <Text type="secondary">No online watermark image uploaded</Text>
                      )}
                    </div>
                    <Space wrap style={{ marginBottom: 12 }}>
                      <input
                        ref={onlineWatermarkInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp"
                        onChange={(event) => void handleOnlineWatermarkFileSelect(event)}
                        style={{ display: 'none' }}
                      />
                      <Button
                        loading={uploadingOnlineWatermark}
                        onClick={() => onlineWatermarkInputRef.current?.click()}
                        disabled={!canMutate}
                      >
                        {onlineResultWatermarkDataUrl ? 'Replace image' : 'Upload image'}
                      </Button>
                      <Button
                        danger
                        onClick={() => setOnlineResultWatermarkDataUrl(null)}
                        disabled={!onlineResultWatermarkDataUrl || !canMutate}
                      >
                        Clear image
                      </Button>
                    </Space>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                      Optional text watermark:
                    </Text>
                    <Input
                      value={onlineResultWatermarkText}
                      onChange={(event) => setOnlineResultWatermarkText(event.target.value)}
                      maxLength={120}
                      showCount
                      placeholder="ONLINE VERSION"
                      allowClear
                      disabled={!canMutate}
                    />
                  </Card>
                ),
              },
            ]}
          />

          <div style={{ marginTop: 16 }}>
            <Space>
              <Button
                type="primary"
                onClick={() => void handleSave()}
                loading={saving}
                disabled={!hasChanges || !canMutate}
              >
                Save report design
              </Button>
              <Button
                onClick={() => {
                  if (!savedSnapshot) return;
                  setBranding(savedSnapshot.branding);
                  setOnlineResultWatermarkDataUrl(savedSnapshot.onlineResultWatermarkDataUrl);
                  setOnlineResultWatermarkText(savedSnapshot.onlineResultWatermarkText);
                }}
                disabled={!hasChanges}
              >
                Reset changes
              </Button>
              {!canMutate ? <Tag color="orange">Read-only mode</Tag> : null}
            </Space>
          </div>
        </>
      )}
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
