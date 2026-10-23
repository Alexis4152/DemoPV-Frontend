import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { NotifyProvider } from './context/NotifyContext'
import PrivateRoute from './components/PrivateRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import ChangePasswordRequired from './pages/ChangePasswordRequired'
import AcceptLegalTerms from './pages/AcceptLegalTerms'
import SelectTienda from './pages/SelectTienda'
import Dashboard from './pages/Dashboard'
import Inventory from './pages/Inventory'
import RawMaterials from './pages/RawMaterials'
import POS from './pages/POS'
import Sales from './pages/Sales'
import Reports from './pages/Reports'
import CashCuts from './pages/CashCuts'
import Users from './pages/Users'
import Roles from './pages/Roles'
import Categories from './pages/Categories'
import Appearance from './pages/Appearance'
import StoreInfo from './pages/StoreInfo'
import MailSettings from './pages/MailSettings'
import Maintenance from './pages/Maintenance'
import Apartados from './pages/Apartados'
import PublicApartar from './pages/PublicApartar'
import ArcoRequest from './pages/ArcoRequest'
import ArcoTracking from './pages/ArcoTracking'
import ArcoRequests from './pages/ArcoRequests'
import MyArcoRequests from './pages/MyArcoRequests'
import PrivacyHub from './pages/PrivacyHub'
import PrivacyNotice from './pages/PrivacyNotice'
import TermsAndConditions from './pages/TermsAndConditions'
import DeleteAccount from './pages/DeleteAccount'

/**
 * Árbol de rutas de la aplicación.
 *
 * `/login`, `/forgot-password` y `/reset-password` son públicas, igual que
 * `/apartar/:slug` (la tienda pública de apartados, `PublicApartar.jsx`) — esta última a
 * propósito FUERA del `Layout`/`PrivateRoute`: es la única pantalla que un cliente final
 * visita sin cuenta ni login, y no debe llevar sidebar ni exigir sesión. `/change-password`
 * SÍ exige sesión (usa `PrivateRoute` sin `section`) pero vive fuera del `Layout`, sin
 * sidebar — es la pantalla obligatoria que ve un usuario con `mustChangePassword` (dado de
 * alta con contraseña temporal); `PrivateRoute` la usa como destino de rebote sin importar
 * qué otra ruta se haya pedido (ver su propio JSDoc). `/accept-legal-terms` es análoga,
 * para la aceptación obligatoria de Términos/Aviso de privacidad en el primer login
 * (`user.mustAcceptLegalTerms`). `/select-tienda` es el mismo caso
 * pero para SUPER_ADMIN sin ninguna tienda elegida (`user.tienda` sigue `null` — ver
 * `AuthContext#selectTienda`): también exige sesión, también vive fuera del `Layout`, y
 * `PrivateRoute` también rebota aquí desde cualquier otra ruta mientras no haya elegido
 * una. `/arco` es el mismo caso que `/apartar/:slug` (público, sin `Layout`, sin sesión)
 * pero para solicitudes de derechos ARCO — no depende de ninguna tienda, por eso no lleva
 * `:slug`; se enlaza desde `Login.jsx`. `/my-arco-requests` ("Mis solicitudes") SÍ exige
 * sesión pero no `section` ni `adminOnly`/`superAdminOnly`: cualquier rol puede ver su
 * propio historial, no es un permiso de tienda. Todo lo demás vive bajo un `PrivateRoute` genérico (solo exige sesión iniciada) que
 * envuelve el `Layout` (sidebar + contenido), y dentro de este cada ruta hija está envuelta
 * en su propio `PrivateRoute` con `section` (código de `AppSection` para el chequeo fino de
 * permisos RBAC) o `adminOnly` (para pantallas reservadas al administrador de la tienda,
 * fuera del catálogo de `AppSection`: Categorías, Apariencia y Datos de la tienda — un
 * SUPER_ADMIN/SUPERVISOR actuando cuenta igual que el ADMIN de esa tienda).
 * Cualquier ruta no reconocida redirige a `/`.
 */
function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/apartar/:slug" element={<PublicApartar />} />
      <Route path="/arco" element={<ArcoRequest />} />
      <Route path="/arco/seguimiento/:token" element={<ArcoTracking />} />
      <Route path="/privacidad" element={<PrivacyHub />} />
      <Route path="/aviso-de-privacidad" element={<PrivacyNotice />} />
      <Route path="/terminos" element={<TermsAndConditions />} />
      <Route path="/eliminar-cuenta" element={<DeleteAccount />} />
      <Route path="/change-password" element={<PrivateRoute><ChangePasswordRequired /></PrivateRoute>} />
      <Route path="/accept-legal-terms" element={<PrivateRoute><AcceptLegalTerms /></PrivateRoute>} />
      <Route path="/select-tienda" element={<PrivateRoute><SelectTienda /></PrivateRoute>} />
      <Route
        path="/*"
        element={
          <PrivateRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<PrivateRoute section="DASHBOARD"><Dashboard /></PrivateRoute>} />
                <Route path="/pos" element={<PrivateRoute section="POS"><POS /></PrivateRoute>} />
                <Route path="/inventory" element={<PrivateRoute section="INVENTORY"><Inventory /></PrivateRoute>} />
                <Route path="/raw-materials" element={<PrivateRoute section="RAW_MATERIALS"><RawMaterials /></PrivateRoute>} />
                <Route path="/sales" element={<PrivateRoute section="SALES"><Sales /></PrivateRoute>} />
                <Route path="/cash-cuts" element={<PrivateRoute section="CASH_CUTS"><CashCuts /></PrivateRoute>} />
                <Route path="/apartados" element={<PrivateRoute section="APARTADOS"><Apartados /></PrivateRoute>} />
                <Route path="/reports" element={<PrivateRoute section="REPORTS"><Reports /></PrivateRoute>} />
                <Route path="/users" element={<PrivateRoute section="USERS"><Users /></PrivateRoute>} />
                <Route path="/roles" element={<PrivateRoute section="ROLES"><Roles /></PrivateRoute>} />
                <Route path="/categories" element={<PrivateRoute adminOnly><Categories /></PrivateRoute>} />
                <Route path="/appearance" element={<PrivateRoute adminOnly><Appearance /></PrivateRoute>} />
                <Route path="/store-info" element={<PrivateRoute adminOnly><StoreInfo /></PrivateRoute>} />
                <Route path="/mail-config" element={<PrivateRoute superAdminOnly><MailSettings /></PrivateRoute>} />
                <Route path="/maintenance" element={<PrivateRoute superAdminOnly><Maintenance /></PrivateRoute>} />
                <Route path="/arco-requests" element={<PrivateRoute superAdminOnly><ArcoRequests /></PrivateRoute>} />
                <Route path="/my-arco-requests" element={<PrivateRoute><MyArcoRequests /></PrivateRoute>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          </PrivateRoute>
        }
      />
    </Routes>
  )
}

/**
 * Componente raíz de la aplicación.
 *
 * Envuelve todo el árbol en `BrowserRouter` → `AuthProvider` (sesión/RBAC/tienda)
 * → `NotifyProvider` (toasts y confirmaciones) → {@link AppRoutes}, de forma que
 * cualquier componente descendiente tiene acceso a `useAuth()` y `useNotify()`.
 */
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotifyProvider>
          <AppRoutes />
        </NotifyProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
