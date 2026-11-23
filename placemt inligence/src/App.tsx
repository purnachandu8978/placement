import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { StudentDataProvider } from './context/StudentDataContext';
import { ToastProvider } from './context/ToastContext';
import { NotificationProvider } from './context/NotificationContext';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ScrollManager } from './components/common/ScrollManager';
import { AppRouter } from './routes/AppRouter';

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <StudentDataProvider>
          <NotificationProvider>
            <ToastProvider>
              <BrowserRouter>
                <ScrollManager />
                <AppRouter />
              </BrowserRouter>
            </ToastProvider>
          </NotificationProvider>
        </StudentDataProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
