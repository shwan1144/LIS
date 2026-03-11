import { useCallback, useEffect, useMemo, useState, type FocusEvent } from 'react';
import { AutoComplete, Button, Card, Form, Input, Select, Space, Switch, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useTheme } from '../contexts/ThemeContext';
import {
  getCultureEntryHistory,
  type CultureEntryHistoryDto,
} from '../api/client';

const { Text } = Typography;
const DEFAULT_NO_GROWTH_RESULT = 'No growth of microorganizm';

const CULTURE_SOURCE_VALUES = [
  'Urine',
  'Blood',
  'Stool',
  'Sputum',
  'Wound swab',
  'Throat swab',
  'Ear swab',
  'Vaginal swab',
  'CSF',
  'Aspirate',
  'Semen',
];
const CULTURE_SOURCE_OPTIONS = CULTURE_SOURCE_VALUES.map((value) => ({ value }));

const CULTURE_CONDITION_VALUES = [
  'Pure growth',
  'Mixed growth',
  'Scanty growth',
  'Moderate growth',
  'Heavy growth',
  'Contaminated sample',
];

const CULTURE_COLONY_COUNT_VALUES = [
  '<10^3 CFU/mL',
  '10^3 CFU/mL',
  '10^4 CFU/mL',
  '10^5 CFU/mL',
  '>10^5 CFU/mL',
  'No significant growth',
];

const NO_GROWTH_RESULT_OPTIONS = [
  DEFAULT_NO_GROWTH_RESULT,
  'No growth',
  'No pathogenic growth',
  'Sterile culture',
].map((value) => ({ value }));

function mergeAutoCompleteOptions(
  seededValues: string[],
  rememberedValues: string[],
): Array<{ value: string }> {
  const seen = new Set<string>();
  const merged: Array<{ value: string }> = [];
  for (const value of [...seededValues, ...rememberedValues]) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const normalized = trimmed.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    merged.push({ value: trimmed });
  }
  return merged;
}

function mergeHistoryValues(incoming: string[], existing: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const raw of [...incoming, ...existing]) {
    const value = raw.trim();
    if (!value) continue;
    const normalized = value.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    merged.push(value);
  }
  return merged.slice(0, 200);
}

const EMPTY_CULTURE_ENTRY_HISTORY: CultureEntryHistoryDto = {
  microorganisms: [],
  conditions: [],
  colonyCounts: [],
};

let cultureEntryHistoryCache: CultureEntryHistoryDto | null = null;
let cultureEntryHistoryPromise: Promise<CultureEntryHistoryDto> | null = null;

async function loadCultureEntryHistory(): Promise<CultureEntryHistoryDto> {
  if (cultureEntryHistoryCache) return cultureEntryHistoryCache;
  if (!cultureEntryHistoryPromise) {
    cultureEntryHistoryPromise = getCultureEntryHistory()
      .then((history) => {
        const normalized: CultureEntryHistoryDto = {
          microorganisms: mergeHistoryValues(history.microorganisms ?? [], []),
          conditions: mergeHistoryValues(history.conditions ?? [], []),
          colonyCounts: mergeHistoryValues(history.colonyCounts ?? [], []),
        };
        cultureEntryHistoryCache = normalized;
        return normalized;
      })
      .catch(() => EMPTY_CULTURE_ENTRY_HISTORY)
      .finally(() => {
        cultureEntryHistoryPromise = null;
      });
  }
  return cultureEntryHistoryPromise;
}

export interface CultureAntibioticOption {
  value: string;
  label: string;
}

interface CultureSensitivityEditorProps {
  baseName: Array<string | number>;
  antibioticOptions: CultureAntibioticOption[];
  interpretationOptions: string[];
  micUnit?: string | null;
  disabled?: boolean;
}

const antibioticGridColumns = '1.65fr 0.8fr 0.8fr 36px';

export function CultureSensitivityEditor({
  baseName,
  antibioticOptions,
  interpretationOptions,
  micUnit,
  disabled = false,
}: CultureSensitivityEditorProps) {
  const { isDark } = useTheme();
  const form = Form.useFormInstance();
  const noGrowth = Form.useWatch([...baseName, 'noGrowth']);
  const noGrowthResult = Form.useWatch([...baseName, 'noGrowthResult']);
  const [organismHistory, setOrganismHistory] = useState<string[]>([]);
  const [conditionHistory, setConditionHistory] = useState<string[]>([]);
  const [colonyCountHistory, setColonyCountHistory] = useState<string[]>([]);
  const organismOptions = useMemo(
    () => mergeAutoCompleteOptions([], organismHistory),
    [organismHistory],
  );
  const conditionOptions = useMemo(
    () =>
      mergeAutoCompleteOptions(CULTURE_CONDITION_VALUES, conditionHistory),
    [conditionHistory],
  );
  const colonyCountOptions = useMemo(
    () =>
      mergeAutoCompleteOptions(CULTURE_COLONY_COUNT_VALUES, colonyCountHistory),
    [colonyCountHistory],
  );
  const rememberHistoryForField = useCallback(
    (field: 'organism' | 'condition' | 'colonyCount', rawValue: string) => {
      const trimmed = rawValue.trim();
      if (!trimmed) return;
      if (field === 'organism') {
        setOrganismHistory((current) => mergeHistoryValues([trimmed], current));
        cultureEntryHistoryCache = {
          ...(cultureEntryHistoryCache ?? EMPTY_CULTURE_ENTRY_HISTORY),
          microorganisms: mergeHistoryValues(
            [trimmed],
            cultureEntryHistoryCache?.microorganisms ?? [],
          ),
        };
        return;
      }
      if (field === 'condition') {
        setConditionHistory((current) => mergeHistoryValues([trimmed], current));
        cultureEntryHistoryCache = {
          ...(cultureEntryHistoryCache ?? EMPTY_CULTURE_ENTRY_HISTORY),
          conditions: mergeHistoryValues(
            [trimmed],
            cultureEntryHistoryCache?.conditions ?? [],
          ),
        };
        return;
      }
      setColonyCountHistory((current) => mergeHistoryValues([trimmed], current));
      cultureEntryHistoryCache = {
        ...(cultureEntryHistoryCache ?? EMPTY_CULTURE_ENTRY_HISTORY),
        colonyCounts: mergeHistoryValues(
          [trimmed],
          cultureEntryHistoryCache?.colonyCounts ?? [],
        ),
      };
    },
    [],
  );
  const rememberHistoryFromBlur = useCallback(
    (
      field: 'organism' | 'condition' | 'colonyCount',
      event: FocusEvent<HTMLElement>,
    ) => {
      const value = (event.target as HTMLInputElement | null)?.value ?? '';
      rememberHistoryForField(field, value);
    },
    [rememberHistoryForField],
  );
  const palette = isDark
    ? {
        containerBorder: 'rgba(96, 165, 250, 0.4)',
        containerBackground:
          'linear-gradient(180deg, rgba(30,41,59,0.74) 0%, rgba(15,23,42,0.84) 70%)',
        fieldLabel: '#cbd5e1',
        cardBorder: 'rgba(148, 163, 184, 0.35)',
        cardBackground: 'rgba(15, 23, 42, 0.66)',
        noGrowthCardBackground: 'rgba(15, 23, 42, 0.52)',
        isolateBadgeBackground: 'rgba(30, 64, 175, 0.34)',
        isolateBadgeColor: '#bfdbfe',
        mutedText: '#94a3b8',
        antibioticPanelBorder: 'rgba(148, 163, 184, 0.32)',
        antibioticPanelBackground: 'rgba(15, 23, 42, 0.58)',
        antibioticHeaderBorder: 'rgba(148, 163, 184, 0.3)',
        antibioticHeaderText: '#cbd5e1',
        emptyRowBorder: 'rgba(148, 163, 184, 0.45)',
        emptyRowBackground: 'rgba(2, 6, 23, 0.58)',
        rowBackground: 'rgba(15, 23, 42, 0.82)',
        rowBorder: 'rgba(148, 163, 184, 0.34)',
      }
    : {
        containerBorder: '#bfdbfe',
        containerBackground:
          'linear-gradient(180deg, rgba(239,246,255,0.62) 0%, rgba(255,255,255,0.98) 70%)',
        fieldLabel: '#1f2937',
        cardBorder: '#cbd5e1',
        cardBackground: '#ffffff',
        noGrowthCardBackground: '#f8fafc',
        isolateBadgeBackground: '#e0ecff',
        isolateBadgeColor: '#1d4ed8',
        mutedText: '#475569',
        antibioticPanelBorder: '#dbeafe',
        antibioticPanelBackground: '#f8fbff',
        antibioticHeaderBorder: '#dbeafe',
        antibioticHeaderText: '#334155',
        emptyRowBorder: '#cbd5e1',
        emptyRowBackground: '#ffffff',
        rowBackground: '#ffffff',
        rowBorder: '#e2e8f0',
      };
  const fieldLabelStyle = {
    fontSize: 11,
    fontWeight: 600,
    color: palette.fieldLabel,
  };
  const cardSurfaceStyle = {
    border: `1px solid ${palette.cardBorder}`,
    borderRadius: 10,
    background: palette.cardBackground,
  };

  useEffect(() => {
    let active = true;
    void loadCultureEntryHistory()
      .then((history) => {
        if (!active) return;
        setOrganismHistory(history.microorganisms ?? []);
        setConditionHistory(history.conditions ?? []);
        setColonyCountHistory(history.colonyCounts ?? []);
      })
      .catch(() => {
        // Ignore history fetch failure and continue with built-in options.
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!noGrowth) return;
    const text = typeof noGrowthResult === 'string' ? noGrowthResult.trim() : '';
    if (text.length > 0) return;
    form.setFieldValue([...baseName, 'noGrowthResult'], DEFAULT_NO_GROWTH_RESULT);
  }, [form, noGrowth, noGrowthResult, baseName]);

  useEffect(() => {
    if (!noGrowth) return;
    const isolatePath = [...baseName, 'isolates'];
    const current = form.getFieldValue(isolatePath);
    if (Array.isArray(current) && current.length > 0) return;
    form.setFieldValue(isolatePath, [
      {
        isolateKey: `isolate-${Date.now()}`,
        organism: '',
        source: '',
        condition: '',
        colonyCount: '',
        comment: '',
        antibiotics: [],
      },
    ]);
  }, [form, noGrowth, baseName]);

  return (
    <div
      style={{
        border: '1px solid #bfdbfe',
        borderRadius: 12,
        padding: 12,
        borderColor: palette.containerBorder,
        background: palette.containerBackground,
      }}
    >
      <Space align="center" style={{ marginBottom: 10 }}>
        <Form.Item
          name={[...baseName, 'noGrowth']}
          valuePropName="checked"
          style={{ marginBottom: 0 }}
        >
          <Switch size="small" disabled={disabled} />
        </Form.Item>
        <Text strong style={{ fontSize: 12, color: palette.fieldLabel }}>
          No growth
        </Text>
      </Space>

      {noGrowth ? (
        <Form.Item
          name={[...baseName, 'noGrowthResult']}
          label={<span style={fieldLabelStyle}>Result</span>}
          style={{ marginBottom: 8 }}
        >
          <AutoComplete
            options={NO_GROWTH_RESULT_OPTIONS}
            disabled={disabled}
            placeholder={DEFAULT_NO_GROWTH_RESULT}
            filterOption={(inputValue, option) =>
              String(option?.value ?? '')
                .toLowerCase()
                .includes(inputValue.toLowerCase())
            }
          />
        </Form.Item>
      ) : null}

      {noGrowth ? (
        <Card
          size="small"
          style={{ ...cardSurfaceStyle, marginBottom: 8, background: palette.noGrowthCardBackground }}
          bodyStyle={{ padding: 10 }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
            }}
          >
            <Form.Item
              name={[...baseName, 'isolates', 0, 'source']}
              label={<span style={fieldLabelStyle}>Source</span>}
              style={{ marginBottom: 0 }}
            >
              <AutoComplete
                options={CULTURE_SOURCE_OPTIONS}
                disabled={disabled}
                placeholder="Select or type source"
                filterOption={(inputValue, option) =>
                  String(option?.value ?? '')
                    .toLowerCase()
                    .includes(inputValue.toLowerCase())
                }
              />
            </Form.Item>
            <Form.Item
              name={[...baseName, 'isolates', 0, 'comment']}
              label={<span style={fieldLabelStyle}>Comment</span>}
              style={{ marginBottom: 0 }}
            >
              <Input disabled={disabled} placeholder="Optional isolate comment" />
            </Form.Item>
          </div>
        </Card>
      ) : (
        <>
          <Form.Item
            name={[...baseName, 'notes']}
            label={<span style={fieldLabelStyle}>Notes</span>}
            style={{ marginBottom: 10 }}
          >
            <Input.TextArea
              rows={2}
              disabled={disabled}
              placeholder="Optional culture notes"
            />
          </Form.Item>

          <Form.List name={[...baseName, 'isolates']}>
            {(isolateFields, { add: addIsolate, remove: removeIsolate }) => (
              <>
                {isolateFields.map((isolateField, isolateIndex) => (
                  <Card
                    key={isolateField.key}
                    size="small"
                    style={{
                      ...cardSurfaceStyle,
                      marginBottom: 10,
                      boxShadow: '0 4px 12px rgba(15, 23, 42, 0.05)',
                    }}
                    bodyStyle={{ padding: 10 }}
                  >
                    <Space
                      align="start"
                      style={{
                        width: '100%',
                        justifyContent: 'space-between',
                        marginBottom: 10,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Text
                          strong
                          style={{
                            fontSize: 12,
                            padding: '2px 8px',
                            borderRadius: 999,
                            background: palette.isolateBadgeBackground,
                            color: palette.isolateBadgeColor,
                          }}
                        >
                          Isolate {isolateIndex + 1}
                        </Text>
                        <Text style={{ fontSize: 11, color: palette.mutedText }}>
                          Culture details
                        </Text>
                      </div>
                      <Button
                        type="text"
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        disabled={disabled}
                        onClick={() => removeIsolate(isolateField.name)}
                      />
                    </Space>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                        gap: 8,
                        marginBottom: 10,
                      }}
                    >
                      <Form.Item
                        name={[isolateField.name, 'organism']}
                        label={<span style={fieldLabelStyle}>Organism</span>}
                        rules={[
                          {
                            required: true,
                            message: 'Organism is required',
                          },
                        ]}
                        style={{ marginBottom: 0 }}
                      >
                        <AutoComplete
                          options={organismOptions}
                          disabled={disabled}
                          placeholder="e.g., E. coli"
                          filterOption={(inputValue, option) =>
                            String(option?.value ?? '')
                              .toLowerCase()
                              .includes(inputValue.toLowerCase())
                          }
                          onSelect={(value) =>
                            rememberHistoryForField('organism', String(value))
                          }
                        >
                          <Input
                            disabled={disabled}
                            placeholder="e.g., E. coli"
                            onBlur={(event) =>
                              rememberHistoryFromBlur('organism', event)
                            }
                          />
                        </AutoComplete>
                      </Form.Item>
                      <Form.Item
                        name={[isolateField.name, 'source']}
                        label={<span style={fieldLabelStyle}>Source</span>}
                        style={{ marginBottom: 0 }}
                      >
                        <AutoComplete
                          options={CULTURE_SOURCE_OPTIONS}
                          disabled={disabled}
                          placeholder="Select or type source"
                          filterOption={(inputValue, option) =>
                            String(option?.value ?? '')
                              .toLowerCase()
                              .includes(inputValue.toLowerCase())
                          }
                        />
                      </Form.Item>
                      <Form.Item
                        name={[isolateField.name, 'condition']}
                        label={<span style={fieldLabelStyle}>Condition</span>}
                        style={{ marginBottom: 0 }}
                      >
                        <AutoComplete
                          options={conditionOptions}
                          disabled={disabled}
                          placeholder="Select or type condition"
                          filterOption={(inputValue, option) =>
                            String(option?.value ?? '')
                              .toLowerCase()
                              .includes(inputValue.toLowerCase())
                          }
                          onSelect={(value) =>
                            rememberHistoryForField('condition', String(value))
                          }
                          onBlur={(event) =>
                            rememberHistoryFromBlur('condition', event)
                          }
                        />
                      </Form.Item>
                      <Form.Item
                        name={[isolateField.name, 'colonyCount']}
                        label={<span style={fieldLabelStyle}>Colony count</span>}
                        style={{ marginBottom: 0 }}
                      >
                        <AutoComplete
                          options={colonyCountOptions}
                          disabled={disabled}
                          placeholder="Select or type colony count"
                          filterOption={(inputValue, option) =>
                            String(option?.value ?? '')
                              .toLowerCase()
                              .includes(inputValue.toLowerCase())
                          }
                          onSelect={(value) =>
                            rememberHistoryForField('colonyCount', String(value))
                          }
                          onBlur={(event) =>
                            rememberHistoryFromBlur('colonyCount', event)
                          }
                        />
                      </Form.Item>
                      <Form.Item
                        name={[isolateField.name, 'comment']}
                        label={<span style={fieldLabelStyle}>Comment</span>}
                        style={{ marginBottom: 0, gridColumn: '1 / -1' }}
                      >
                        <Input.TextArea
                          rows={2}
                          disabled={disabled}
                          placeholder="Optional isolate comment"
                        />
                      </Form.Item>
                    </div>

                    <Form.List name={[isolateField.name, 'antibiotics']}>
                      {(rowFields, { add: addRow, remove: removeRow }) => (
                        <div
                          style={{
                            border: '1px solid #dbeafe',
                            borderRadius: 10,
                            borderColor: palette.antibioticPanelBorder,
                            background: palette.antibioticPanelBackground,
                            padding: 8,
                          }}
                        >
                          <Space
                            align="center"
                            style={{
                              width: '100%',
                              justifyContent: 'space-between',
                              marginBottom: 8,
                            }}
                          >
                            <Text strong style={{ fontSize: 11 }}>
                              Antibiotic list
                            </Text>
                            <Text style={{ fontSize: 11, color: palette.mutedText }}>
                              {rowFields.length} row{rowFields.length === 1 ? '' : 's'}
                            </Text>
                          </Space>
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: antibioticGridColumns,
                              gap: 8,
                              padding: '0 0 6px',
                              borderBottom: `1px solid ${palette.antibioticHeaderBorder}`,
                              marginBottom: 6,
                            }}
                          >
                            <Text style={{ fontSize: 10, color: palette.antibioticHeaderText, fontWeight: 700 }}>
                              Antibiotic
                            </Text>
                            <Text style={{ fontSize: 10, color: palette.antibioticHeaderText, fontWeight: 700 }}>
                              Result
                            </Text>
                            <Text style={{ fontSize: 10, color: palette.antibioticHeaderText, fontWeight: 700 }}>
                              MIC
                            </Text>
                            <span />
                          </div>
                          <div
                            style={{
                              maxHeight: 240,
                              overflowY: 'auto',
                              paddingRight: 4,
                            }}
                          >
                            {rowFields.length === 0 ? (
                              <div
                                style={{
                                  border: `1px dashed ${palette.emptyRowBorder}`,
                                  borderRadius: 8,
                                  padding: '10px 12px',
                                  fontSize: 11,
                                  color: palette.mutedText,
                                  background: palette.emptyRowBackground,
                                }}
                              >
                                No antibiotic rows added yet.
                              </div>
                            ) : null}
                            {rowFields.map((rowField) => (
                              <div
                                key={rowField.key}
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns: antibioticGridColumns,
                                  gap: 8,
                                  marginBottom: 6,
                                  alignItems: 'start',
                                  padding: 6,
                                  borderRadius: 8,
                                  background: palette.rowBackground,
                                  border: `1px solid ${palette.rowBorder}`,
                                }}
                              >
                                <Form.Item
                                  name={[rowField.name, 'antibioticId']}
                                  rules={[
                                    {
                                      required: true,
                                      message: 'Antibiotic is required',
                                    },
                                  ]}
                                  style={{ marginBottom: 0 }}
                                >
                                  <Select
                                    showSearch
                                    allowClear
                                    placeholder="Antibiotic"
                                    optionFilterProp="label"
                                    options={antibioticOptions}
                                    disabled={disabled}
                                    listHeight={260}
                                  />
                                </Form.Item>
                                <Form.Item
                                  name={[rowField.name, 'interpretation']}
                                  rules={[
                                    {
                                      required: true,
                                      message: 'Required',
                                    },
                                  ]}
                                  style={{ marginBottom: 0 }}
                                >
                                  <Select
                                    placeholder="S/I/R"
                                    options={interpretationOptions.map((value) => ({
                                      label: value,
                                      value,
                                    }))}
                                    disabled={disabled}
                                  />
                                </Form.Item>
                                <Form.Item
                                  name={[rowField.name, 'mic']}
                                  style={{ marginBottom: 0 }}
                                >
                                  <Input placeholder={micUnit || 'MIC'} disabled={disabled} />
                                </Form.Item>
                                <Button
                                  type="text"
                                  danger
                                  icon={<DeleteOutlined />}
                                  disabled={disabled}
                                  onClick={() => removeRow(rowField.name)}
                                />
                              </div>
                            ))}
                          </div>
                          <Button
                            type="dashed"
                            size="small"
                            icon={<PlusOutlined />}
                            disabled={disabled}
                            style={{ marginTop: 6 }}
                            onClick={() =>
                              addRow({
                                antibioticId: undefined,
                                interpretation: undefined,
                                mic: '',
                              })
                            }
                          >
                            Add antibiotic row
                          </Button>
                        </div>
                      )}
                    </Form.List>
                  </Card>
                ))}
                <Button
                  type="dashed"
                  block
                  icon={<PlusOutlined />}
                  disabled={disabled}
                  onClick={() =>
                    addIsolate({
                      isolateKey: `isolate-${Date.now()}`,
                      organism: '',
                      source: '',
                      condition: '',
                      colonyCount: '',
                      comment: '',
                      antibiotics: [],
                    })
                  }
                >
                  Add isolate
                </Button>
              </>
            )}
          </Form.List>
        </>
      )}
    </div>
  );
}
