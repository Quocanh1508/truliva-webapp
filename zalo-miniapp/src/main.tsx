import React, { Component, ErrorInfo, ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { App, ZMPRouter, AnimationRoutes, Page } from 'zmp-ui';
import { Route } from 'react-router-dom';
import 'zmp-ui/zaui.css';
import IndexPage from './pages/index';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught Zalo Mini App Error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, color: '#dc2626', fontFamily: 'sans-serif', fontSize: 13 }}>
          <h3 style={{ fontWeight: 'bold', fontSize: 16 }}>Đã xảy ra lỗi khởi chạy Zalo Mini App</h3>
          <p style={{ marginTop: 8, color: '#4b5563' }}>{this.state.error?.message || 'Lỗi không xác định'}</p>
          <button 
            onClick={() => window.location.reload()}
            style={{ marginTop: 16, padding: '10px 16px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 'bold' }}
          >
            Tải lại ứng dụng
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const MyApp = () => {
  return (
    <ErrorBoundary>
      <App>
        <ZMPRouter>
          <AnimationRoutes>
            <Route path="/" element={<Page><IndexPage /></Page>} />
            <Route path="/pages/index" element={<Page><IndexPage /></Page>} />
            <Route path="*" element={<Page><IndexPage /></Page>} />
          </AnimationRoutes>
        </ZMPRouter>
      </App>
    </ErrorBoundary>
  );
};

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <MyApp />
  </React.StrictMode>
);
