import { Menu, Drawer } from 'antd';
import { useState } from 'react';
import { useAuthRole } from '../lib/auth';

const menuItems: Record<'admin'|'operator'|'viewer'|'auditor', { key: string; title: string; icon: string }[]> = {
  admin: [
    { key: 'dashboard', title: 'Trang chủ', icon: 'dashboard' },
    { key: 'profit', title: 'Lợi nhuận & Doanh thu', icon: 'financial' },
    { key: 'inventory', title: 'Tồn kho & BổSupply', icon: 'caretup' },
    { key: 'review', title: 'Review & Khách hàng', icon: 'smile' },
    { key: 'recommend', title: 'Khuyến nghị AI', icon: 'gift' },
    { key: 'audit', title: 'Nhật ký audit', icon: 'warning' },
    { key: 'setting', title: 'Cài đặt', icon: 'setting' }
  ],
  operator: [
    { key: 'dashboard', title: 'Trang chủ', icon: 'dashboard' },
    { key: 'profit', title: 'Lợi nhuận & Doanh thu', icon: 'financial' },
    { key: 'inventory', title: 'Tồn kho & BổSupply', icon: 'caretup' },
    { key: 'recommend', title: 'Khuyến nghị AI', icon: 'gift' },
  ],
  viewer: [
    { key: 'dashboard', title: 'Trang chủ', icon: 'dashboard' },
  ],
  auditor: [
    { key: 'audit', title: 'Nhật ký audit', icon: 'warning' },
    { key: 'export', title: 'Xuất báo cáo', icon: 'download' }
  ]
};

export default function Sidebar({ role }: { role: 'admin'|'operator'|'viewer'|'auditor' }) {
  const items = menuItems[role] ?? menuItems.viewer;
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)} style={{ marginBottom: '10px' }}>📦 Menu</button>
      <Drawer
        title="Vexim Operations"
        visible={open}
        onClose={() => setOpen(false)}
        width={300}
      >
        <Menu
          mode="inline"
          items={items.map(item => ({
            key: item.key,
            label: <span>{item.title}</span>,
            icon: <i>{item.icon}</i>,
            onClick: () => {
              // navigate using router
              // we simply close drawer; routing handled by Routes
              setOpen(false);
            }
          }))
        />
      </Drawer>
    </>
  );
}
