import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'sonner';
import { App } from './App';
import './styles/index.css';
import {
  configureErrorHandling,
  handleAppError,
  handleQueryError,
} from '@/shared/lib/errors';
import { useThemeStore } from '@/shared/theme';

const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error) => {
      handleAppError(error);
    },
  }),
  queryCache: new QueryCache({
    onError: (error) => {
      handleQueryError(error);
    },
  }),
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

configureErrorHandling({ queryClient });

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
      <ThemedToaster />
    </QueryClientProvider>
  </React.StrictMode>,
);
