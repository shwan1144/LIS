import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Divider,
  Form,
  Input,
  Radio,
  Select,
  Space,
  Typography,
  message,
} from 'antd';
import axios from 'axios';
import { getLabSettings, updateLabSettings } from '../../api/client';
import {
  checkDirectPrintConnection,
  getDirectPrintErrorMessage,
  isVirtualSavePrinterName,
} from '../../printing/direct-print';

const { Title, Text } = Typography;

type FormValues = {
  mode: 'browser' | 'direct_qz' | 'direct_gateway';
  receiptPrinterName: string;
  labelsPrinterName: string;
  reportPrinterName: string;
};

export function SettingsPrintingPage() {
  const [form] = Form.useForm<FormValues>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [availablePrinters, setAvailablePrinters] = useState<string[]>([]);
  const currentMode = Form.useWatch('mode', form);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const settings = await getLabSettings();
        form.setFieldsValue({
          mode: settings.printing?.mode || 'browser',
          receiptPrinterName: settings.printing?.receiptPrinterName || '',
          labelsPrinterName: settings.printing?.labelsPrinterName || '',
          reportPrinterName: settings.printing?.reportPrinterName || '',
        });
      } catch {
        message.error('Failed to load printing settings');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [form]);

  useEffect(() => {
    if (currentMode === 'direct_gateway') {
      const fetchPrinters = () => {
        axios.get('http://localhost:17881/local/printers')
          .then(res => {
            if (res.data && Array.isArray(res.data.printers)) {
              setAvailablePrinters(res.data.printers);
            }
          })
          .catch(err => {
            console.warn('Failed to fetch printers from gateway:', err);
          });
      };
      fetchPrinters();
    } else {
      setAvailablePrinters([]);
    }
  }, [currentMode]);

  const handleSave = async (values: FormValues) => {
    setSaving(true);
    try {
      await updateLabSettings({
        printing: {
          mode: values.mode,
          receiptPrinterName: values.receiptPrinterName || null,
          labelsPrinterName: values.labelsPrinterName || null,
          reportPrinterName: values.reportPrinterName || null,
        },
      });
      message.success('Printing settings saved for this lab');
    } catch (error: unknown) {
      const msg =
        error &&
        typeof error === 'object' &&
        'response' in error &&
        (error as { response?: { data?: { message?: string | string[] } } }).response?.data?.message;
      const text = Array.isArray(msg) ? msg[0] : msg;
      message.error(text || 'Failed to save printing settings');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    const defaults: FormValues = {
      mode: 'browser',
      receiptPrinterName: '',
      labelsPrinterName: '',
      reportPrinterName: '',
    };
    form.setFieldsValue(defaults);
    await handleSave(defaults);
  };

  const handleTestConnection = async () => {
    const values = form.getFieldsValue();
    if (values.mode === 'browser') {
      message.info('Choose a direct printing mode first');
      return;
    }

    setTesting(true);
    try {
      const firstPrinter =
        values.receiptPrinterName.trim() ||
        values.labelsPrinterName.trim() ||
        values.reportPrinterName.trim() ||
        undefined;

      if (values.mode === 'direct_qz' && firstPrinter && isVirtualSavePrinterName(firstPrinter)) {
        await checkDirectPrintConnection('direct_qz');
        message.info(
          `QZ connection is ready. "${firstPrinter}" is a virtual PDF/XPS printer, so report print will use browser Save dialog.`,
        );
        return;
      }

      await checkDirectPrintConnection(values.mode, firstPrinter);
      message.success(
        values.mode === 'direct_gateway'
          ? 'LIS Gateway is connected and ready'
          : 'Direct print connection (QZ Tray) is ready on this computer',
      );
    } catch (error) {
      message.error(getDirectPrintErrorMessage(error, values.mode));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div>
      <Title level={4}>Printing</Title>
      <Text type="secondary">
        Configure printing behavior per lab. These settings are shared for this lab.
      </Text>

      <Card style={{ marginTop: 16, maxWidth: 760 }} loading={loading}>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="No-popup direct print"
          description="Direct printing allows silent printing without browser dialogs. Choose between QZ Tray or the first-party LIS Gateway agent."
        />

        <Form
          form={form}
          layout="vertical"
          initialValues={{
            mode: 'browser',
            receiptPrinterName: '',
            labelsPrinterName: '',
            reportPrinterName: '',
          }}
          onFinish={(values) => void handleSave(values)}
        >
          <Form.Item
            name="mode"
            label="Print method"
            rules={[{ required: true, message: 'Please choose print method' }]}
          >
            <Radio.Group>
              <Space direction="vertical">
                <Radio value="browser">Browser print (shows print popup)</Radio>
                <Radio value="direct_qz">Direct print with QZ Tray (needs Java)</Radio>
                <Radio value="direct_gateway">Direct print with LIS Gateway (Recommended)</Radio>
              </Space>
            </Radio.Group>
          </Form.Item>

          <Divider style={{ margin: '12px 0 20px' }} />

          <Form.Item
            name="receiptPrinterName"
            label="Receipt printer name"
            tooltip="Example: EPSON TM-T82"
          >
            {currentMode === 'direct_gateway' && availablePrinters.length > 0 ? (
              <Select
                showSearch
                placeholder="Choose printer"
                options={availablePrinters.map((p) => ({ value: p, label: p }))}
              />
            ) : (
              <Input placeholder="EPSON TM-T82 Receipt" maxLength={128} />
            )}
          </Form.Item>

          <Form.Item
            name="labelsPrinterName"
            label="Label printer name"
            tooltip="Example: ZDesigner GK420d"
          >
            {currentMode === 'direct_gateway' && availablePrinters.length > 0 ? (
              <Select
                showSearch
                placeholder="Choose printer"
                options={availablePrinters.map((p) => ({ value: p, label: p }))}
              />
            ) : (
              <Input placeholder="ZDesigner Label" maxLength={128} />
            )}
          </Form.Item>

          <Form.Item
            name="reportPrinterName"
            label="Report printer name"
            tooltip="Example: HP LaserJet"
          >
            {currentMode === 'direct_gateway' && availablePrinters.length > 0 ? (
              <Select
                showSearch
                placeholder="Choose printer"
                options={availablePrinters.map((p) => ({ value: p, label: p }))}
              />
            ) : (
              <Input placeholder="HP LaserJet A4" maxLength={128} />
            )}
          </Form.Item>

          <Space wrap>
            <Button type="primary" htmlType="submit" loading={saving}>
              Save
            </Button>
            <Button onClick={() => void handleReset()} disabled={saving}>
              Reset
            </Button>
            <Button onClick={() => void handleTestConnection()} loading={testing}>
              Test direct print connection
            </Button>
          </Space>
        </Form>
      </Card>
    </div>
  );
}
