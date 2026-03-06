import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Col, Input, Row, Space, Tabs, Typography, message } from 'antd';
import {
  getLabSettings,
  updateLabSettings,
  type LabSettingsDto,
  type ReportBrandingDto,
} from '../../api/client';

const { Title, Text } = Typography;
const REPORT_DESIGN_VERSION_STORAGE_KEY = 'lis_report_design_version';
const MAX_BANNER_FOOTER_BYTES = Math.floor(2.75 * 1024 * 1024);
const MIN_REPORT_BANNER_WIDTH = 2400;
const MIN_REPORT_BANNER_HEIGHT = 600;
const REPORT_BANNER_RECOMMENDED_SIZE_MM = '198 x 50 mm';
const REPORT_FOOTER_RECOMMENDED_SIZE_MM = '198 x 18 mm';

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
    recommendedSize: REPORT_BANNER_RECOMMENDED_SIZE_MM,
    note: 'Wide image for the top of every report page (A4 printable width).',
    maxBytes: MAX_BANNER_FOOTER_BYTES,
  },
  {
    key: 'footerDataUrl',
    title: 'Report Footer',
    recommendedSize: REPORT_FOOTER_RECOMMENDED_SIZE_MM,
    note: 'Wide image for the bottom of every report page (A4 printable width).',
    maxBytes: MAX_BANNER_FOOTER_BYTES,
  },
  {
    key: 'logoDataUrl',
    title: 'Report Logo',
    recommendedSize: '500 x 500 px',
    note: 'Square logo used in default report header.',
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
const MAX_UPLOAD_INPUT_BYTES = 12 * 1024 * 1024;
const ONLINE_WATERMARK_MAX_BYTES = 2 * 1024 * 1024;

function emptyBranding(): ReportBrandingDto {
  return {
    bannerDataUrl: null,
    footerDataUrl: null,
    logoDataUrl: null,
    watermarkDataUrl: null,
  };
}

function getChangedBrandingFields(
  previous: ReportBrandingDto,
  next: ReportBrandingDto,
): Partial<ReportBrandingDto> | undefined {
  const changed: Partial<ReportBrandingDto> = {};
  (Object.keys(previous) as BrandingKey[]).forEach((key) => {
    if (previous[key] !== next[key]) {
      changed[key] = next[key];
    }
  });
  return Object.keys(changed).length > 0 ? changed : undefined;
}

function getSaveErrorMessage(err: unknown, fallback: string): string {
  if (!err || typeof err !== 'object' || !('response' in err)) {
    return fallback;
  }

  const response = (err as {
    response?: {
      status?: number;
      data?: { message?: string | string[] };
    };
  }).response;
  if (response?.status === 413) {
    return 'Payload too large; compress image or reduce dimensions.';
  }

  const raw = response?.data?.message;
  if (Array.isArray(raw)) {
    return raw[0] || fallback;
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim();
  }
  return fallback;
}

function formatMegabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (Number.isInteger(mb)) return String(mb);
  return mb.toFixed(2).replace(/\.?0+$/, '');
}

function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : '';
      if (!value) {
        reject(new Error('Could not read image data'));
        return;
      }
      resolve(value);
    };
    reader.onerror = () => reject(new Error('Could not read image data'));
    reader.readAsDataURL(file);
  });
}

function readImageDimensions(file: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      URL.revokeObjectURL(objectUrl);
      if (!width || !height) {
        reject(new Error('Invalid image dimensions'));
        return;
      }
      resolve({ width, height });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not decode image'));
    };
    image.src = objectUrl;
  });
}

export function SettingsReportDesignPage() {
  const fileInputRefs = useRef<Partial<Record<BrandingKey, HTMLInputElement | null>>>({});
  const onlineWatermarkInputRef = useRef<HTMLInputElement | null>(null);
  const [settings, setSettings] = useState<LabSettingsDto | null>(null);
  const [branding, setBranding] = useState<ReportBrandingDto>(emptyBranding);
  const [onlineResultWatermarkDataUrl, setOnlineResultWatermarkDataUrl] = useState<string | null>(null);
  const [onlineResultWatermarkText, setOnlineResultWatermarkText] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<BrandingKey | null>(null);
  const [uploadingOnlineWatermark, setUploadingOnlineWatermark] = useState(false);

  const hasChanges = useMemo(() => {
    if (!settings) return false;
    const current = settings.reportBranding || emptyBranding();
    return (
      current.bannerDataUrl !== branding.bannerDataUrl ||
      current.footerDataUrl !== branding.footerDataUrl ||
      current.logoDataUrl !== branding.logoDataUrl ||
      current.watermarkDataUrl !== branding.watermarkDataUrl ||
      (settings.onlineResultWatermarkDataUrl || null) !== onlineResultWatermarkDataUrl ||
      (settings.onlineResultWatermarkText || '') !== onlineResultWatermarkText
    );
  }, [branding, onlineResultWatermarkDataUrl, onlineResultWatermarkText, settings]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getLabSettings();
      setSettings(data);
      setBranding(data.reportBranding || emptyBranding());
      setOnlineResultWatermarkDataUrl(data.onlineResultWatermarkDataUrl || null);
      setOnlineResultWatermarkText(data.onlineResultWatermarkText || '');
    } catch {
      message.error('Failed to load report design settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const setImage = (key: BrandingKey, value: string | null) => {
    setBranding((prev) => ({ ...prev, [key]: value }));
  };

  const handleFileSelect = async (
    key: BrandingKey,
    maxBytes: number,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      message.error('Only PNG, JPG/JPEG, and WebP images are allowed');
      return;
    }
    if (file.size > MAX_UPLOAD_INPUT_BYTES) {
      message.error('Image is too large. Max input size is 12 MB.');
      return;
    }

    setUploadingKey(key);
    try {
      const setting = IMAGE_SETTINGS.find((item) => item.key === key);
      if (!setting) {
        message.error('Unknown image setting');
        return;
      }
      if (file.size > maxBytes) {
        message.error(
          `Image is too large. Max size is ${formatMegabytes(maxBytes)} MB.`,
        );
        return;
      }
      if (key === 'bannerDataUrl' || key === 'footerDataUrl') {
        const { width, height } = await readImageDimensions(file);
        if (width < MIN_REPORT_BANNER_WIDTH || height < MIN_REPORT_BANNER_HEIGHT) {
          const recommendedSize =
            key === 'bannerDataUrl'
              ? REPORT_BANNER_RECOMMENDED_SIZE_MM
              : REPORT_FOOTER_RECOMMENDED_SIZE_MM;
          message.error(
            `${setting.title} resolution is too low for print. Upload a higher-resolution image designed for ${recommendedSize}.`,
          );
          return;
        }
      }
      const dataUrl = await readFileAsDataUrl(file);
      setImage(key, dataUrl);
      message.success(`Image uploaded (${Math.round(file.size / 1024)} KB)`);
    } catch {
      message.error('Failed to process image file');
    } finally {
      setUploadingKey(null);
    }
  };

  const handleOnlineWatermarkFileSelect = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      message.error('Only PNG, JPG/JPEG, and WebP images are allowed');
      return;
    }
    if (file.size > MAX_UPLOAD_INPUT_BYTES) {
      message.error('Image is too large. Max input size is 12 MB.');
      return;
    }

    setUploadingOnlineWatermark(true);
    try {
      if (file.size > ONLINE_WATERMARK_MAX_BYTES) {
        message.error('Image is too large. Max size is 2 MB.');
        return;
      }
      const dataUrl = await readFileAsDataUrl(file);
      setOnlineResultWatermarkDataUrl(dataUrl);
      message.success(`Online watermark uploaded (${Math.round(file.size / 1024)} KB)`);
    } catch {
      message.error('Failed to process image file');
    } finally {
      setUploadingOnlineWatermark(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;

    setSaving(true);
    try {
      const currentBranding = settings.reportBranding || emptyBranding();
      const changedBranding = getChangedBrandingFields(currentBranding, branding);
      const trimmedWatermarkText = onlineResultWatermarkText.trim();
      const hasOnlineWatermarkDataUrlChanges =
        (settings.onlineResultWatermarkDataUrl || null) !== onlineResultWatermarkDataUrl;
      const hasOnlineWatermarkTextChanges =
        (settings.onlineResultWatermarkText || '') !== onlineResultWatermarkText;

      if (!changedBranding && !hasOnlineWatermarkDataUrlChanges && !hasOnlineWatermarkTextChanges) {
        message.info('No changes to save');
        setSaving(false);
        return;
      }

      const updated = await updateLabSettings({
        reportBranding: changedBranding,
        onlineResultWatermarkDataUrl: hasOnlineWatermarkDataUrlChanges
          ? onlineResultWatermarkDataUrl
          : undefined,
        onlineResultWatermarkText: hasOnlineWatermarkTextChanges
          ? trimmedWatermarkText || null
          : undefined,
      });
      setSettings(updated);
      setBranding(updated.reportBranding || emptyBranding());
      setOnlineResultWatermarkDataUrl(updated.onlineResultWatermarkDataUrl || null);
      setOnlineResultWatermarkText(updated.onlineResultWatermarkText || '');
      try {
        window.localStorage.setItem(REPORT_DESIGN_VERSION_STORAGE_KEY, `lab:${Date.now()}`);
      } catch {
        // Ignore local storage errors.
      }
      message.success('Report design settings saved');
    } catch (err: unknown) {
      message.error(getSaveErrorMessage(err, 'Failed to save report design settings'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <Title level={4}>Report Design</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Upload custom images for report banner, footer, logo, and watermark.
      </Text>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16, maxWidth: 980 }}
        message="Design tip"
        description={`Use PNG for transparent logo/watermark. Banner: ${REPORT_BANNER_RECOMMENDED_SIZE_MM}. Footer: ${REPORT_FOOTER_RECOMMENDED_SIZE_MM}.`}
      />

      <Tabs
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
                            onChange={(event) => handleFileSelect(item.key, item.maxBytes, event)}
                            style={{ display: 'none' }}
                          />
                          <Button
                            loading={uploadingKey === item.key}
                            onClick={() => fileInputRefs.current[item.key]?.click()}
                          >
                            {currentImage ? 'Replace image' : 'Upload image'}
                          </Button>
                          <Button
                            danger
                            onClick={() => setImage(item.key, null)}
                            disabled={!currentImage}
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
            key: 'online-result',
            label: 'Online Result',
            children: (
              <Card title="Online Result Watermark" loading={loading} style={{ maxWidth: 980 }}>
                <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                  Upload an image watermark for the patient online result page.
                </Text>
                <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                  Recommended size: 1200 x 1200 px (PNG with transparency works best).
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
                    onChange={handleOnlineWatermarkFileSelect}
                    style={{ display: 'none' }}
                  />
                  <Button
                    loading={uploadingOnlineWatermark}
                    onClick={() => onlineWatermarkInputRef.current?.click()}
                  >
                    {onlineResultWatermarkDataUrl ? 'Replace image' : 'Upload image'}
                  </Button>
                  <Button
                    danger
                    onClick={() => setOnlineResultWatermarkDataUrl(null)}
                    disabled={!onlineResultWatermarkDataUrl}
                  >
                    Clear image
                  </Button>
                </Space>
                <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                  Optional text watermark (used if no image is uploaded):
                </Text>
                <Input
                  value={onlineResultWatermarkText}
                  onChange={(event) => setOnlineResultWatermarkText(event.target.value)}
                  maxLength={120}
                  showCount
                  placeholder="ONLINE VERSION"
                  allowClear
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
            onClick={handleSave}
            loading={saving}
            disabled={!hasChanges}
          >
            Save report design
          </Button>
          <Button
            onClick={() => {
              setBranding(settings?.reportBranding || emptyBranding());
              setOnlineResultWatermarkDataUrl(settings?.onlineResultWatermarkDataUrl || null);
              setOnlineResultWatermarkText(settings?.onlineResultWatermarkText || '');
            }}
            disabled={!hasChanges}
          >
            Reset changes
          </Button>
        </Space>
      </div>
    </div>
  );
}
