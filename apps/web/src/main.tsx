import { SpeedInsights } from '@vercel/speed-insights/react';
import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'sonner';
import { App } from './App';
import './index.css';
import { notify } from './lib/notify';
import { useThemeStore } from './stores/themeStore';

const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error) => {
      notify.error(
        'Hiba történt a művelet végrehajtása közben',
        (error as Error).message || 'Ismeretlen hiba lépett fel.',
      );
    },
  }),
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const ThemedToaster: React.FC = () => {
  const { theme } = useThemeStore();
  return (
    <Toaster
      position="bottom-right"
      theme={theme}
      richColors
      closeButton
      expand={true}
      toastOptions={{
        className: 'font-sans',
      }}
    />
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <SpeedInsights />
      <ThemedToaster />
    </QueryClientProvider>
  </React.StrictMode>,
);
