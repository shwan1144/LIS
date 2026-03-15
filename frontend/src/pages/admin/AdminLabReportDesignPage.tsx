import { type CSSProperties, type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  ColorPicker,
  Empty,
  FloatButton,
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
import { EyeOutlined } from '@ant-design/icons';
import {
  getAdminOrders,
  getAdminLabReportDesign,
  previewAdminLabReportPdf,
  updateAdminLabSettings,
  type AdminOrderListItem,
  type ReportColumnStyleDto,
  type ReportFontFamilyDto,
  type ReportStyleDto,
  type ReportBrandingDto,
} from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminLabSelection } from './useAdminLabSelection';
import './AdminLabReportDesignPage.css';

const { Title, Text } = Typography;
const MAX_BANNER_FOOTER_BYTES = Math.floor(2.75 * 1024 * 1024);
const MIN_REPORT_BANNER_WIDTH = 2400;
const MIN_REPORT_BANNER_HEIGHT = 600;
const MIN_REPORT_FOOTER_WIDTH = 2400;
const MIN_REPORT_FOOTER_HEIGHT = 220;
const REPORT_BANNER_RECOMMENDED_SIZE_MM = '198 x 50 mm / 2400 x 600 px';
const REPORT_FOOTER_RECOMMENDED_SIZE_MM = '198 x 18 mm / 2400 x 220 px';

type BrandingKey = keyof ReportBrandingDto;

type ImageSettingMeta = {
  key: BrandingKey;
  title: string;
  recommendedSize: string;
  note: string;
  maxBytes: number;
  minWidth?: number;
  minHeight?: number;
};

const IMAGE_SETTINGS: ImageSettingMeta[] = [
  {
    key: 'bannerDataUrl',
    title: 'Report Banner',
    recommendedSize: REPORT_BANNER_RECOMMENDED_SIZE_MM,
    note: 'Wide image for the top of every report page (A4 printable width).',
    maxBytes: MAX_BANNER_FOOTER_BYTES,
    minWidth: MIN_REPORT_BANNER_WIDTH,
    minHeight: MIN_REPORT_BANNER_HEIGHT,
  },
  {
    key: 'footerDataUrl',
    title: 'Report Footer',
    recommendedSize: REPORT_FOOTER_RECOMMENDED_SIZE_MM,
    note: 'Wide image for the bottom of every report page (A4 printable width).',
    maxBytes: MAX_BANNER_FOOTER_BYTES,
    minWidth: MIN_REPORT_FOOTER_WIDTH,
    minHeight: MIN_REPORT_FOOTER_HEIGHT,
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
const FONT_OPTIONS: Array<{ label: string; value: ReportFontFamilyDto }> = [
  { label: 'System Sans', value: 'system-sans' },
  { label: 'Arial', value: 'arial' },
  { label: 'Tahoma', value: 'tahoma' },
  { label: 'Verdana', value: 'verdana' },
  { label: 'Georgia', value: 'georgia' },
  { label: 'Times New Roman', value: 'times-new-roman' },
  { label: 'Courier New', value: 'courier-new' },
];

const REPORT_FONT_STACKS: Record<ReportFontFamilyDto, string> = {
  'system-sans': "'Segoe UI', Tahoma, Arial, sans-serif",
  arial: "Arial, 'Helvetica Neue', Helvetica, sans-serif",
  tahoma: "Tahoma, 'Segoe UI', Arial, sans-serif",
  verdana: "Verdana, 'Segoe UI', Arial, sans-serif",
  georgia: "Georgia, 'Times New Roman', serif",
  'times-new-roman': "'Times New Roman', Times, serif",
  'courier-new': "'Courier New', Courier, monospace",
};

const REPORT_ARABIC_FALLBACK_STACK = "'Noto Naskh Arabic', 'Noto Sans Arabic'";

type ResultsColumnKey =
  | 'testColumn'
  | 'resultColumn'
  | 'unitColumn'
  | 'statusColumn'
  | 'referenceColumn';

const RESULTS_COLUMN_CONTROLS: Array<{
  key: ResultsColumnKey;
  label: string;
}> = [
  { key: 'testColumn', label: 'Test Column' },
  { key: 'resultColumn', label: 'Result Column' },
  { key: 'unitColumn', label: 'Unit Column' },
  { key: 'statusColumn', label: 'Status Column' },
  { key: 'referenceColumn', label: 'Reference Column' },
];

function resolvePreviewFontStack(fontFamily: ReportFontFamilyDto): string {
  return `${REPORT_FONT_STACKS[fontFamily]}, ${REPORT_ARABIC_FALLBACK_STACK}`;
}

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

function defaultReportStyle(): ReportStyleDto {
  return {
    version: 1,
    patientInfo: {
      backgroundColor: '#FAFAFA',
      borderColor: '#CCCCCC',
      textColor: '#333333',
      labelColor: '#333333',
      fontSizePx: 13,
      fontFamily: 'system-sans',
      labelFontWeight: 700,
      valueFontWeight: 400,
      textAlign: 'left',
      labelTextAlign: 'left',
      valueTextAlign: 'left',
      borderRadiusPx: 6,
      paddingYpx: 10,
      paddingXpx: 12,
    },
    reportTitle: {
      text: 'Laboratory Report',
      textColor: '#111111',
      fontSizePx: 20,
      textAlign: 'center',
      bold: true,
    },
    resultsTable: {
      headerBackgroundColor: '#F2F2F2',
      headerTextColor: '#333333',
      headerFontSizePx: 12,
      headerTextAlign: 'left',
      bodyTextColor: '#333333',
      bodyFontSizePx: 12,
      fontFamily: 'system-sans',
      cellTextAlign: 'left',
      borderColor: '#EEEEEE',
      rowStripeEnabled: false,
      rowStripeColor: '#F9FBFF',
      abnormalRowBackgroundColor: '#FFF5F5',
      referenceValueColor: '#333333',
      showStatusColumn: true,
      showDepartmentRow: true,
      departmentRowBackgroundColor: '#222222',
      departmentRowTextColor: '#FFFFFF',
      departmentRowFontSizePx: 12,
      departmentRowTextAlign: 'left',
      showCategoryRow: true,
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
      testColumn: {
        textColor: '#333333',
        fontSizePx: 12,
        textAlign: 'left',
        bold: false,
      },
      resultColumn: {
        textColor: '#333333',
        fontSizePx: 12,
        textAlign: 'left',
        bold: false,
      },
      unitColumn: {
        textColor: '#333333',
        fontSizePx: 12,
        textAlign: 'left',
        bold: false,
      },
      statusColumn: {
        textColor: '#333333',
        fontSizePx: 12,
        textAlign: 'left',
        bold: false,
      },
      referenceColumn: {
        textColor: '#333333',
        fontSizePx: 12,
        textAlign: 'left',
        bold: false,
      },
    },
    pageLayout: {
      pageMarginTopMm: 3,
      pageMarginRightMm: 3,
      pageMarginBottomMm: 3,
      pageMarginLeftMm: 3,
      contentMarginXMm: 3,
    },
    cultureSection: {
      fontFamily: 'system-sans',
      sectionTitleColor: '#111111',
      sectionTitleBorderColor: '#222222',
      sectionTitleAlign: 'left',
      noGrowthBackgroundColor: '#F7FEF9',
      noGrowthBorderColor: '#BBF7D0',
      noGrowthTextColor: '#166534',
      metaTextColor: '#334155',
      metaTextAlign: 'left',
      commentTextColor: '#4B5563',
      commentTextAlign: 'left',
      notesTextColor: '#111827',
      notesBorderColor: '#D1D5DB',
      notesTextAlign: 'left',
      astGridGapPx: 6,
      astMinHeightPx: 430,
      astColumnBorderRadiusPx: 6,
      astColumnPaddingPx: 7,
      astColumnTitleColor: '#111827',
      astColumnTitleBorderColor: '#E5E7EB',
      astBodyTextColor: '#111827',
      astEmptyTextColor: '#64748B',
      astSensitiveBorderColor: '#BBF7D0',
      astSensitiveBackgroundColor: '#F8FFFB',
      astIntermediateBorderColor: '#FDE68A',
      astIntermediateBackgroundColor: '#FFFDF5',
      astResistanceBorderColor: '#FECACA',
      astResistanceBackgroundColor: '#FFF8F8',
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

function formatOrderPreviewLabel(order: AdminOrderListItem): string {
  const orderNo = order.orderNumber || order.id.slice(0, 8);
  const patientName = order.patientName || 'Unknown patient';
  const when = new Date(order.registeredAt).toLocaleString();
  return `${orderNo} - ${patientName} - ${when}`;
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

function ColumnStyleControlCard(props: {
  title: string;
  style: ReportColumnStyleDto;
  disabled: boolean;
  onChange: <K extends keyof ReportColumnStyleDto>(key: K, value: ReportColumnStyleDto[K]) => void;
}) {
  return (
    <Card size="small" title={props.title}>
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        <StyleColorControl
          label="Text Color"
          value={props.style.textColor}
          disabled={props.disabled}
          onChange={(value) => props.onChange('textColor', value)}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text>Font Size</Text>
          <InputNumber
            min={9}
            max={16}
            value={props.style.fontSizePx}
            onChange={(value) => props.onChange('fontSizePx', Number(value ?? 12))}
            disabled={props.disabled}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text>Alignment</Text>
          <Select
            style={{ width: 120 }}
            value={props.style.textAlign}
            options={ALIGN_OPTIONS as unknown as { label: string; value: string }[]}
            onChange={(value) => props.onChange('textAlign', value)}
            disabled={props.disabled}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text>Bold</Text>
          <Switch
            checked={props.style.bold}
            onChange={(value) => props.onChange('bold', value)}
            disabled={props.disabled}
          />
        </div>
      </Space>
    </Card>
  );
}

export function AdminLabReportDesignPage() {
  const { user } = useAuth();
  const canMutate = user?.role === 'SUPER_ADMIN';
  const { labs, selectedLab, selectedLabId, loadingLabs, selectLab } = useAdminLabSelection();
  const fileInputRefs = useRef<Partial<Record<BrandingKey, HTMLInputElement | null>>>({});
  const onlineWatermarkInputRef = useRef<HTMLInputElement | null>(null);
  const previewCardRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<BrandingKey | null>(null);
  const [uploadingOnlineWatermark, setUploadingOnlineWatermark] = useState(false);
  const [branding, setBranding] = useState<ReportBrandingDto>(emptyBranding);
  const [reportStyle, setReportStyle] = useState<ReportStyleDto>(defaultReportStyle);
  const [onlineResultWatermarkDataUrl, setOnlineResultWatermarkDataUrl] = useState<string | null>(null);
  const [onlineResultWatermarkText, setOnlineResultWatermarkText] = useState('');
  const [activeTabKey, setActiveTabKey] = useState('pdf-design');
  const [savedSnapshot, setSavedSnapshot] = useState<{
    branding: ReportBrandingDto;
    reportStyle: ReportStyleDto;
    onlineResultWatermarkDataUrl: string | null;
    onlineResultWatermarkText: string;
    reportDesignFingerprint: string;
  } | null>(null);
  const [previewOrderQuery, setPreviewOrderQuery] = useState('');
  const [previewOrderOptions, setPreviewOrderOptions] = useState<AdminOrderListItem[]>([]);
  const [selectedPreviewOrderId, setSelectedPreviewOrderId] = useState<string | null>(null);
  const [loadingPreviewOrders, setLoadingPreviewOrders] = useState(false);
  const [refreshingFullPreview, setRefreshingFullPreview] = useState(false);
  const [cultureOnlyPreview, setCultureOnlyPreview] = useState(false);
  const [fullPreviewPdfUrl, setFullPreviewPdfUrl] = useState<string | null>(null);
  const [fullPreviewError, setFullPreviewError] = useState<string | null>(null);
  const orderSearchTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!selectedLabId) return;
    const load = async () => {
      setLoading(true);
      try {
        const data = await getAdminLabReportDesign(selectedLabId);
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
          reportDesignFingerprint: data.reportDesignFingerprint,
        });
      } catch (error) {
        message.error(getErrorMessage(error) || 'Failed to load report design settings');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [selectedLabId]);

  useEffect(() => {
    if (!selectedLabId || activeTabKey !== 'report-style') {
      setPreviewOrderOptions([]);
      return;
    }

    if (orderSearchTimerRef.current) {
      window.clearTimeout(orderSearchTimerRef.current);
      orderSearchTimerRef.current = null;
    }

    let cancelled = false;
    const timerId = window.setTimeout(() => {
      void (async () => {
        setLoadingPreviewOrders(true);
        try {
          const result = await getAdminOrders({
            labId: selectedLabId,
            q: previewOrderQuery.trim() || undefined,
            page: 1,
            size: 20,
          });
          if (cancelled) return;
          setPreviewOrderOptions(result.items);
        } catch {
          if (cancelled) return;
          setPreviewOrderOptions([]);
          message.error('Failed to load orders for full preview');
        } finally {
          if (!cancelled) {
            setLoadingPreviewOrders(false);
          }
        }
      })();
    }, 250);

    orderSearchTimerRef.current = timerId;
    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
      if (orderSearchTimerRef.current === timerId) {
        orderSearchTimerRef.current = null;
      }
    };
  }, [activeTabKey, previewOrderQuery, selectedLabId]);

  useEffect(() => {
    setPreviewOrderQuery('');
    setPreviewOrderOptions([]);
    setSelectedPreviewOrderId(null);
    setCultureOnlyPreview(false);
    setFullPreviewError(null);
    setRefreshingFullPreview(false);
    setFullPreviewPdfUrl((previousUrl) => {
      if (previousUrl) {
        URL.revokeObjectURL(previousUrl);
      }
      return null;
    });
  }, [selectedLabId]);

  useEffect(() => () => {
    if (orderSearchTimerRef.current) {
      window.clearTimeout(orderSearchTimerRef.current);
      orderSearchTimerRef.current = null;
    }
    if (fullPreviewPdfUrl) {
      URL.revokeObjectURL(fullPreviewPdfUrl);
    }
  }, [fullPreviewPdfUrl]);

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

  const updateReportTitleStyle = <K extends keyof ReportStyleDto['reportTitle']>(
    key: K,
    value: ReportStyleDto['reportTitle'][K],
  ) => {
    setReportStyle((prev) => ({
      ...prev,
      reportTitle: {
        ...prev.reportTitle,
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

  const updateResultsColumnStyle = <K extends keyof ReportColumnStyleDto>(
    columnKey: ResultsColumnKey,
    key: K,
    value: ReportColumnStyleDto[K],
  ) => {
    setReportStyle((prev) => ({
      ...prev,
      resultsTable: {
        ...prev.resultsTable,
        [columnKey]: {
          ...prev.resultsTable[columnKey],
          [key]: value,
        },
      },
    }));
  };

  const updatePageLayoutStyle = <K extends keyof ReportStyleDto['pageLayout']>(
    key: K,
    value: ReportStyleDto['pageLayout'][K],
  ) => {
    setReportStyle((prev) => ({
      ...prev,
      pageLayout: {
        ...prev.pageLayout,
        [key]: value,
      },
    }));
  };

  const updateCultureStyle = <K extends keyof ReportStyleDto['cultureSection']>(
    key: K,
    value: ReportStyleDto['cultureSection'][K],
  ) => {
    setReportStyle((prev) => ({
      ...prev,
      cultureSection: {
        ...prev.cultureSection,
        [key]: value,
      },
    }));
  };

  const handleRefreshFullPreview = async () => {
    if (!selectedLabId) return;
    if (!selectedPreviewOrderId) {
      setFullPreviewError('Select an order before refreshing full preview.');
      return;
    }

    setRefreshingFullPreview(true);
    setFullPreviewError(null);
    try {
      const blob = await previewAdminLabReportPdf(selectedLabId, {
        orderId: selectedPreviewOrderId,
        previewMode: cultureOnlyPreview ? 'culture_only' : 'full',
        reportBranding: {
          bannerDataUrl: branding.bannerDataUrl ?? null,
          footerDataUrl: branding.footerDataUrl ?? null,
          logoDataUrl: branding.logoDataUrl ?? null,
          watermarkDataUrl: branding.watermarkDataUrl ?? null,
        },
        reportStyle: cloneReportStyle(reportStyle),
      });

      const nextObjectUrl = URL.createObjectURL(blob);
      setFullPreviewPdfUrl((previousUrl) => {
        if (previousUrl) {
          URL.revokeObjectURL(previousUrl);
        }
        return nextObjectUrl;
      });
    } catch (error) {
      setFullPreviewError(
        getErrorMessage(error) || 'Failed to generate full report preview',
      );
    } finally {
      setRefreshingFullPreview(false);
    }
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
      if (setting.minWidth && setting.minHeight) {
        const { width, height } = await readImageDimensions(file);
        if (width < setting.minWidth || height < setting.minHeight) {
          message.error(
            `${setting.title} resolution is too low for print. Upload a higher-resolution image designed for ${setting.recommendedSize}.`,
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
      const expectedBranding = {
        bannerDataUrl: branding.bannerDataUrl ?? null,
        footerDataUrl: branding.footerDataUrl ?? null,
        logoDataUrl: branding.logoDataUrl ?? null,
        watermarkDataUrl: branding.watermarkDataUrl ?? null,
      };
      const expectedReportStyle = cloneReportStyle(reportStyle);
      const expectedWatermarkDataUrl = onlineResultWatermarkDataUrl ?? null;
      const expectedWatermarkText = onlineResultWatermarkText.trim();
      const previousBranding = savedSnapshot?.branding || emptyBranding();
      const brandingChanges = getChangedBrandingFields(previousBranding, expectedBranding);
      const hasBrandingChanges =
        !!brandingChanges;
      const hasReportStyleChanges =
        !savedSnapshot ||
        JSON.stringify(savedSnapshot.reportStyle) !== JSON.stringify(expectedReportStyle);
      const hasOnlineWatermarkDataUrlChanges =
        !savedSnapshot ||
        savedSnapshot.onlineResultWatermarkDataUrl !== expectedWatermarkDataUrl;
      const hasOnlineWatermarkTextChanges =
        !savedSnapshot ||
        savedSnapshot.onlineResultWatermarkText !== expectedWatermarkText;

      if (
        !hasBrandingChanges &&
        !hasReportStyleChanges &&
        !hasOnlineWatermarkDataUrlChanges &&
        !hasOnlineWatermarkTextChanges
      ) {
        message.info('No changes to save');
        setSaving(false);
        return;
      }

      const updated = await updateAdminLabSettings(selectedLabId, {
        reportBranding: brandingChanges,
        reportStyle: hasReportStyleChanges ? expectedReportStyle : undefined,
        onlineResultWatermarkDataUrl: hasOnlineWatermarkDataUrlChanges
          ? expectedWatermarkDataUrl
          : undefined,
        onlineResultWatermarkText: hasOnlineWatermarkTextChanges
          ? expectedWatermarkText || null
          : undefined,
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
        reportDesignFingerprint: updated.reportDesignFingerprint,
      });
      const mismatchFields: string[] = [];
      if (JSON.stringify(nextBranding) !== JSON.stringify(expectedBranding)) {
        mismatchFields.push('reportBranding');
      }
      if (JSON.stringify(nextReportStyle) !== JSON.stringify(expectedReportStyle)) {
        mismatchFields.push('reportStyle');
      }
      if (nextWatermarkDataUrl !== expectedWatermarkDataUrl) {
        mismatchFields.push('onlineResultWatermarkDataUrl');
      }
      if (nextWatermarkText !== expectedWatermarkText) {
        mismatchFields.push('onlineResultWatermarkText');
      }

      if (mismatchFields.length > 0) {
        message.error(
          `Server did not persist report design (${mismatchFields.join(', ')}); settings reloaded from server.`,
        );
      } else {
        const labLabel = selectedLab
          ? `${selectedLab.name} (${selectedLab.code})`
          : selectedLabId;
        message.success(`Report design saved for ${labLabel}`);
      }
    } catch (error) {
      message.error(getErrorMessage(error) || 'Failed to save report design settings');
    } finally {
      setSaving(false);
    }
  };

  const previewHeaderCellStyle: CSSProperties = {
    border: `1px solid ${reportStyle.resultsTable.borderColor}`,
    padding: '6px 8px',
    background: reportStyle.resultsTable.headerBackgroundColor,
    color: reportStyle.resultsTable.headerTextColor,
    fontSize: reportStyle.resultsTable.headerFontSizePx,
    fontWeight: 700,
    fontFamily: resolvePreviewFontStack(reportStyle.resultsTable.fontFamily),
    textAlign: reportStyle.resultsTable.headerTextAlign,
  };
  const previewBodyCellStyle: CSSProperties = {
    border: `1px solid ${reportStyle.resultsTable.borderColor}`,
    padding: '6px 8px',
    color: reportStyle.resultsTable.bodyTextColor,
    fontSize: reportStyle.resultsTable.bodyFontSizePx,
    fontFamily: resolvePreviewFontStack(reportStyle.resultsTable.fontFamily),
    textAlign: reportStyle.resultsTable.cellTextAlign,
  };
  const stripedRowBg = reportStyle.resultsTable.rowStripeEnabled
    ? reportStyle.resultsTable.rowStripeColor
    : 'transparent';
  const showStatusColumn = reportStyle.resultsTable.showStatusColumn;
  const showDepartmentRow = reportStyle.resultsTable.showDepartmentRow;
  const showCategoryRow = reportStyle.resultsTable.showCategoryRow;
  const culturePreviewFontFamily = resolvePreviewFontStack(reportStyle.cultureSection.fontFamily);
  const culturePreviewGridMinHeight = Math.min(reportStyle.cultureSection.astMinHeightPx, 320);
  const previewTitleStyle: CSSProperties = {
    color: reportStyle.reportTitle.textColor,
    fontSize: reportStyle.reportTitle.fontSizePx,
    fontWeight: reportStyle.reportTitle.bold ? 700 : 400,
    textAlign: reportStyle.reportTitle.textAlign,
    textDecoration: 'underline',
    fontFamily: resolvePreviewFontStack(reportStyle.resultsTable.fontFamily),
    margin: '0 0 12px',
  };
  const patientInfoPreviewRowStyle = {
    display: 'grid',
    gridTemplateColumns: 'minmax(92px, max-content) minmax(0, 1fr)',
    columnGap: 4,
    alignItems: 'baseline',
  } as const;
  const patientInfoPreviewLabelStyle = {
    color: reportStyle.patientInfo.labelColor,
    fontWeight: reportStyle.patientInfo.labelFontWeight,
    textAlign: reportStyle.patientInfo.labelTextAlign,
  } as const;
  const patientInfoPreviewValueStyle = {
    display: 'block',
    width: '100%',
    fontWeight: reportStyle.patientInfo.valueFontWeight,
    textAlign: reportStyle.patientInfo.valueTextAlign,
  } as const;
  const cultureMetaPreviewStyle = {
    fontFamily: culturePreviewFontFamily,
    color: reportStyle.cultureSection.metaTextColor,
    fontSize: 12,
    textAlign: reportStyle.cultureSection.metaTextAlign,
  } as const;
  const cultureCommentPreviewStyle = {
    fontFamily: culturePreviewFontFamily,
    color: reportStyle.cultureSection.commentTextColor,
    fontSize: 11,
    textAlign: reportStyle.cultureSection.commentTextAlign,
  } as const;
  const cultureNotesPreviewStyle = {
    marginTop: 8,
    borderTop: `1px dashed ${reportStyle.cultureSection.notesBorderColor}`,
    paddingTop: 6,
    color: reportStyle.cultureSection.notesTextColor,
    fontSize: 11,
    fontFamily: culturePreviewFontFamily,
    textAlign: reportStyle.cultureSection.notesTextAlign,
  } as const;
  const previewColumnCount = showStatusColumn ? 5 : 4;
  const previewRegularWidths = {
    test: '28%',
    result: showStatusColumn ? '14%' : '18%',
    unit: showStatusColumn ? '14%' : '18%',
    status: '14%',
    reference: showStatusColumn ? '30%' : '36%',
  } as const;
  const previewColumnStyles = {
    test: reportStyle.resultsTable.testColumn,
    result: reportStyle.resultsTable.resultColumn,
    unit: reportStyle.resultsTable.unitColumn,
    status: reportStyle.resultsTable.statusColumn,
    reference: reportStyle.resultsTable.referenceColumn,
  } as const;
  const getPreviewHeaderStyle = (column: keyof typeof previewColumnStyles, width: string): CSSProperties => ({
    ...previewHeaderCellStyle,
    width,
    textAlign: previewColumnStyles[column].textAlign,
  });
  const getPreviewBodyStyle = (
    column: keyof typeof previewColumnStyles,
    width: string,
    extra?: CSSProperties,
  ): CSSProperties => ({
    ...previewBodyCellStyle,
    width,
    color: previewColumnStyles[column].textColor,
    fontSize: previewColumnStyles[column].fontSizePx,
    fontWeight: previewColumnStyles[column].bold ? 700 : 400,
    textAlign: previewColumnStyles[column].textAlign,
    ...extra,
  });
  const scrollToPreview = () => {
    previewCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="admin-report-design-page">
      <div className="admin-report-design-hero">
        <div>
          <Title level={3} className="admin-report-design-title">
            Report Design Studio
          </Title>
          <Text className="admin-report-design-subtitle">
            Configure report branding, styling, and live previews for each laboratory.
          </Text>
        </div>
        <Space wrap className="admin-report-design-hero-tags">
          <Tag color={canMutate ? 'geekblue' : 'orange'}>
            {canMutate ? 'Edit mode' : 'Read-only mode'}
          </Tag>
          {selectedLab ? (
            <Tag color="cyan">{selectedLab.code}</Tag>
          ) : (
            <Tag>Select a lab</Tag>
          )}
          <Tag color={hasChanges ? 'gold' : 'green'}>
            {hasChanges ? 'Unsaved changes' : 'All changes saved'}
          </Tag>
        </Space>
      </div>

      <Card className="admin-report-design-lab-card">
        <div className="admin-report-design-lab-picker">
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
        <Card className="admin-report-design-empty-card">
          <Empty description="No lab selected" />
        </Card>
      ) : (
        <>
          <Alert
            type="info"
            showIcon
            className="admin-report-design-selected-alert"
            message={`${selectedLab.name} (${selectedLab.code})`}
            description={
              canMutate
                ? `Use PNG for transparent logo/watermark. Banner: ${REPORT_BANNER_RECOMMENDED_SIZE_MM}. Footer: ${REPORT_FOOTER_RECOMMENDED_SIZE_MM}.`
                : 'Read-only mode: you can view design but cannot change it.'
            }
          />

          <Tabs
            className="admin-report-design-tabs"
            defaultActiveKey="pdf-design"
            activeKey={activeTabKey}
            onChange={setActiveTabKey}
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
                          <Card title={item.title} loading={loading} className="admin-report-design-image-card">
                            <Space size={8} wrap style={{ marginBottom: 8 }}>
                              <Tag color="blue">Recommended: {item.recommendedSize}</Tag>
                              <Tag>Max: {formatMegabytes(item.maxBytes)} MB</Tag>
                            </Space>
                            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                              {item.note}
                            </Text>

                            <div className="admin-report-design-image-preview">
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
                      <Card title="Style Controls" loading={loading} className="admin-report-design-style-controls">
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
                                  <Text>Font Family</Text>
                                  <Select
                                    style={{ width: 180 }}
                                    value={reportStyle.patientInfo.fontFamily}
                                    options={FONT_OPTIONS}
                                    onChange={(value) => updatePatientStyle('fontFamily', value)}
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
                                  <Text>Label Alignment</Text>
                                  <Select
                                    style={{ width: 120 }}
                                    value={reportStyle.patientInfo.labelTextAlign}
                                    options={ALIGN_OPTIONS as unknown as { label: string; value: string }[]}
                                    onChange={(value) => updatePatientStyle('labelTextAlign', value)}
                                    disabled={!canMutate}
                                  />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>Value Alignment</Text>
                                  <Select
                                    style={{ width: 120 }}
                                    value={reportStyle.patientInfo.valueTextAlign}
                                    options={ALIGN_OPTIONS as unknown as { label: string; value: string }[]}
                                    onChange={(value) => updatePatientStyle('valueTextAlign', value)}
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
                            <Card size="small" title="Report Title">
                              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                                  <Text>Title Text</Text>
                                  <Input
                                    style={{ width: 240 }}
                                    value={reportStyle.reportTitle.text}
                                    onChange={(event) => updateReportTitleStyle('text', event.target.value)}
                                    disabled={!canMutate}
                                    maxLength={80}
                                  />
                                </div>
                                <StyleColorControl
                                  label="Title Color"
                                  value={reportStyle.reportTitle.textColor}
                                  disabled={!canMutate}
                                  onChange={(value) => updateReportTitleStyle('textColor', value)}
                                />
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>Font Size</Text>
                                  <InputNumber
                                    min={14}
                                    max={28}
                                    value={reportStyle.reportTitle.fontSizePx}
                                    onChange={(value) => updateReportTitleStyle('fontSizePx', Number(value ?? 20))}
                                    disabled={!canMutate}
                                  />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>Alignment</Text>
                                  <Select
                                    style={{ width: 120 }}
                                    value={reportStyle.reportTitle.textAlign}
                                    options={ALIGN_OPTIONS as unknown as { label: string; value: string }[]}
                                    onChange={(value) => updateReportTitleStyle('textAlign', value)}
                                    disabled={!canMutate}
                                  />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>Bold</Text>
                                  <Switch
                                    checked={reportStyle.reportTitle.bold}
                                    onChange={(value) => updateReportTitleStyle('bold', value)}
                                    disabled={!canMutate}
                                  />
                                </div>
                              </Space>
                            </Card>
                          </Col>

                          <Col xs={24}>
                            <Card size="small" title="Page Layout (mm)">
                              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>Page Margin Top</Text>
                                  <InputNumber
                                    min={0}
                                    max={20}
                                    value={reportStyle.pageLayout.pageMarginTopMm}
                                    onChange={(value) =>
                                      updatePageLayoutStyle('pageMarginTopMm', Number(value ?? 3))
                                    }
                                    disabled={!canMutate}
                                  />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>Page Margin Right</Text>
                                  <InputNumber
                                    min={0}
                                    max={20}
                                    value={reportStyle.pageLayout.pageMarginRightMm}
                                    onChange={(value) =>
                                      updatePageLayoutStyle('pageMarginRightMm', Number(value ?? 3))
                                    }
                                    disabled={!canMutate}
                                  />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>Page Margin Bottom</Text>
                                  <InputNumber
                                    min={0}
                                    max={20}
                                    value={reportStyle.pageLayout.pageMarginBottomMm}
                                    onChange={(value) =>
                                      updatePageLayoutStyle('pageMarginBottomMm', Number(value ?? 3))
                                    }
                                    disabled={!canMutate}
                                  />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>Page Margin Left</Text>
                                  <InputNumber
                                    min={0}
                                    max={20}
                                    value={reportStyle.pageLayout.pageMarginLeftMm}
                                    onChange={(value) =>
                                      updatePageLayoutStyle('pageMarginLeftMm', Number(value ?? 3))
                                    }
                                    disabled={!canMutate}
                                  />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>Content Margin X</Text>
                                  <InputNumber
                                    min={0}
                                    max={20}
                                    value={reportStyle.pageLayout.contentMarginXMm}
                                    onChange={(value) =>
                                      updatePageLayoutStyle('contentMarginXMm', Number(value ?? 3))
                                    }
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
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>Show Status Column</Text>
                                  <Switch
                                    checked={showStatusColumn}
                                    onChange={(value) => updateResultsStyle('showStatusColumn', value)}
                                    disabled={!canMutate}
                                  />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>Show Department Row</Text>
                                  <Switch
                                    checked={showDepartmentRow}
                                    onChange={(value) => updateResultsStyle('showDepartmentRow', value)}
                                    disabled={!canMutate}
                                  />
                                </div>
                                <StyleColorControl
                                  label="Department Row Bg"
                                  value={reportStyle.resultsTable.departmentRowBackgroundColor}
                                  disabled={!canMutate || !showDepartmentRow}
                                  onChange={(value) => updateResultsStyle('departmentRowBackgroundColor', value)}
                                />
                                <StyleColorControl
                                  label="Department Row Text"
                                  value={reportStyle.resultsTable.departmentRowTextColor}
                                  disabled={!canMutate || !showDepartmentRow}
                                  onChange={(value) => updateResultsStyle('departmentRowTextColor', value)}
                                />
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>Show Category Row</Text>
                                  <Switch
                                    checked={showCategoryRow}
                                    onChange={(value) => updateResultsStyle('showCategoryRow', value)}
                                    disabled={!canMutate}
                                  />
                                </div>
                                <StyleColorControl
                                  label="Category Row Bg"
                                  value={reportStyle.resultsTable.categoryRowBackgroundColor}
                                  disabled={!canMutate || !showCategoryRow}
                                  onChange={(value) => updateResultsStyle('categoryRowBackgroundColor', value)}
                                />
                                <StyleColorControl
                                  label="Category Row Text"
                                  value={reportStyle.resultsTable.categoryRowTextColor}
                                  disabled={!canMutate || !showCategoryRow}
                                  onChange={(value) => updateResultsStyle('categoryRowTextColor', value)}
                                />
                                <StyleColorControl
                                  label="Status Normal"
                                  value={reportStyle.resultsTable.statusNormalColor}
                                  disabled={!canMutate || !showStatusColumn}
                                  onChange={(value) => updateResultsStyle('statusNormalColor', value)}
                                />
                                <StyleColorControl
                                  label="Status High"
                                  value={reportStyle.resultsTable.statusHighColor}
                                  disabled={!canMutate || !showStatusColumn}
                                  onChange={(value) => updateResultsStyle('statusHighColor', value)}
                                />
                                <StyleColorControl
                                  label="Status Low"
                                  value={reportStyle.resultsTable.statusLowColor}
                                  disabled={!canMutate || !showStatusColumn}
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
                                  <Text>Table Font</Text>
                                  <Select
                                    style={{ width: 180 }}
                                    value={reportStyle.resultsTable.fontFamily}
                                    options={FONT_OPTIONS}
                                    onChange={(value) => updateResultsStyle('fontFamily', value)}
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
                                    disabled={!canMutate || !showDepartmentRow}
                                  />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>Category Font Size</Text>
                                  <InputNumber
                                    min={10}
                                    max={16}
                                    value={reportStyle.resultsTable.categoryRowFontSizePx}
                                    onChange={(value) => updateResultsStyle('categoryRowFontSizePx', Number(value ?? 12))}
                                    disabled={!canMutate || !showCategoryRow}
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
                                    disabled={!canMutate || !showDepartmentRow}
                                  />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>Category Align</Text>
                                  <Select
                                    style={{ width: 120 }}
                                    value={reportStyle.resultsTable.categoryRowTextAlign}
                                    options={ALIGN_OPTIONS as unknown as { label: string; value: string }[]}
                                    onChange={(value) => updateResultsStyle('categoryRowTextAlign', value)}
                                    disabled={!canMutate || !showCategoryRow}
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
                                <div style={{ paddingTop: 8, borderTop: '1px solid #F0F0F0' }}>
                                  <Text strong style={{ display: 'block', marginBottom: 4 }}>
                                    Column Text Controls
                                  </Text>
                                  <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                                    Set color, size, alignment, and bold for each report column separately.
                                  </Text>
                                  <Row gutter={[12, 12]}>
                                    {RESULTS_COLUMN_CONTROLS.map((column) => (
                                      <Col key={column.key} xs={24} md={12}>
                                        <ColumnStyleControlCard
                                          title={column.label}
                                          style={reportStyle.resultsTable[column.key]}
                                          disabled={!canMutate || (column.key === 'statusColumn' && !showStatusColumn)}
                                          onChange={(key, value) => updateResultsColumnStyle(column.key, key, value)}
                                        />
                                      </Col>
                                    ))}
                                  </Row>
                                </div>
                              </Space>
                            </Card>
                          </Col>

                          <Col xs={24}>
                            <Card size="small" title="Culture Section (C&S)">
                              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>Font Family</Text>
                                  <Select
                                    style={{ width: 180 }}
                                    value={reportStyle.cultureSection.fontFamily}
                                    options={FONT_OPTIONS}
                                    onChange={(value) => updateCultureStyle('fontFamily', value)}
                                    disabled={!canMutate}
                                  />
                                </div>
                                <StyleColorControl
                                  label="Section Title Text"
                                  value={reportStyle.cultureSection.sectionTitleColor}
                                  disabled={!canMutate}
                                  onChange={(value) => updateCultureStyle('sectionTitleColor', value)}
                                />
                                <StyleColorControl
                                  label="Section Title Border"
                                  value={reportStyle.cultureSection.sectionTitleBorderColor}
                                  disabled={!canMutate}
                                  onChange={(value) => updateCultureStyle('sectionTitleBorderColor', value)}
                                />
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>Title Alignment</Text>
                                  <Select
                                    style={{ width: 120 }}
                                    value={reportStyle.cultureSection.sectionTitleAlign}
                                    options={ALIGN_OPTIONS as unknown as { label: string; value: string }[]}
                                    onChange={(value) => updateCultureStyle('sectionTitleAlign', value)}
                                    disabled={!canMutate}
                                  />
                                </div>
                                <StyleColorControl
                                  label="No Growth Background"
                                  value={reportStyle.cultureSection.noGrowthBackgroundColor}
                                  disabled={!canMutate}
                                  onChange={(value) => updateCultureStyle('noGrowthBackgroundColor', value)}
                                />
                                <StyleColorControl
                                  label="No Growth Border"
                                  value={reportStyle.cultureSection.noGrowthBorderColor}
                                  disabled={!canMutate}
                                  onChange={(value) => updateCultureStyle('noGrowthBorderColor', value)}
                                />
                                <StyleColorControl
                                  label="No Growth Text"
                                  value={reportStyle.cultureSection.noGrowthTextColor}
                                  disabled={!canMutate}
                                  onChange={(value) => updateCultureStyle('noGrowthTextColor', value)}
                                />
                                <StyleColorControl
                                  label="Meta Text"
                                  value={reportStyle.cultureSection.metaTextColor}
                                  disabled={!canMutate}
                                  onChange={(value) => updateCultureStyle('metaTextColor', value)}
                                />
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>Meta Alignment</Text>
                                  <Select
                                    style={{ width: 120 }}
                                    value={reportStyle.cultureSection.metaTextAlign}
                                    options={ALIGN_OPTIONS as unknown as { label: string; value: string }[]}
                                    onChange={(value) => updateCultureStyle('metaTextAlign', value)}
                                    disabled={!canMutate}
                                  />
                                </div>
                                <StyleColorControl
                                  label="Comment Text"
                                  value={reportStyle.cultureSection.commentTextColor}
                                  disabled={!canMutate}
                                  onChange={(value) => updateCultureStyle('commentTextColor', value)}
                                />
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>Comment Alignment</Text>
                                  <Select
                                    style={{ width: 120 }}
                                    value={reportStyle.cultureSection.commentTextAlign}
                                    options={ALIGN_OPTIONS as unknown as { label: string; value: string }[]}
                                    onChange={(value) => updateCultureStyle('commentTextAlign', value)}
                                    disabled={!canMutate}
                                  />
                                </div>
                                <StyleColorControl
                                  label="Notes Text"
                                  value={reportStyle.cultureSection.notesTextColor}
                                  disabled={!canMutate}
                                  onChange={(value) => updateCultureStyle('notesTextColor', value)}
                                />
                                <StyleColorControl
                                  label="Notes Border"
                                  value={reportStyle.cultureSection.notesBorderColor}
                                  disabled={!canMutate}
                                  onChange={(value) => updateCultureStyle('notesBorderColor', value)}
                                />
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>Notes Alignment</Text>
                                  <Select
                                    style={{ width: 120 }}
                                    value={reportStyle.cultureSection.notesTextAlign}
                                    options={ALIGN_OPTIONS as unknown as { label: string; value: string }[]}
                                    onChange={(value) => updateCultureStyle('notesTextAlign', value)}
                                    disabled={!canMutate}
                                  />
                                </div>
                                <StyleColorControl
                                  label="AST Title Text"
                                  value={reportStyle.cultureSection.astColumnTitleColor}
                                  disabled={!canMutate}
                                  onChange={(value) => updateCultureStyle('astColumnTitleColor', value)}
                                />
                                <StyleColorControl
                                  label="AST Title Border"
                                  value={reportStyle.cultureSection.astColumnTitleBorderColor}
                                  disabled={!canMutate}
                                  onChange={(value) => updateCultureStyle('astColumnTitleBorderColor', value)}
                                />
                                <StyleColorControl
                                  label="AST Body Text"
                                  value={reportStyle.cultureSection.astBodyTextColor}
                                  disabled={!canMutate}
                                  onChange={(value) => updateCultureStyle('astBodyTextColor', value)}
                                />
                                <StyleColorControl
                                  label="AST Empty Text"
                                  value={reportStyle.cultureSection.astEmptyTextColor}
                                  disabled={!canMutate}
                                  onChange={(value) => updateCultureStyle('astEmptyTextColor', value)}
                                />
                                <StyleColorControl
                                  label="Sensitive Border"
                                  value={reportStyle.cultureSection.astSensitiveBorderColor}
                                  disabled={!canMutate}
                                  onChange={(value) => updateCultureStyle('astSensitiveBorderColor', value)}
                                />
                                <StyleColorControl
                                  label="Sensitive Background"
                                  value={reportStyle.cultureSection.astSensitiveBackgroundColor}
                                  disabled={!canMutate}
                                  onChange={(value) => updateCultureStyle('astSensitiveBackgroundColor', value)}
                                />
                                <StyleColorControl
                                  label="Intermediate Border"
                                  value={reportStyle.cultureSection.astIntermediateBorderColor}
                                  disabled={!canMutate}
                                  onChange={(value) => updateCultureStyle('astIntermediateBorderColor', value)}
                                />
                                <StyleColorControl
                                  label="Intermediate Background"
                                  value={reportStyle.cultureSection.astIntermediateBackgroundColor}
                                  disabled={!canMutate}
                                  onChange={(value) => updateCultureStyle('astIntermediateBackgroundColor', value)}
                                />
                                <StyleColorControl
                                  label="Resistance Border"
                                  value={reportStyle.cultureSection.astResistanceBorderColor}
                                  disabled={!canMutate}
                                  onChange={(value) => updateCultureStyle('astResistanceBorderColor', value)}
                                />
                                <StyleColorControl
                                  label="Resistance Background"
                                  value={reportStyle.cultureSection.astResistanceBackgroundColor}
                                  disabled={!canMutate}
                                  onChange={(value) => updateCultureStyle('astResistanceBackgroundColor', value)}
                                />
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>AST Grid Gap</Text>
                                  <InputNumber
                                    min={2}
                                    max={16}
                                    value={reportStyle.cultureSection.astGridGapPx}
                                    onChange={(value) => updateCultureStyle('astGridGapPx', Number(value ?? 6))}
                                    disabled={!canMutate}
                                  />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>AST Min Height</Text>
                                  <InputNumber
                                    min={120}
                                    max={700}
                                    value={reportStyle.cultureSection.astMinHeightPx}
                                    onChange={(value) => updateCultureStyle('astMinHeightPx', Number(value ?? 430))}
                                    disabled={!canMutate}
                                  />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>AST Column Radius</Text>
                                  <InputNumber
                                    min={0}
                                    max={16}
                                    value={reportStyle.cultureSection.astColumnBorderRadiusPx}
                                    onChange={(value) => updateCultureStyle('astColumnBorderRadiusPx', Number(value ?? 6))}
                                    disabled={!canMutate}
                                  />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Text>AST Column Padding</Text>
                                  <InputNumber
                                    min={2}
                                    max={16}
                                    value={reportStyle.cultureSection.astColumnPaddingPx}
                                    onChange={(value) => updateCultureStyle('astColumnPaddingPx', Number(value ?? 7))}
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
                      <div className="admin-report-design-live-pane">
                        <div ref={previewCardRef}>
                          <Card title="Live Preview" loading={loading} className="admin-report-design-live-card">
                            <div
                              style={{
                                border: `1px solid ${reportStyle.patientInfo.borderColor}`,
                                borderRadius: reportStyle.patientInfo.borderRadiusPx,
                                background: reportStyle.patientInfo.backgroundColor,
                                color: reportStyle.patientInfo.textColor,
                                fontSize: reportStyle.patientInfo.fontSizePx,
                                fontFamily: resolvePreviewFontStack(reportStyle.patientInfo.fontFamily),
                                textAlign: reportStyle.patientInfo.textAlign,
                                padding: `${reportStyle.patientInfo.paddingYpx}px ${reportStyle.patientInfo.paddingXpx}px`,
                                marginBottom: 12,
                              }}
                            >
                              <div style={{ ...patientInfoPreviewRowStyle, marginBottom: 6 }}>
                                <span style={patientInfoPreviewLabelStyle}>Name:</span>
                                <span style={patientInfoPreviewValueStyle}>Sample Patient</span>
                              </div>
                              <div style={{ ...patientInfoPreviewRowStyle, marginBottom: 6 }}>
                                <span style={patientInfoPreviewLabelStyle}>Age/Sex:</span>
                                <span style={patientInfoPreviewValueStyle}>36 Years/Male</span>
                              </div>
                              <div style={patientInfoPreviewRowStyle}>
                                <span style={patientInfoPreviewLabelStyle}>Order No:</span>
                                <span style={patientInfoPreviewValueStyle}>260304011</span>
                              </div>
                            </div>

                            <div style={previewTitleStyle}>
                              {reportStyle.reportTitle.text.trim() || 'Laboratory Report'}
                            </div>

                            <div style={{ overflowX: 'auto' }}>
                              <table
                                style={{
                                  width: '100%',
                                  borderCollapse: 'collapse',
                                  tableLayout: 'fixed',
                                  fontFamily: resolvePreviewFontStack(reportStyle.resultsTable.fontFamily),
                                }}
                              >
                                <thead>
                                  <tr>
                                    <th style={getPreviewHeaderStyle('test', previewRegularWidths.test)}>Test</th>
                                    <th style={getPreviewHeaderStyle('result', previewRegularWidths.result)}>Result</th>
                                    <th style={getPreviewHeaderStyle('unit', previewRegularWidths.unit)}>Unit</th>
                                    {showStatusColumn ? (
                                      <th style={getPreviewHeaderStyle('status', previewRegularWidths.status)}>Status</th>
                                    ) : null}
                                    <th style={getPreviewHeaderStyle('reference', previewRegularWidths.reference)}>Reference Value</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {showDepartmentRow ? (
                                    <tr>
                                      <td
                                        colSpan={previewColumnCount}
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
                                  ) : null}
                                  {showCategoryRow ? (
                                    <tr>
                                      <td
                                        colSpan={previewColumnCount}
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
                                  ) : null}
                                  <tr>
                                    <td style={getPreviewBodyStyle('test', previewRegularWidths.test, { background: stripedRowBg })}>Glucose</td>
                                    <td style={getPreviewBodyStyle('result', previewRegularWidths.result, { background: stripedRowBg })}>110</td>
                                    <td style={getPreviewBodyStyle('unit', previewRegularWidths.unit, { background: stripedRowBg })}>mg/dL</td>
                                    {showStatusColumn ? (
                                      <td
                                        style={getPreviewBodyStyle('status', previewRegularWidths.status, {
                                          background: stripedRowBg,
                                          color: reportStyle.resultsTable.statusNormalColor,
                                          fontWeight: 700,
                                        })}
                                      >
                                        Normal
                                      </td>
                                    ) : null}
                                    <td style={getPreviewBodyStyle('reference', previewRegularWidths.reference, { background: stripedRowBg })}>
                                      70-110
                                    </td>
                                  </tr>
                                  <tr>
                                    <td style={getPreviewBodyStyle('test', previewRegularWidths.test, { background: reportStyle.resultsTable.abnormalRowBackgroundColor })}>
                                      ALT
                                    </td>
                                    <td style={getPreviewBodyStyle('result', previewRegularWidths.result, { background: reportStyle.resultsTable.abnormalRowBackgroundColor })}>
                                      82
                                    </td>
                                    <td style={getPreviewBodyStyle('unit', previewRegularWidths.unit, { background: reportStyle.resultsTable.abnormalRowBackgroundColor })}>
                                      U/L
                                    </td>
                                    {showStatusColumn ? (
                                      <td
                                        style={getPreviewBodyStyle('status', previewRegularWidths.status, {
                                          background: reportStyle.resultsTable.abnormalRowBackgroundColor,
                                          color: reportStyle.resultsTable.statusHighColor,
                                          fontWeight: 700,
                                        })}
                                      >
                                        High
                                      </td>
                                    ) : null}
                                    <td style={getPreviewBodyStyle('reference', previewRegularWidths.reference, { background: reportStyle.resultsTable.abnormalRowBackgroundColor })}>
                                      0-40
                                    </td>
                                  </tr>
                                  <tr>
                                    <td style={getPreviewBodyStyle('test', previewRegularWidths.test)}>HDL</td>
                                    <td style={getPreviewBodyStyle('result', previewRegularWidths.result)}>35</td>
                                    <td style={getPreviewBodyStyle('unit', previewRegularWidths.unit)}>mg/dL</td>
                                    {showStatusColumn ? (
                                      <td
                                        style={getPreviewBodyStyle('status', previewRegularWidths.status, {
                                          color: reportStyle.resultsTable.statusLowColor,
                                          fontWeight: 700,
                                        })}
                                      >
                                        Low
                                      </td>
                                    ) : null}
                                    <td style={getPreviewBodyStyle('reference', previewRegularWidths.reference)}>
                                      &gt; 40
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                            <div style={{ marginTop: 14 }}>
                              <div
                                style={{
                                  fontFamily: culturePreviewFontFamily,
                                  color: reportStyle.cultureSection.sectionTitleColor,
                                  borderBottom: `2px solid ${reportStyle.cultureSection.sectionTitleBorderColor}`,
                                  fontSize: 16,
                                  fontWeight: 800,
                                  textAlign: reportStyle.cultureSection.sectionTitleAlign,
                                  paddingBottom: 4,
                                  marginBottom: 8,
                                }}
                              >
                                Culture &amp; Sensitivity
                              </div>
                              <div
                                style={{
                                  border: `1px solid ${reportStyle.cultureSection.noGrowthBorderColor}`,
                                  background: reportStyle.cultureSection.noGrowthBackgroundColor,
                                  color: reportStyle.cultureSection.noGrowthTextColor,
                                  borderRadius: 6,
                                  padding: '8px 10px',
                                  marginBottom: 10,
                                  fontFamily: culturePreviewFontFamily,
                                  fontWeight: 700,
                                  textAlign: reportStyle.cultureSection.metaTextAlign,
                                }}
                              >
                                No growth
                                <div
                                  style={{
                                    marginTop: 2,
                                    fontSize: 11,
                                    fontWeight: 400,
                                    color: reportStyle.cultureSection.metaTextColor,
                                    textAlign: reportStyle.cultureSection.metaTextAlign,
                                  }}
                                >
                                  Result: No growth after 24 hours
                                </div>
                              </div>
                              <div style={{ ...cultureMetaPreviewStyle, marginBottom: 4 }}>
                                <strong>Microorganism:</strong>{' '}
                                <span style={{ color: reportStyle.cultureSection.sectionTitleColor, fontStyle: 'italic' }}>
                                  E. coli
                                </span>
                              </div>
                              <div style={{ ...cultureMetaPreviewStyle, marginBottom: 6 }}>
                                <strong>Source:</strong> Urine
                              </div>
                              <div style={{ ...cultureCommentPreviewStyle, marginBottom: 6 }}>
                                Comment: Clinical correlation advised.
                              </div>
                              <div
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                                  gap: reportStyle.cultureSection.astGridGapPx,
                                  minHeight: culturePreviewGridMinHeight,
                                }}
                              >
                                {[
                                  {
                                    title: 'Sensitive',
                                    border: reportStyle.cultureSection.astSensitiveBorderColor,
                                    bg: reportStyle.cultureSection.astSensitiveBackgroundColor,
                                    values: ['Amikacin', 'Meropenem'],
                                  },
                                  {
                                    title: 'Intermediate',
                                    border: reportStyle.cultureSection.astIntermediateBorderColor,
                                    bg: reportStyle.cultureSection.astIntermediateBackgroundColor,
                                    values: ['Ciprofloxacin'],
                                  },
                                  {
                                    title: 'Resistance',
                                    border: reportStyle.cultureSection.astResistanceBorderColor,
                                    bg: reportStyle.cultureSection.astResistanceBackgroundColor,
                                    values: ['Ampicillin', 'Ceftriaxone'],
                                  },
                                ].map((column) => (
                                  <div
                                    key={column.title}
                                    style={{
                                      border: `1px solid ${column.border}`,
                                      background: column.bg,
                                      borderRadius: reportStyle.cultureSection.astColumnBorderRadiusPx,
                                      padding: reportStyle.cultureSection.astColumnPaddingPx,
                                      display: 'flex',
                                      flexDirection: 'column',
                                      minHeight: 92,
                                    }}
                                  >
                                    <div
                                      style={{
                                        color: reportStyle.cultureSection.astColumnTitleColor,
                                        borderBottom: `1px solid ${reportStyle.cultureSection.astColumnTitleBorderColor}`,
                                        paddingBottom: 2,
                                        marginBottom: 4,
                                        fontWeight: 700,
                                        fontSize: 11,
                                        fontFamily: culturePreviewFontFamily,
                                      }}
                                    >
                                      {column.title}
                                    </div>
                                    <div
                                      style={{
                                        color: reportStyle.cultureSection.astBodyTextColor,
                                        fontSize: 11,
                                        lineHeight: 1.35,
                                        fontFamily: culturePreviewFontFamily,
                                      }}
                                    >
                                      {column.values.map((item) => (
                                        <div key={item}>{item}</div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <div style={cultureNotesPreviewStyle}>
                                <strong>Notes:</strong>{' '}
                                <span style={{ color: reportStyle.cultureSection.commentTextColor }}>
                                  Clinical correlation advised.
                                </span>
                              </div>
                            </div>
                          </Card>
                        </div>
                        <Card title="Full Report Preview" className="admin-report-design-full-preview-card" loading={loading}>
                          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                            Select a real order from this lab, then refresh to render a PDF with unsaved draft design.
                          </Text>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              marginBottom: 10,
                              gap: 8,
                            }}
                          >
                            <Text>Culture-only full preview</Text>
                            <Switch
                              checked={cultureOnlyPreview}
                              onChange={setCultureOnlyPreview}
                              disabled={!canMutate}
                            />
                          </div>
                          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                            {cultureOnlyPreview
                              ? 'Preview includes only Culture & Sensitivity pages so you can tune culture design faster.'
                              : 'Preview includes all report pages.'}
                          </Text>
                          <Select
                            showSearch
                            allowClear
                            style={{ width: '100%' }}
                            placeholder="Search orders by number/patient"
                            value={selectedPreviewOrderId ?? undefined}
                            onChange={(value) => {
                              setSelectedPreviewOrderId(value ?? null);
                              setFullPreviewError(null);
                            }}
                            onSearch={(value) => setPreviewOrderQuery(value)}
                            filterOption={false}
                            loading={loadingPreviewOrders}
                            options={previewOrderOptions.map((order) => ({
                              value: order.id,
                              label: formatOrderPreviewLabel(order),
                            }))}
                          />
                          <Space style={{ marginTop: 12 }}>
                            <Button
                              type="primary"
                              onClick={() => void handleRefreshFullPreview()}
                              loading={refreshingFullPreview}
                              disabled={!canMutate}
                            >
                              Refresh full preview
                            </Button>
                            {!canMutate ? <Tag color="orange">Read-only mode</Tag> : null}
                          </Space>
                          {!selectedPreviewOrderId ? (
                            <Alert
                              style={{ marginTop: 12 }}
                              type="info"
                              showIcon
                              message="Select an order to generate full preview"
                            />
                          ) : null}
                          {fullPreviewError ? (
                            <Alert
                              style={{ marginTop: 12 }}
                              type="error"
                              showIcon
                              message={fullPreviewError}
                            />
                          ) : null}
                          {fullPreviewPdfUrl ? (
                            <iframe
                              title="Full report PDF preview"
                              src={fullPreviewPdfUrl}
                              className="admin-report-design-full-preview-frame"
                            />
                          ) : null}
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
                  <Card title="Online Result Watermark" loading={loading} className="admin-report-design-online-card">
                    <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                      Optional image/text watermark for patient online result page.
                    </Text>
                    <div className="admin-report-design-online-preview">
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

          <div className="admin-report-design-action-bar">
            <Space wrap>
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
          {activeTabKey === 'report-style' ? (
            <FloatButton
              icon={<EyeOutlined />}
              tooltip="Jump to live preview"
              onClick={scrollToPreview}
              style={{ insetInlineEnd: 24, bottom: 96 }}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function getErrorMessage(err: unknown): string | null {
  if (!err || typeof err !== 'object' || !('response' in err)) {
    return null;
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
  const data = response?.data;
  const msg = data?.message;
  if (Array.isArray(msg)) {
    return msg[0] ?? null;
  }
  if (typeof msg === 'string') {
    return msg;
  }
  return null;
}
