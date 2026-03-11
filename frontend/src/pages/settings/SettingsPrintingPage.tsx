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
import { getLabSettings, updateLabSettings } from '../../api/client';
import {
  checkDirectPrintConnection,
  getDirectPrintErrorMessage,
  isVirtualSavePrinterName,
  listDirectPrintPrinters,
} from '../../printing/direct-print';

const { Title, Text } = Typography;

type FormValues = {
  mode: 'browser' | 'direct_gateway';
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
    if (currentMode !== 'direct_gateway') {
      setAvailablePrinters([]);
      return;
    }

    let cancelled = false;
    void listDirectPrintPrinters()
      .then((printers) => {
        if (!cancelled) {
          setAvailablePrinters(printers);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setAvailablePrinters([]);
          console.warn('Failed to fetch printers from gateway:', error);
        }
      });

    return () => {
      cancelled = true;
    };
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

      if (firstPrinter && isVirtualSavePrinterName(firstPrinter)) {
        await checkDirectPrintConnection();
        message.info(
          `LIS Gateway is ready. "${firstPrinter}" is a virtual PDF/XPS printer, so report print will use browser Save dialog.`,
        );
        return;
      }

      await checkDirectPrintConnection(firstPrinter);
      message.success('LIS Gateway is connected and ready');
    } catch (error) {
      message.error(getDirectPrintErrorMessage(error));
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
          description="LIS Gateway is the direct-print path for this workstation. Use browser mode if you want the normal print dialog."
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
                <Radio value="direct_gateway">Direct print with LIS Gateway</Radio>
              </Space>
            </Radio.Group>
          </Form.Item>

          {currentMode === 'direct_gateway' ? (
            <Alert
              type="success"
              showIcon
              style={{ marginBottom: 16 }}
              message="Gateway setup"
              description="Install and run LIS Gateway on this workstation. If connection fails, open the gateway app or restart the gateway service."
            />
          ) : null}

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
            extra={
              currentMode === 'direct_gateway'
                ? 'Zebra/ZDesigner direct labels use a native printer template optimized for speed and barcode quality, so the printed result may not match preview exactly.'
                : undefined
            }
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
