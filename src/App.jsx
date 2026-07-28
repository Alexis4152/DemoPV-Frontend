import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import PrivateRoute from './components/PrivateRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Inventory from './pages/Inventory'
import POS from './pages/POS'
import Sales from './pages/Sales'
import Reports from './pages/Reports'
import CashCuts from './pages/CashCuts'
import Users from './pages/Users'
import Roles from './pages/Roles'

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <PrivateRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<PrivateRoute section="DASHBOARD"><Dashboard /></PrivateRoute>} />
                <Route path="/pos" element={<PrivateRoute section="POS"><POS /></PrivateRoute>} />
                <Route path="/inventory" element={<PrivateRoute section="INVENTORY"><Inventory /></PrivateRoute>} />
                <Route path="/sales" element={<PrivateRoute section="SALES"><Sales /></PrivateRoute>} />
                <Route path="/cash-cuts" element={<PrivateRoute section="CASH_CUTS"><CashCuts /></PrivateRoute>} />
                <Route path="/reports" element={<PrivateRoute section="REPORTS"><Reports /></PrivateRoute>} />
                <Route path="/users" element={<PrivateRoute section="USERS"><Users /></PrivateRoute>} />
                <Route path="/roles" element={<PrivateRoute section="ROLES"><Roles /></PrivateRoute>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          </PrivateRoute>
        }
      />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
