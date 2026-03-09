import { Form, Input, Radio } from 'antd';
import type { CreatePatientDto, PatientDto } from '../../api/client';

export type PatientFormValues = {
  fullName: string;
  nationalId?: string;
  phone?: string;
  dateOfBirth?: string;
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

export function getPatientFormInitialValues(
  patient?: PatientDto | null,
): PatientFormValues {
  return {
    fullName: patient?.fullName ?? '',
    nationalId: patient?.nationalId ?? '',
    phone: patient?.phone ?? '',
    dateOfBirth: patient?.dateOfBirth ?? undefined,
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
