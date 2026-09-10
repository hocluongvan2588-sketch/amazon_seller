import { Statistic } from 'antd';
import moment from 'moment';
import 'moment/locale/vi';

moment.locale('vi');

export const KPICard = ({ title, value, subtitle, suffix = '' }) => {
  return (
    <Statistic
      title={title}
      value={value}
      suffix={suffix}
      className="kpi-card"
    >
      <span className="kpi-subtitle">{subtitle}</span>
    </Statistic>
  );
};
