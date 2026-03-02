import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Dashboard from './views/Dashboard';
import Movements from './views/Movements';
import NewTransaction from './views/NewTransaction';
import Wallet from './views/Wallet';
import ClientInvoices from './views/ClientInvoices';
import CreateInvoiceWizard from './views/CreateInvoiceWizard';
import CreateAbonoWizard from './views/CreateAbonoWizard';
import InvoiceAbonos from './views/InvoiceAbonos';
import Reports from './views/Reports';
import Login from './views/Login';
import { isAuthenticated } from './auth';
import AdminUsers from './views/AdminUsers';
import AdminCategories from './views/AdminCategories';
import CashoutPOS from './views/CashoutPOS';
import BankWithdrawal from './views/BankWithdrawal';
import Gastos from './views/Gastos';
import Pedidos from './views/Pedidos';
import Payroll from './views/Payroll';
import Billing from './views/Billing';
import BillingWizard from './views/BillingWizard';
import BillingReport from './views/BillingReport';
import { RoleProvider, useRole } from './context/RoleContext';
import PayrollSignPublic from './views/PayrollSignPublic';

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background-color)] text-[var(--text-secondary-color)]">
      Cargando...
    </div>
  );
}

function DefaultProtectedRoute() {
  const { loading } = useRole();

  if (loading) return <LoadingScreen />;

  return <Navigate to="/dashboard" replace />;
}

function App() {
  return (
    <RoleProvider>
      <Routes>
        <Route path="/" element={<RequireAuth><DefaultProtectedRoute /></RequireAuth>} />
        <Route path="/login" element={<Login />} />
        <Route path="/firma/:token" element={<PayrollSignPublic />} />

        <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/movements" element={<RequireAuth><Movements /></RequireAuth>} />
        <Route path="/new" element={<RequireAuth><NewTransaction /></RequireAuth>} />
        <Route path="/wallet" element={<RequireAuth><Wallet /></RequireAuth>} />
        <Route path="/wallet/client/:id/invoices" element={<RequireAuth><ClientInvoices /></RequireAuth>} />
        <Route path="/wallet/client/:id/invoices/new" element={<RequireAuth><CreateInvoiceWizard /></RequireAuth>} />
        <Route path="/wallet/client/:id/abonos/new" element={<RequireAuth><CreateAbonoWizard /></RequireAuth>} />
        <Route path="/wallet/client/:clientId/invoices/:invoiceId/abonos" element={<RequireAuth><InvoiceAbonos /></RequireAuth>} />
        <Route path="/cashout" element={<RequireAuth><CashoutPOS /></RequireAuth>} />
        <Route path="/cashout-bank" element={<RequireAuth><BankWithdrawal /></RequireAuth>} />
        <Route path="/gastos" element={<RequireAuth><Gastos /></RequireAuth>} />
        <Route path="/pedidos" element={<RequireAuth><Pedidos /></RequireAuth>} />
        <Route path="/payroll" element={<RequireAuth><Payroll /></RequireAuth>} />
        <Route path="/billing" element={<RequireAuth><Billing /></RequireAuth>} />
        <Route path="/billing/generate" element={<RequireAuth><BillingWizard /></RequireAuth>} />
        <Route path="/billing/report" element={<RequireAuth><BillingReport /></RequireAuth>} />
        <Route path="/reports" element={<RequireAuth><Reports /></RequireAuth>} />

        <Route path="/admin/users" element={<RequireAuth><AdminUsers /></RequireAuth>} />
        <Route path="/admin/categories" element={<RequireAuth><AdminCategories /></RequireAuth>} />

        <Route path="*" element={<RequireAuth><DefaultProtectedRoute /></RequireAuth>} />
      </Routes>
    </RoleProvider>
  );
}

export default App;

function RequireAuth({ children }) {
  const location = useLocation();

  if (!isAuthenticated()) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
