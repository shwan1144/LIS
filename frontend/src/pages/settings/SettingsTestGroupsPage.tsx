import { useState, useEffect } from 'react';
import {
    Card,
    Table,
    Button,
    Space,
    message,
    Modal,
    Form,
    Input,
    Typography,
    Popconfirm,
    Select,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, AppstoreAddOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { getLabSettings, updateLabSettings, getTests, type TestDto } from '../../api/client';

const { Title, Text } = Typography;

export function SettingsTestGroupsPage() {
    const [testGroups, setTestGroups] = useState<{ id: string; name: string; testIds: string[] }[]>([]);
    const [testOptions, setTestOptions] = useState<TestDto[]>([]);
    const [loading, setLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingGroup, setEditingGroup] = useState<{ id: string; name: string; testIds: string[] } | null>(null);
    const [form] = Form.useForm();

    const load = async () => {
        setLoading(true);
        try {
            const [settings, tests] = await Promise.all([
                getLabSettings(),
                getTests(),
            ]);
            setTestGroups(settings.uiTestGroups || []);
            setTestOptions(tests.filter(t => t.isActive));
        } catch {
            message.error('Failed to load test groups or tests');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const openModal = (group?: { id: string; name: string; testIds: string[] }) => {
        if (group) {
            setEditingGroup(group);
            form.setFieldsValue({ name: group.name, testIds: group.testIds || [] });
        } else {
            setEditingGroup(null);
            form.resetFields();
        }
        setModalOpen(true);
    };

    const handleSubmit = async (values: { name: string; testIds: string[] }) => {
        try {
            let updatedGroups;
            if (editingGroup) {
                updatedGroups = testGroups.map(g =>
                    g.id === editingGroup.id
                        ? { ...g, name: values.name.trim(), testIds: values.testIds }
                        : g
                );
            } else {
                updatedGroups = [
                    ...testGroups,
                    {
                        id: Math.random().toString(36).substring(2, 9),
                        name: values.name.trim(),
                        testIds: values.testIds || [],
                    }
                ];
            }

            await updateLabSettings({ uiTestGroups: updatedGroups });
            message.success(editingGroup ? 'Test group updated' : 'Test group created');
            setModalOpen(false);
            load();
        } catch {
            message.error('Failed to save test group');
        }
    };

    const handleDelete = async (id: string) => {
        try {
            const updatedGroups = testGroups.filter(g => g.id !== id);
            await updateLabSettings({ uiTestGroups: updatedGroups });
            message.success('Test group deleted');
            load();
        } catch {
            message.error('Failed to delete test group');
        }
    };



    const columns: ColumnsType<{ id: string; name: string; testIds: string[] }> = [
        { title: 'Name', dataIndex: 'name', key: 'name', width: 300, render: (n) => <strong>{n}</strong> },
        {
            title: 'Tests Included',
            key: 'testIds',
            render: (_, r) => {
                const safeTestIds = r.testIds || [];
                const tests = safeTestIds.map(id => testOptions.find(t => t.id === id)).filter(Boolean) as TestDto[];
                if (tests.length === 0) return <Text type="secondary">No active tests</Text>;
                return (
                    <Space wrap size={[0, 4]}>
                        {tests.map(t => (
                            <span key={t.id} style={{ background: '#f0f0f0', padding: '2px 8px', borderRadius: 4, marginRight: 4, display: 'inline-block' }}>
                                {t.code}
                            </span>
                        ))}
                    </Space>
                );
            }
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 150,
            render: (_, r) => (
                <Space>
                    <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openModal(r)}>
                        Edit
                    </Button>
                    <Popconfirm
                        title="Delete this test group?"
                        description="This will remove the group button from the Orders page."
                        onConfirm={() => handleDelete(r.id)}
                        okText="Delete"
                        okButtonProps={{ danger: true }}
                    >
                        <Button type="link" danger size="small" icon={<DeleteOutlined />}>
                            Delete
                        </Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <div>
            <Title level={4}>
                <AppstoreAddOutlined style={{ marginRight: 8 }} />
                Test Groups
            </Title>
            <Card>
                <div style={{ marginBottom: 16 }}>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
                        Add test group
                    </Button>
                </div>
                <Table
                    rowKey="id"
                    columns={columns}
                    dataSource={testGroups}
                    loading={loading}
                    pagination={false}
                    size="middle"
                />
            </Card>

            <Modal
                title={editingGroup ? 'Edit test group' : 'Add test group'}
                open={modalOpen}
                onCancel={() => setModalOpen(false)}
                onOk={() => form.submit()}
                okText={editingGroup ? 'Update' : 'Create'}
                width={600}
            >
                <Form form={form} layout="vertical" onFinish={handleSubmit}>
                    <Form.Item
                        name="name"
                        label="Group Name"
                        rules={[{ required: true, message: 'Group name is required' }]}
                    >
                        <Input placeholder="e.g., LFT, Thyroid Panel, Routine Checkup" />
                    </Form.Item>
                    <Form.Item
                        name="testIds"
                        label="Tests in Group"
                        rules={[{ required: true, message: 'Please select at least one test' }]}
                    >
                        <Select
                            mode="multiple"
                            showSearch
                            placeholder="Search and select tests..."
                            style={{ width: '100%' }}
                            filterOption={(input, option) =>
                                (option?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())
                            }
                            options={testOptions.map((t) => ({
                                value: t.id,
                                label: `${t.code} - ${t.name}`,
                            }))}
                        />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
