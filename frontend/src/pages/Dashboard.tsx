import { Page } from '../components/Page';
import { KPICard } from '../components/KPICard';
import { useEffect } from 'react';
import { supa } from '../lib/supabase';
import { useAuthRole } from '../lib/auth';

export default function Dashboard() {
  const role = useAuthRole();
  const [kpis, setKpis] = useState<any[]>([]);

  useEffect(() => {
    // Fetch KPI data from Supabase view (example)
    // In real app, you'd query the API.
    // For now, placeholder data.
    const placeholder = [
      { title: 'Doanh thu net', value: '125 000 000', subtitle: 'VNĐ', suffix: 'VNĐ' },
      { title: 'Margin góp phần', value: '30 %', subtitle: 'Tỷ lệ', suffix: '%' },
      { title: 'Tốc độ bán', value: '45', subtitle: 'units/ngày', suffix: '' },
      { title: 'Stockout risk', value: 'Low', subtitle: 'Cảnh báo', suffix: '' },
      { title: 'Review tiêu cực', value: '5', subtitle: 'hôm nay', suffix: '' }
    ];
    setKpis(placeholder);
  }, []);

  return (
    <Page title={i18n.t('dashboard.title')}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {kpis.map((k, i) => <KPICard key={i} {...k} />)}
      </div>
  );
}
