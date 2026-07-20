import React from 'react';
import ReactDOM from 'react-dom/client';
import { App, Page } from 'zmp-ui';
import 'zmp-ui/zaui.css';
import IndexPage from './pages/index';

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <App>
      <Page>
        <IndexPage />
      </Page>
    </App>
  </React.StrictMode>
);
