import { Box, Typography } from 'antd';
import { useTranslation } from 'react-i18next';

const { Title, Paragraph } = Typography;

export const Page = ({ title }: { title: string }) => {
  const { t } = useTranslation();
  const translatedTitle = t(title);
  return (
    <Box padding={32}>
      <Title level={1}>{translatedTitle}</Title>
      <Paragraph>Chào mừng bạn đến với Vexim Operations Platform</Paragraph>
    </Box>
  );
};
