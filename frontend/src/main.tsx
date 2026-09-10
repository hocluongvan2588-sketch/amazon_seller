import { createRoot } from 'react-dom/client';
import { Provider } from 'react-i18next';
import i18n from './i18n';
import App from './App';

const root = document.getElementById('root') as HTMLDivElement;
createRoot(root).render(
  <React.StrictMode>
    <Provider i18n={i18n}>
      <App />
    </Provider>
  </React.StrictMode>
);
