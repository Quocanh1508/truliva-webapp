import React from 'react';
import ReactDOM from 'react-dom/client';
import { App, ZMPRouter, AnimationRoutes, Page } from 'zmp-ui';
import { Route } from 'react-router-dom';
import 'zmp-ui/zaui.css';
import IndexPage from './pages/index';

const MyApp = () => {
  return (
    <App>
      <ZMPRouter>
        <AnimationRoutes>
          <Route path="/" element={<Page><IndexPage /></Page>} />
        </AnimationRoutes>
      </ZMPRouter>
    </App>
  );
};

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <MyApp />
  </React.StrictMode>
);
