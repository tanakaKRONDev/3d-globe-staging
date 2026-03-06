import '@fontsource/roboto/300.css'
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/500.css'
import '@fontsource/roboto/700.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.tsx'
import { AdminErrorBoundary } from './components/admin/AdminErrorBoundary'
import { AdminPage } from './pages/AdminPage'
import { AdminLogsPage } from './pages/AdminLogsPage'
import './styles/tokens.css'
import './styles/theme.css'
import './styles/admin.css'
import './index.css'
import { installTokenlessGuardrails } from './lib/cesium/tokenlessGuardrails'

installTokenlessGuardrails()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/admin" element={<AdminErrorBoundary><AdminPage /></AdminErrorBoundary>} />
        <Route path="/admin/logs" element={<AdminErrorBoundary><AdminLogsPage /></AdminErrorBoundary>} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)