import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  ColorPicker,
  Empty,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Switch,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  getAdminLabSettings,
  updateAdminLabSettings,
  type ReportStyleDto,
  type ReportBrandingDto,
} from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminLabSelection } from './useAdminLabSelection';

const { Title, Text } = Typography;
const REPORT_DESIGN_VERSION_STORAGE_KEY = 'lis_report_design_version';
const MAX_BANNER_FOOTER_BYTES = Math.floor(2.75 * 1024 * 1024);
const MIN_REPORT_BANNER_WIDTH = 2400;
const MIN_REPORT_BANNER_HEIGHT = 600;

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
    recommendedSize: '3000 x 750 px',
    note: 'Wide image for the top of every report page.',
    maxBytes: MAX_BANNER_FOOTER_BYTES,
  },
  {
    key: 'footerDataUrl',
    title: 'Report Footer',
    recommendedSize: '3000 x 750 px',
    note: 'Wide image for the bottom of every report page.',
    maxBytes: MAX_BANNER_FOOTER_BYTES,
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
const MAX_UPLOAD_INPUT_BYTES = 12 * 1024 * 1024;
const ONLINE_WATERMARK_MAX_BYTES = 2 * 1024 * 1024;
const ALIGN_OPTIONS = [
  { label: 'Left', value: 'left' },
  { label: 'Center', value: 'center' },
  { label: 'Right', value: 'right' },
] as const;
const LABEL_WEIGHT_OPTIONS = [
  { label: '600', value: 600 },
  { label: '700', value: 700 },
  { label: '800', value: 800 },
] as const;
const VALUE_WEIGHT_OPTIONS = [
  { label: '400', value: 400 },
  { label: '500', value: 500 },
  { label: '600', value: 600 },
  { label: '700', value: 700 },
] as const;
const BREAK_OPTIONS = [
  { label: 'Avoid break', value: 'avoid' },
  { label: 'Auto', value: 'auto' },
] as const;

function emptyBranding(): ReportBrandingDto {
  return {
    bannerDataUrl: null,
    footerDataUrl: null,
    logoDataUrl: null,
    watermarkDataUrl: null,
  };
}

function defaultReportStyle(): ReportStyleDto {
  return {
    version: 1,
    patientInfo: {
      backgroundColor: '#FAFAFA',
      borderColor: '#CCCCCC',
      textColor: '#333333',
      labelColor: '#333333',
      fontSizePx: 13,
      labelFontWeight: 700,
      valueFontWeight: 400,
      textAlign: 'left',
      borderRadiusPx: 6,
      paddingYpx: 10,
      paddingXpx: 12,
    },
    resultsTable: {
      headerBackgroundColor: '#F2F2F2',
      headerTextColor: '#333333',
      headerFontSizePx: 12,
      headerTextAlign: 'left',
      bodyTextColor: '#333333',
      bodyFontSizePx: 12,
      cellTextAlign: 'left',
      borderColor: '#EEEEEE',
      rowStripeEnabled: false,
      rowStripeColor: '#F9FBFF',
      abnormalRowBackgroundColor: '#FFF5F5',
      referenceValueColor: '#333333',
      departmentRowBackgroundColor: '#222222',
      departmentRowTextColor: '#FFFFFF',
      departmentRowFontSizePx: 12,
      departmentRowTextAlign: 'left',
      categoryRowBackgroundColor: '#F2F2F2',
      categoryRowTextColor: '#555555',
      categoryRowFontSizePx: 12,
      categoryRowTextAlign: 'left',
      statusNormalColor: '#0F8A1F',
      statusHighColor: '#D00000',
      statusLowColor: '#0066CC',
      regularDepartmentBlockBreak: 'avoid',
      regularRowBreak: 'avoid',
      panelTableBreak: 'auto',
      panelRowBreak: 'avoid',
    },
  };
}

function cloneReportStyle(style: ReportStyleDto): ReportStyleDto {
  return JSON.parse(JSON.stringify(style)) as ReportStyleDto;
}

function normalizeHexColor(value: string): string {
  const normalized = value.trim();
  if (!normalized.startsWith('#')) {
    return `#${normalized}`.toUpperCase();
  }
  return normalized.toUpperCase();
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

function StyleColorControl(props: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <Text>{props.label}</Text>
      <ColorPicker
        value={props.value}
        disabled={props.disabled}
        showText
        onChange={(color: any) => props.onChange(normalizeHexColor(color.toHexString()))}
      />
    </div>
  );
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
  const [reportStyle, setReportStyle] = useState<ReportStyleDto>(defaultReportStyle);
  const [onlineResultWatermarkDataUrl, setOnlineResultWatermarkDataUrl] = useState<string | null>(null);
  const [onlineResultWatermarkText, setOnlineResultWatermarkText] = useState('');
  const [savedSnapshot, setSavedSnapshot] = useState<{
    branding: ReportBrandingDto;
    reportStyle: ReportStyleDto;
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
        const nextReportStyle = data.reportStyle || defaultReportStyle();
        const nextWatermarkDataUrl = data.onlineResultWatermarkDataUrl || null;
        const nextWatermarkText = data.onlineResultWatermarkText || '';
        setBranding(nextBranding);
        setReportStyle(cloneReportStyle(nextReportStyle));
        setOnlineResultWatermarkDataUrl(nextWatermarkDataUrl);
        setOnlineResultWatermarkText(nextWatermarkText);
        setSavedSnapshot({
          branding: nextBranding,
          reportStyle: cloneReportStyle(nextReportStyle),
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
      JSON.stringify(savedSnapshot.reportStyle) !== JSON.stringify(reportStyle) ||
      savedSnapshot.onlineResultWatermarkDataUrl !== onlineResultWatermarkDataUrl ||
      savedSnapshot.onlineResultWatermarkText !== onlineResultWatermarkText
    );
  }, [branding, reportStyle, onlineResultWatermarkDataUrl, onlineResultWatermarkText, savedSnapshot]);

  const setImage = (key: BrandingKey, value: string | null) => {
    setBranding((prev) => ({ ...prev, [key]: value }));
  };

  const updatePatientStyle = <K extends keyof ReportStyleDto['patientInfo']>(
    key: K,
    value: ReportStyleDto['patientInfo'][K],
  ) => {
    setReportStyle((prev) => ({
      ...prev,
      patientInfo: {
        ...prev.patientInfo,
        [key]: value,
      },
    }));
  };

  const updateResultsStyle = <K extends keyof ReportStyleDto['resultsTable']>(
    key: K,
    value: ReportStyleDto['resultsTable'][K],
  ) => {
    setReportStyle((prev) => ({
      ...prev,
      resultsTable: {
        ...prev.resultsTable,
        [key]: value,
      },
    }));
  };

  const handleFileSelect = async (key: BrandingKey, maxBytes: number, event: ChangeEvent<HTMLInputElement>) => {
    if (!canMutate) {
      message.warning('You do not have permission to upload report design.');
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
          message.error(
            `${setting.title} resolution is too low (${width} x ${height}). Use at least ${MIN_REPORT_BANNER_WIDTH} x ${MIN_REPORT_BANNER_HEIGHT} for sharp PDF/print output.`,
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

  const handleOnlineWatermarkFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!canMutate) {
      message.warning('You do not have permission to upload watermark images.');
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
    if (!selectedLabId) return;
    if (!canMutate) {
      message.warning('You do not have permission to save report design.');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateAdminLabSettings(selectedLabId, {
        reportBranding: branding,
        reportStyle,
        onlineResultWatermarkDataUrl,
        onlineResultWatermarkText: onlineResultWatermarkText.trim() || null,
      });
      const nextBranding = updated.reportBranding || emptyBranding();
      const nextReportStyle = updated.reportStyle || defaultReportStyle();
      const nextWatermarkDataUrl = updated.onlineResultWatermarkDataUrl || null;
      const nextWatermarkText = updated.onlineResultWatermarkText || '';
      setBranding(nextBranding);
      setReportStyle(cloneReportStyle(nextReportStyle));
      setOnlineResultWatermarkDataUrl(nextWatermarkDataUrl);
      setOnlineResultWatermarkText(nextWatermarkText);
      setSavedSnapshot({
        branding: nextBranding,
        reportStyle: cloneReportStyle(nextReportStyle),
        onlineResultWatermarkDataUrl: nextWatermarkDataUrl,
        onlineResultWatermarkText: nextWatermarkText,
      });
      try {
        window.localStorage.setItem(
          REPORT_DESIGN_VERSION_STORAGE_KEY,
          `${selectedLabId}:${Date.now()}`,
        );
      } catch {
        // Ignore local storage errors.
      }
      message.success('Report design settings saved');
    } catch (error) {
      message.error(getErrorMessage(error) || 'Failed to save report design settings');
    } finally {
      setSaving(false);
    }
  };

  const previewHeaderCellStyle = {
    border: `1px solid ${reportStyle.resultsTable.borderColor}`,
    padding: '6px 8px',
    background: reportStyle.resultsTable.headerBackgroundColor,
    color: reportStyle.resultsTable.headerTextColor,
    fontSize: reportStyle.resultsTable.headerFontSizePx,
    fontWeight: 700,
    textAlign: reportStyle.resultsTable.headerTextAlign,
  };
  const previewBodyCellStyle = {
    border: `1px solid ${reportStyle.resultsTable.borderColor}`,
    padding: '6px 8px',
    color: reportStyle.resultsTable.bodyTextColor,
    fontSize: reportStyle.resultsTable.bodyFontSizePx,
    textAlign: reportStyle.resultsTable.cellTextAlign,
  };
  const stripedRowBg = reportStyle.resultsTable.rowStripeEnabled
    ? reportStyle.resultsTable.rowStripeColor
    : 'transparent';

  return (
    <div>
      <Title level={4} style={{ marginTop: 0 }}>
        Report Design
      </Title>
      <Text type="secondary">Manage report branding and style per lab from admin panel.</Text>

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
                ? `Use PNG for transparent logo/watermark. For sharp PDF/print, use banner/footer at least ${MIN_REPORT_BANNER_WIDTH} x ${MIN_REPORT_BANNER_HEIGHT}.`
                : 'Read-only mode: you can view design but cannot change it.'
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
                key: 'report-style',
                label: 'Report Style',
                children: (
                  <Row gutter={[16, 16]}>
                    <Col xs={24} xl={14}>
                      <Card title="Style Controls" loading={loading}>
                        <Row gutter={[16, 16]}>
                          <Col xs={24}>
                            <Card size="small" title="Patient Information">
                              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                                <StyleColorControl
                                  label="Background"
                                  value={reportStyle.patientInfo.backgroundColor}
                                  disabled={!canMutate}
                                  onChange={(value) => updatePatientStyle('backgroundColor', value)}
                                />
                                <StyleColorControl
                                  label="Border"
                                  value={reportStyle.patientInfo.borderColor}
                                  disabled={!canMutate}
                                  onChange={(value) => updatePatientStyle('borderColor', value)}
                                />
                                <StyleColorControl
                                  label="Text"
                                  value={reportStyle.patientInfo.textColor}
                                  disabled={!canMutate}
                                  onChange={(value) => updatePatientStyle('textColor', value)}
                                />
                                <StyleColorControl
                                  label="Label Text"
                                  value={reportStyle.patientInfo.labelColor}
                                  disabled={!canMutate}
                                  onChange={(value) => updatePatientStyle('labelColor', value)}
                                />
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>Font Size</Text>
                                  <InputNumber
                                    min={10}
                                    max={18}
                                    value={reportStyle.patientInfo.fontSizePx}
                                    onChange={(value) => updatePatientStyle('fontSizePx', Number(value ?? 13))}
                                    disabled={!canMutate}
                                  />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>Label Weight</Text>
                                  <Select
                                    style={{ width: 120 }}
                                    value={reportStyle.patientInfo.labelFontWeight}
                                    options={LABEL_WEIGHT_OPTIONS}
                                    onChange={(value) => updatePatientStyle('labelFontWeight', value)}
                                    disabled={!canMutate}
                                  />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>Value Weight</Text>
                                  <Select
                                    style={{ width: 120 }}
                                    value={reportStyle.patientInfo.valueFontWeight}
                                    options={VALUE_WEIGHT_OPTIONS}
                                    onChange={(value) => updatePatientStyle('valueFontWeight', value)}
                                    disabled={!canMutate}
                                  />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>Alignment</Text>
                                  <Select
                                    style={{ width: 120 }}
                                    value={reportStyle.patientInfo.textAlign}
                                    options={ALIGN_OPTIONS as unknown as { label: string; value: string }[]}
                                    onChange={(value) => updatePatientStyle('textAlign', value)}
                                    disabled={!canMutate}
                                  />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>Border Radius</Text>
                                  <InputNumber
                                    min={0}
                                    max={12}
                                    value={reportStyle.patientInfo.borderRadiusPx}
                                    onChange={(value) => updatePatientStyle('borderRadiusPx', Number(value ?? 6))}
                                    disabled={!canMutate}
                                  />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>Padding Y</Text>
                                  <InputNumber
                                    min={6}
                                    max={18}
                                    value={reportStyle.patientInfo.paddingYpx}
                                    onChange={(value) => updatePatientStyle('paddingYpx', Number(value ?? 10))}
                                    disabled={!canMutate}
                                  />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>Padding X</Text>
                                  <InputNumber
                                    min={8}
                                    max={24}
                                    value={reportStyle.patientInfo.paddingXpx}
                                    onChange={(value) => updatePatientStyle('paddingXpx', Number(value ?? 12))}
                                    disabled={!canMutate}
                                  />
                                </div>
                              </Space>
                            </Card>
                          </Col>

                          <Col xs={24}>
                            <Card size="small" title="Results Table">
                              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                                <StyleColorControl
                                  label="Header Background"
                                  value={reportStyle.resultsTable.headerBackgroundColor}
                                  disabled={!canMutate}
                                  onChange={(value) => updateResultsStyle('headerBackgroundColor', value)}
                                />
                                <StyleColorControl
                                  label="Header Text"
                                  value={reportStyle.resultsTable.headerTextColor}
                                  disabled={!canMutate}
                                  onChange={(value) => updateResultsStyle('headerTextColor', value)}
                                />
                                <StyleColorControl
                                  label="Body Text"
                                  value={reportStyle.resultsTable.bodyTextColor}
                                  disabled={!canMutate}
                                  onChange={(value) => updateResultsStyle('bodyTextColor', value)}
                                />
                                <StyleColorControl
                                  label="Border"
                                  value={reportStyle.resultsTable.borderColor}
                                  disabled={!canMutate}
                                  onChange={(value) => updateResultsStyle('borderColor', value)}
                                />
                                <StyleColorControl
                                  label="Stripe Color"
                                  value={reportStyle.resultsTable.rowStripeColor}
                                  disabled={!canMutate}
                                  onChange={(value) => updateResultsStyle('rowStripeColor', value)}
                                />
                                <StyleColorControl
                                  label="Abnormal Row"
                                  value={reportStyle.resultsTable.abnormalRowBackgroundColor}
                                  disabled={!canMutate}
                                  onChange={(value) => updateResultsStyle('abnormalRowBackgroundColor', value)}
                                />
                                <StyleColorControl
                                  label="Reference Value"
                                  value={reportStyle.resultsTable.referenceValueColor}
                                  disabled={!canMutate}
                                  onChange={(value) => updateResultsStyle('referenceValueColor', value)}
                                />
                                <StyleColorControl
                                  label="Department Row Bg"
                                  value={reportStyle.resultsTable.departmentRowBackgroundColor}
                                  disabled={!canMutate}
                                  onChange={(value) => updateResultsStyle('departmentRowBackgroundColor', value)}
                                />
                                <StyleColorControl
                                  label="Department Row Text"
                                  value={reportStyle.resultsTable.departmentRowTextColor}
                                  disabled={!canMutate}
                                  onChange={(value) => updateResultsStyle('departmentRowTextColor', value)}
                                />
                                <StyleColorControl
                                  label="Category Row Bg"
                                  value={reportStyle.resultsTable.categoryRowBackgroundColor}
                                  disabled={!canMutate}
                                  onChange={(value) => updateResultsStyle('categoryRowBackgroundColor', value)}
                                />
                                <StyleColorControl
                                  label="Category Row Text"
                                  value={reportStyle.resultsTable.categoryRowTextColor}
                                  disabled={!canMutate}
                                  onChange={(value) => updateResultsStyle('categoryRowTextColor', value)}
                                />
                                <StyleColorControl
                                  label="Status Normal"
                                  value={reportStyle.resultsTable.statusNormalColor}
                                  disabled={!canMutate}
                                  onChange={(value) => updateResultsStyle('statusNormalColor', value)}
                                />
                                <StyleColorControl
                                  label="Status High"
                                  value={reportStyle.resultsTable.statusHighColor}
                                  disabled={!canMutate}
                                  onChange={(value) => updateResultsStyle('statusHighColor', value)}
                                />
                                <StyleColorControl
                                  label="Status Low"
                                  value={reportStyle.resultsTable.statusLowColor}
                                  disabled={!canMutate}
                                  onChange={(value) => updateResultsStyle('statusLowColor', value)}
                                />
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>Header Font Size</Text>
                                  <InputNumber
                                    min={10}
                                    max={16}
                                    value={reportStyle.resultsTable.headerFontSizePx}
                                    onChange={(value) => updateResultsStyle('headerFontSizePx', Number(value ?? 12))}
                                    disabled={!canMutate}
                                  />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>Body Font Size</Text>
                                  <InputNumber
                                    min={9}
                                    max={14}
                                    value={reportStyle.resultsTable.bodyFontSizePx}
                                    onChange={(value) => updateResultsStyle('bodyFontSizePx', Number(value ?? 12))}
                                    disabled={!canMutate}
                                  />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>Department Font Size</Text>
                                  <InputNumber
                                    min={10}
                                    max={16}
                                    value={reportStyle.resultsTable.departmentRowFontSizePx}
                                    onChange={(value) => updateResultsStyle('departmentRowFontSizePx', Number(value ?? 12))}
                                    disabled={!canMutate}
                                  />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>Category Font Size</Text>
                                  <InputNumber
                                    min={10}
                                    max={16}
                                    value={reportStyle.resultsTable.categoryRowFontSizePx}
                                    onChange={(value) => updateResultsStyle('categoryRowFontSizePx', Number(value ?? 12))}
                                    disabled={!canMutate}
                                  />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>Header Align</Text>
                                  <Select
                                    style={{ width: 120 }}
                                    value={reportStyle.resultsTable.headerTextAlign}
                                    options={ALIGN_OPTIONS as unknown as { label: string; value: string }[]}
                                    onChange={(value) => updateResultsStyle('headerTextAlign', value)}
                                    disabled={!canMutate}
                                  />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>Cell Align</Text>
                                  <Select
                                    style={{ width: 120 }}
                                    value={reportStyle.resultsTable.cellTextAlign}
                                    options={ALIGN_OPTIONS as unknown as { label: string; value: string }[]}
                                    onChange={(value) => updateResultsStyle('cellTextAlign', value)}
                                    disabled={!canMutate}
                                  />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>Department Align</Text>
                                  <Select
                                    style={{ width: 120 }}
                                    value={reportStyle.resultsTable.departmentRowTextAlign}
                                    options={ALIGN_OPTIONS as unknown as { label: string; value: string }[]}
                                    onChange={(value) => updateResultsStyle('departmentRowTextAlign', value)}
                                    disabled={!canMutate}
                                  />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>Category Align</Text>
                                  <Select
                                    style={{ width: 120 }}
                                    value={reportStyle.resultsTable.categoryRowTextAlign}
                                    options={ALIGN_OPTIONS as unknown as { label: string; value: string }[]}
                                    onChange={(value) => updateResultsStyle('categoryRowTextAlign', value)}
                                    disabled={!canMutate}
                                  />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>Enable Row Stripe</Text>
                                  <Switch
                                    checked={reportStyle.resultsTable.rowStripeEnabled}
                                    onChange={(value) => updateResultsStyle('rowStripeEnabled', value)}
                                    disabled={!canMutate}
                                  />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>Single Dept Break</Text>
                                  <Select
                                    style={{ width: 140 }}
                                    value={reportStyle.resultsTable.regularDepartmentBlockBreak}
                                    options={BREAK_OPTIONS as unknown as { label: string; value: string }[]}
                                    onChange={(value) => updateResultsStyle('regularDepartmentBlockBreak', value)}
                                    disabled={!canMutate}
                                  />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>Single Row Break</Text>
                                  <Select
                                    style={{ width: 140 }}
                                    value={reportStyle.resultsTable.regularRowBreak}
                                    options={BREAK_OPTIONS as unknown as { label: string; value: string }[]}
                                    onChange={(value) => updateResultsStyle('regularRowBreak', value)}
                                    disabled={!canMutate}
                                  />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>Panel Table Break</Text>
                                  <Select
                                    style={{ width: 140 }}
                                    value={reportStyle.resultsTable.panelTableBreak}
                                    options={BREAK_OPTIONS as unknown as { label: string; value: string }[]}
                                    onChange={(value) => updateResultsStyle('panelTableBreak', value)}
                                    disabled={!canMutate}
                                  />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>Panel Row Break</Text>
                                  <Select
                                    style={{ width: 140 }}
                                    value={reportStyle.resultsTable.panelRowBreak}
                                    options={BREAK_OPTIONS as unknown as { label: string; value: string }[]}
                                    onChange={(value) => updateResultsStyle('panelRowBreak', value)}
                                    disabled={!canMutate}
                                  />
                                </div>
                              </Space>
                            </Card>
                          </Col>
                        </Row>
                      </Card>
                    </Col>
                    <Col xs={24} xl={10}>
                      <div style={{ position: 'sticky', top: 16 }}>
                      <Card title="Live Preview" loading={loading}>
                        <div
                          style={{
                            border: `1px solid ${reportStyle.patientInfo.borderColor}`,
                            borderRadius: reportStyle.patientInfo.borderRadiusPx,
                            background: reportStyle.patientInfo.backgroundColor,
                            color: reportStyle.patientInfo.textColor,
                            fontSize: reportStyle.patientInfo.fontSizePx,
                            textAlign: reportStyle.patientInfo.textAlign,
                            padding: `${reportStyle.patientInfo.paddingYpx}px ${reportStyle.patientInfo.paddingXpx}px`,
                            marginBottom: 12,
                          }}
                        >
                          <div style={{ marginBottom: 6 }}>
                            <span
                              style={{
                                color: reportStyle.patientInfo.labelColor,
                                fontWeight: reportStyle.patientInfo.labelFontWeight,
                                marginRight: 4,
                              }}
                            >
                              Name:
                            </span>
                            <span style={{ fontWeight: reportStyle.patientInfo.valueFontWeight }}>Sample Patient</span>
                          </div>
                          <div style={{ marginBottom: 6 }}>
                            <span
                              style={{
                                color: reportStyle.patientInfo.labelColor,
                                fontWeight: reportStyle.patientInfo.labelFontWeight,
                                marginRight: 4,
                              }}
                            >
                              Age/Sex:
                            </span>
                            <span style={{ fontWeight: reportStyle.patientInfo.valueFontWeight }}>36 Years/Male</span>
                          </div>
                          <div>
                            <span
                              style={{
                                color: reportStyle.patientInfo.labelColor,
                                fontWeight: reportStyle.patientInfo.labelFontWeight,
                                marginRight: 4,
                              }}
                            >
                              Order No:
                            </span>
                            <span style={{ fontWeight: reportStyle.patientInfo.valueFontWeight }}>260304011</span>
                          </div>
                        </div>

                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr>
                                <th style={previewHeaderCellStyle}>Test</th>
                                <th style={previewHeaderCellStyle}>Result</th>
                                <th style={previewHeaderCellStyle}>Unit</th>
                                <th style={previewHeaderCellStyle}>Status</th>
                                <th style={previewHeaderCellStyle}>Reference Value</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td
                                  colSpan={5}
                                  style={{
                                    ...previewBodyCellStyle,
                                    background: reportStyle.resultsTable.departmentRowBackgroundColor,
                                    color: reportStyle.resultsTable.departmentRowTextColor,
                                    textAlign: reportStyle.resultsTable.departmentRowTextAlign,
                                    fontSize: reportStyle.resultsTable.departmentRowFontSizePx,
                                    fontWeight: 800,
                                  }}
                                >
                                  Chemistry
                                </td>
                              </tr>
                              <tr>
                                <td
                                  colSpan={5}
                                  style={{
                                    ...previewBodyCellStyle,
                                    background: reportStyle.resultsTable.categoryRowBackgroundColor,
                                    color: reportStyle.resultsTable.categoryRowTextColor,
                                    textAlign: reportStyle.resultsTable.categoryRowTextAlign,
                                    fontSize: reportStyle.resultsTable.categoryRowFontSizePx,
                                    fontWeight: 700,
                                  }}
                                >
                                  Routine
                                </td>
                              </tr>
                              <tr>
                                <td style={{ ...previewBodyCellStyle, background: stripedRowBg }}>Glucose</td>
                                <td style={{ ...previewBodyCellStyle, background: stripedRowBg }}>110</td>
                                <td style={{ ...previewBodyCellStyle, background: stripedRowBg }}>mg/dL</td>
                                <td
                                  style={{
                                    ...previewBodyCellStyle,
                                    background: stripedRowBg,
                                    color: reportStyle.resultsTable.statusNormalColor,
                                    fontWeight: 700,
                                  }}
                                >
                                  Normal
                                </td>
                                <td
                                  style={{
                                    ...previewBodyCellStyle,
                                    background: stripedRowBg,
                                    color: reportStyle.resultsTable.referenceValueColor,
                                  }}
                                >
                                  70-110
                                </td>
                              </tr>
                              <tr>
                                <td
                                  style={{
                                    ...previewBodyCellStyle,
                                    background: reportStyle.resultsTable.abnormalRowBackgroundColor,
                                  }}
                                >
                                  ALT
                                </td>
                                <td
                                  style={{
                                    ...previewBodyCellStyle,
                                    background: reportStyle.resultsTable.abnormalRowBackgroundColor,
                                  }}
                                >
                                  82
                                </td>
                                <td
                                  style={{
                                    ...previewBodyCellStyle,
                                    background: reportStyle.resultsTable.abnormalRowBackgroundColor,
                                  }}
                                >
                                  U/L
                                </td>
                                <td
                                  style={{
                                    ...previewBodyCellStyle,
                                    background: reportStyle.resultsTable.abnormalRowBackgroundColor,
                                    color: reportStyle.resultsTable.statusHighColor,
                                    fontWeight: 700,
                                  }}
                                >
                                  High
                                </td>
                                <td
                                  style={{
                                    ...previewBodyCellStyle,
                                    background: reportStyle.resultsTable.abnormalRowBackgroundColor,
                                    color: reportStyle.resultsTable.referenceValueColor,
                                  }}
                                >
                                  0-40
                                </td>
                              </tr>
                              <tr>
                                <td style={previewBodyCellStyle}>HDL</td>
                                <td style={previewBodyCellStyle}>35</td>
                                <td style={previewBodyCellStyle}>mg/dL</td>
                                <td
                                  style={{
                                    ...previewBodyCellStyle,
                                    color: reportStyle.resultsTable.statusLowColor,
                                    fontWeight: 700,
                                  }}
                                >
                                  Low
                                </td>
                                <td style={{ ...previewBodyCellStyle, color: reportStyle.resultsTable.referenceValueColor }}>
                                  &gt; 40
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </Card>
                      </div>
                    </Col>
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
                onClick={() => setReportStyle(defaultReportStyle())}
                disabled={!canMutate}
              >
                Reset style to default
              </Button>
              <Button
                onClick={() => {
                  if (!savedSnapshot) return;
                  setBranding(savedSnapshot.branding);
                  setReportStyle(cloneReportStyle(savedSnapshot.reportStyle));
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
