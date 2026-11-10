import { lazy } from 'react'
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { Layout } from './components/Layout'
import { EmptyState } from './components/ui'
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })))
const LiveMonitoring = lazy(() => import('./pages/LiveMonitoring').then((m) => ({ default: m.LiveMonitoring })))
const RiskAnalysis = lazy(() => import('./pages/RiskAnalysis').then((m) => ({ default: m.RiskAnalysis })))
const Alerts = lazy(() => import('./pages/Alerts').then((m) => ({ default: m.Alerts })))
const IncidentHistory = lazy(() => import('./pages/IncidentHistory').then((m) => ({ default: m.IncidentHistory })))
const IncidentDetails = lazy(() => import('./pages/IncidentDetails').then((m) => ({ default: m.IncidentDetails })))
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })))

function NotFound() {
  return <EmptyState title="Page not found" action={<Link to="/" className="btn btn-primary">Go to dashboard</Link>} />
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="live" element={<LiveMonitoring />} />
            <Route path="analysis" element={<RiskAnalysis />} />
            <Route path="alerts" element={<Alerts />} />
            <Route path="incidents" element={<IncidentHistory />} />
            <Route path="incidents/:id" element={<IncidentDetails />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  )
}
