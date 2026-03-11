import { Form, Input, Radio, InputNumber, Select, Space } from 'antd';
import type { CreatePatientDto, PatientDto } from '../../api/client';
import { calculateDobFromAge, getAgeFromDob, type AgeUnit } from '../../utils/patient-age';
import { useEffect } from 'react';

export type PatientFormValues = {
  fullName: string;
  nationalId?: string;
  phone?: string;
  dateOfBirth?: string;
  ageValue?: number;
  ageUnit?: AgeUnit;
  sex?: string;
  address?: string;
};

export const PATIENT_FORM_TODAY_ISO = new Date(
  Date.now() - new Date().getTimezoneOffset() * 60_000,
)
  .toISOString()
  .slice(0, 10);

export function PatientFormFields() {
  return (
    <>
      <Form.Item
        name="fullName"
        label="Full name"
        rules={[{ required: true, message: 'Required' }]}
      >
        <Input placeholder="Full name" />
      </Form.Item>
      <Form.Item name="nationalId" label="National ID">
        <Input placeholder="National ID" />
      </Form.Item>
      <Form.Item name="phone" label="Phone">
        <Input placeholder="Phone" />
      </Form.Item>
      <Form.Item name="dateOfBirth" label="Date of birth">
        <Input type="date" max={PATIENT_FORM_TODAY_ISO} />
      </Form.Item>
      <Form.Item label="Age">
        <AgeSyncFields />
      </Form.Item>
      <Form.Item name="sex" label="Sex">
        <Radio.Group buttonStyle="solid">
          <Radio.Button value="M">Male</Radio.Button>
          <Radio.Button value="F">Female</Radio.Button>
          <Radio.Button value="O">Other</Radio.Button>
        </Radio.Group>
      </Form.Item>
      <Form.Item name="address" label="Address">
        <Input.TextArea rows={2} placeholder="Address" />
      </Form.Item>
    </>
  );
}

function AgeSyncFields() {
  const form = Form.useFormInstance<PatientFormValues>();
  const ageValue = Form.useWatch('ageValue', form);
  const ageUnit = Form.useWatch('ageUnit', form);
  const dob = Form.useWatch('dateOfBirth', form);

  // Sync Age -> DOB
  useEffect(() => {
    if (ageValue !== undefined && ageValue !== null && ageUnit) {
      const calculatedDob = calculateDobFromAge(ageValue, ageUnit);
      if (calculatedDob !== form.getFieldValue('dateOfBirth')) {
        form.setFieldsValue({ dateOfBirth: calculatedDob });
      }
    }
  }, [ageValue, ageUnit, form]);

  // Sync DOB -> Age
  useEffect(() => {
    if (dob) {
      const age = getAgeFromDob(dob);
      if (age) {
        if (age.value !== form.getFieldValue('ageValue') || age.unit !== form.getFieldValue('ageUnit')) {
          form.setFieldsValue({ ageValue: age.value, ageUnit: age.unit });
        }
      }
    } else {
      // If DOB is cleared, clear Age too (optional)
      if (form.getFieldValue('ageValue') !== undefined) {
        form.setFieldsValue({ ageValue: undefined });
      }
    }
  }, [dob, form]);

  return (
    <Space.Compact style={{ width: '100%' }}>
      <Form.Item name="ageValue" noStyle>
        <InputNumber min={0} placeholder="Age" style={{ width: '60%' }} />
      </Form.Item>
      <Form.Item name="ageUnit" noStyle>
        <Select style={{ width: '40%' }}>
          <Select.Option value="year">Years</Select.Option>
          <Select.Option value="month">Months</Select.Option>
          <Select.Option value="day">Days</Select.Option>
        </Select>
      </Form.Item>
    </Space.Compact>
  );
}

export function getPatientFormInitialValues(
  patient?: PatientDto | null,
): PatientFormValues {
  const dateOfBirth = patient?.dateOfBirth ?? undefined;
  const age = dateOfBirth ? getAgeFromDob(dateOfBirth) : null;

  return {
    fullName: patient?.fullName ?? '',
    nationalId: patient?.nationalId ?? '',
    phone: patient?.phone ?? '',
    dateOfBirth,
    ageValue: age?.value,
    ageUnit: age?.unit ?? 'year',
    sex: patient?.sex ?? undefined,
    address: patient?.address ?? '',
  };
}

export function normalizePatientFormPayload(
  values: PatientFormValues,
): CreatePatientDto {
  return {
    fullName: values.fullName.trim(),
    nationalId: values.nationalId?.trim() || undefined,
    phone: values.phone?.trim() || undefined,
    sex: values.sex || undefined,
    address: values.address?.trim() || undefined,
    dateOfBirth: values.dateOfBirth || undefined,
  };
}
