import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Col, Row, Space, Typography, message } from 'antd';
import {
  getLabSettings,
  updateLabSettings,
  type LabSettingsDto,
  type ReportBrandingDto,
} from '../../api/client';

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
    recommendedSize: '2480 x 350 px',
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

export function SettingsReportDesignPage() {
  const fileInputRefs = useRef<Partial<Record<BrandingKey, HTMLInputElement | null>>>({});
  const [settings, setSettings] = useState<LabSettingsDto | null>(null);
  const [branding, setBranding] = useState<ReportBrandingDto>(emptyBranding);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<BrandingKey | null>(null);

  const hasChanges = useMemo(() => {
    if (!settings) return false;
    const current = settings.reportBranding || emptyBranding();
    return (
      current.bannerDataUrl !== branding.bannerDataUrl ||
      current.footerDataUrl !== branding.footerDataUrl ||
      current.logoDataUrl !== branding.logoDataUrl ||
      current.watermarkDataUrl !== branding.watermarkDataUrl
    );
  }, [branding, settings]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getLabSettings();
      setSettings(data);
      setBranding(data.reportBranding || emptyBranding());
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

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateLabSettings({ reportBranding: branding });
      setSettings(updated);
      setBranding(updated.reportBranding || emptyBranding());
      message.success('Report design settings saved');
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : 'Failed to save report design settings';
      message.error(msg || 'Failed to save report design settings');
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
        description="Use PNG for transparent logo/watermark. Keep banner and footer wide to match A4 report width."
      />

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
            onClick={() => setBranding(settings?.reportBranding || emptyBranding())}
            disabled={!hasChanges}
          >
            Reset changes
          </Button>
        </Space>
      </div>
    </div>
  );
}
