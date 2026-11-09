import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { Modal, Form, Button, Alert, Spinner, InputGroup, Toast, ToastContainer as BSToastContainer } from 'react-bootstrap';
import { NotificationProvider, useNotifications } from './NotificationContext';
import Sidebar from './components/common/Sidebar';
import Header from './components/common/Header';
import Auth from './components/Auth';
import UsersView from './components/UsersView';
import Register from './components/Register';
import Dashboard from './components/Dashboard';
import { authAPI } from './services/api';
import GerantDashboard from './components/GerantDashboard';
import ShopsView from './components/ShopsView';
import ArticlesView from './components/ArticlesView';
import VentesView from './components/VentesView';
import SuppliersView from './components/SuppliersView';
import StockMovementsView from './components/StockMovementsView';
import ProfileView from './components/ProfileView';
import CentraleStockView from './components/CentraleStockView';
import StockStatusView from './components/StockStatusView';
import ClientsView from './components/ClientsView';
import NotificationsHistoryView from './components/NotificationsHistoryView';
import ProtectedRoute from './components/common/ProtectedRoute';
import AuditLogView from './components/AuditLogView';
import CaisseView from './components/CaisseView';
import AdminCaisseView from './components/AdminCaisseView';
import DebtManagementView from './components/DebtManagementView';
import GerantCaisseValidation from './components/GerantCaisseValidation';
import CashiersView from './components/CashiersView';
import './App.css';
import CaissierDashboard from './components/CaissierDashboard';
import CaissierCaisseView from './components/CaissierCaisseView';
import setupAxiosInterceptors from './utils/axiosConfig';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './assets/styles/global.css';
import './assets/styles/themes.css';
import ManagersView from './components/ManagersView';
import OnboardingSuccess from './components/OnboardingSuccess';
import OnboardingTour from './components/OnboardingTour';
import SuperAdminDashboard from './components/SuperAdminDashboard';
import AdminRegistrationValidation from './components/AdminRegistrationValidation';

function MainLayout({ userName, userRole, handleLogout, theme, toggleTheme, isSidebarOpen, toggleSidebar }) {
  return (
    <>
      <Sidebar userRole={userRole} isSidebarOpen={isSidebarOpen} toggleSidebar={toggleSidebar} userName={userName} handleLogout={handleLogout} theme={theme} toggleTheme={toggleTheme} />
      <div className="page-wrapper">
        <Header userName={userName} userRole={userRole} onLogout={handleLogout} theme={theme} toggleTheme={toggleTheme} toggleSidebar={toggleSidebar} />
        <Outlet context={{ theme }} />
        <OnboardingTour userRole={userRole} userName={userName} />
      </div>
    </>
  );
}

const NotificationToasts = () => {
  const { toastQueue, removeToast, markAsRead } = useNotifications();
  const navigate = useNavigate();

  const handleToastClick = (notification) => {
    if (!notification.read) {
      markAsRead(notification._id);
    }

    if (notification.link) {
      navigate(notification.link);
    } else {
      // ✅ CORRECTION : Rôles SQL
      const role = localStorage.getItem('userRole');
      const basePath = role === 'ADMIN' ? '/admin' : (role === 'MANAGER' ? '/gerant' : (role === 'CASHIER' ? '/caissier' : ''));
      if (basePath) {
        navigate(`${basePath}/notifications`);
      }
    }
    removeToast(notification._id);
  };

  return (
    <BSToastContainer position="bottom-end" className="p-3 notification-toasts-container" style={{ zIndex: 9999 }}>
      {toastQueue.map(toast => (
        <Toast key={toast._id} onClose={() => removeToast(toast._id)} onClick={() => handleToastClick(toast)} bg="dark" autohide delay={8000} className="text-white" style={{ cursor: 'pointer' }}>
          <Toast.Header closeButton><strong className="me-auto">Nouvelle Notification</strong></Toast.Header>
          <Toast.Body>{toast.message}</Toast.Body>
        </Toast>
      ))}
    </BSToastContainer>
  );
};

function App() {
  const [userRole, setUserRole] = useState(localStorage.getItem('token') ? localStorage.getItem('userRole') : null);
  const [userName, setUserName] = useState(localStorage.getItem('userName'));
  const [businessType, setBusinessType] = useState(localStorage.getItem('businessType') || null);
  const [mustChangePassword, setMustChangePassword] = useState(localStorage.getItem('mustChangePassword') === 'true');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    const storedTheme = localStorage.getItem('theme');
    return storedTheme || (localStorage.getItem('businessType') === 'Bar' ? 'dark' : 'light');
  });

  const [pwdData, setPwdData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [isApiLoading, setIsApiLoading] = useState(false);

  useEffect(() => {
    setupAxiosInterceptors(setIsApiLoading);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('sidebar-open', isSidebarOpen);
  }, [isSidebarOpen]);

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  const handleLogin = (newToken, id, role, name, boutique, mustChange, businessType) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('userRole', role);
    localStorage.setItem('userId', id);
    localStorage.setItem('userName', name);
    if (boutique) {
      localStorage.setItem('boutiqueId', typeof boutique === 'object' ? boutique._id : boutique);
    }
    if (businessType) localStorage.setItem('businessType', businessType);
    localStorage.setItem('mustChangePassword', mustChange ? 'true' : 'false');

    setUserRole(role);
    setUserName(name);
    setBusinessType(businessType);
    setMustChangePassword(mustChange);

    if (businessType === 'Bar') setTheme('dark');
  };

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userName');
    localStorage.removeItem('userId');
    localStorage.removeItem('boutiqueId');
    localStorage.removeItem('businessType');
    setBusinessType(null);
    localStorage.removeItem('mustChangePassword');
    window.location.href = '/login';
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (pwdData.newPassword !== pwdData.confirmPassword) {
      return setPwdError("Les nouveaux mots de passe ne correspondent pas.");
    }
    setPwdLoading(true);
    setPwdError('');
    try {
      await authAPI.changePassword({
        currentPassword: pwdData.currentPassword,
        newPassword: pwdData.newPassword
      });
      localStorage.removeItem('mustChangePassword');
      setPwdSuccess("Mot de passe changé avec succès ! Vous pouvez maintenant utiliser l'application.");

      setTimeout(() => {
        setMustChangePassword(false);
        setPwdSuccess('');
        setPwdData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      }, 2500);
    } catch (err) {
      setPwdError(err.response?.data?.message || "Erreur lors du changement de mot de passe.");
    } finally {
      setPwdLoading(false);
    }
  };

  // ✅ CORRECTION : Fonction de redirection adaptée aux rôles SQL Server
  const getRedirectPath = (role) => {
    const r = (role || '').toUpperCase();
    if (r === 'ADMIN' || r === 'SUPER_ADMIN') return "/admin";
    if (r === 'CASHIER') return "/caissier";
    if (r === 'MANAGER') return "/gerant";
    return "/login"; 
  };

  return (
    <NotificationProvider>
      {isApiLoading && <div className="top-loading-bar"></div>}
      <div id="main-wrapper" data-bs-theme={theme} className={businessType === 'Bar' ? 'bar-account-theme' : ''}>
        <Routes>
          {/* Route Connexion */}
          <Route path="/login" element={!userRole ? <Auth onLogin={handleLogin} /> : <Navigate to={getRedirectPath(userRole)} />} />

          {/* Route Inscription */}
          <Route path="/register" element={!userRole ? <Register /> : <Navigate to={getRedirectPath(userRole)} />} />
          <Route path="/register/success" element={<OnboardingSuccess />} />

          {/* ✅ CORRECTION : Routes Protégées Admin (Rôles SQL) */}
          <Route path="/admin" element={
            <ProtectedRoute userRole={userRole} requiredRole={['ADMIN', 'SUPER_ADMIN']}>
              {!mustChangePassword ? (
                <MainLayout userName={userName} userRole={userRole} handleLogout={handleLogout} theme={theme} toggleTheme={toggleTheme} isSidebarOpen={isSidebarOpen} toggleSidebar={toggleSidebar} />
              ) : (
                <div className="vh-100 d-flex align-items-center justify-content-center bg-light"><Spinner animation="border" variant="primary" /></div>
              )}
            </ProtectedRoute>
          } >
            <Route index element={userRole === 'SUPER_ADMIN' ? <SuperAdminDashboard /> : <Dashboard />} />
            <Route path="users" element={<UsersView />} />
            <Route path="managers" element={<ManagersView />} />
            <Route path="shops" element={<ShopsView />} />
            <Route path="articles" element={<ArticlesView userRole="Admin" />} />
            <Route path="etat-stock" element={<StockStatusView />} />
            <Route path="centrale" element={<CentraleStockView />} />
            <Route path="ventes" element={<VentesView userRole="Admin" />} />
            <Route path="fournisseurs" element={<SuppliersView />} />
            <Route path="mouvements" element={<StockMovementsView />} />
            <Route path="clients" element={<ClientsView />} />
            <Route path="notifications" element={<NotificationsHistoryView />} />
            <Route path="caisse" element={<AdminCaisseView />} />
            <Route path="creances" element={<DebtManagementView />} />
            <Route path="audit" element={<AuditLogView />} />
            <Route path="registrations/pending" element={userRole === 'SUPER_ADMIN' ? <AdminRegistrationValidation /> : <Navigate to="/admin" replace />} />
          </Route>

          {/* ✅ CORRECTION : Routes Protégées Gérant (Rôles SQL) */}
          <Route path="/gerant" element={
            <ProtectedRoute userRole={userRole} requiredRole={['MANAGER']}>
              {!mustChangePassword ? (
                <MainLayout userName={userName} userRole={userRole} handleLogout={handleLogout} theme={theme} toggleTheme={toggleTheme} isSidebarOpen={isSidebarOpen} toggleSidebar={toggleSidebar} />
              ) : (
                <div className="vh-100 d-flex align-items-center justify-content-center bg-light"><Spinner animation="border" variant="primary" /></div>
              )}
            </ProtectedRoute>
          } >
            <Route index element={<GerantDashboard />} />
            <Route path="articles" element={<ArticlesView userRole="Gérant" />} />
            <Route path="ventes" element={<VentesView userRole="Gérant" initialTab="sale" key="sale" />} />
            <Route path="historique" element={<VentesView userRole="Gérant" initialTab="history" key="history" />} />
            <Route path="clients" element={<ClientsView userRole="Gérant" />} />
            <Route path="notifications" element={<NotificationsHistoryView />} />
            <Route path="creances" element={<DebtManagementView />} />
            <Route path="caisse" element={<CaisseView />} />
            <Route path="validation-rapports" element={<GerantCaisseValidation />} />
            <Route path="cashiers" element={<CashiersView />} />
            <Route path="caisse/rapports-caissiers" element={<GerantCaisseValidation />} />
          </Route>

          {/* ✅ CORRECTION : Routes Protégées Caissier (Rôles SQL) */}
          <Route path="/caissier" element={
            <ProtectedRoute userRole={userRole} requiredRole={['CASHIER']}>
              {!mustChangePassword ? (
                <MainLayout userName={userName} userRole={userRole} handleLogout={handleLogout} theme={theme} toggleTheme={toggleTheme} isSidebarOpen={isSidebarOpen} toggleSidebar={toggleSidebar} />
              ) : (
                <div className="vh-100 d-flex align-items-center justify-content-center bg-light"><Spinner animation="border" variant="primary" /></div>
              )}
            </ProtectedRoute>
          } >
            <Route index element={<CaissierDashboard />} />
            <Route path="pos" element={<VentesView userRole="Caissier" initialTab="sale" />} />
            <Route path="ventes" element={<VentesView userRole="Caissier" initialTab="sale" />} />
            <Route path="caisse" element={<CaissierCaisseView />} />
            <Route path="creances" element={<DebtManagementView />} />
          </Route>

          {/* ✅ CORRECTION : Routes Partagées (Profil) */}
          <Route path="/profile" element={
            <ProtectedRoute userRole={userRole} requiredRole={['ADMIN', 'MANAGER', 'CASHIER', 'SUPER_ADMIN']}>
              <MainLayout userName={userName} userRole={userRole} handleLogout={handleLogout} theme={theme} toggleTheme={toggleTheme} isSidebarOpen={isSidebarOpen} toggleSidebar={toggleSidebar} />
            </ProtectedRoute>
          }>
            <Route index element={<ProfileView />} />
          </Route>

          <Route path="/" element={<Navigate to={!userRole ? "/login" : getRedirectPath(userRole)} />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
        {userRole && <NotificationToasts />}
        <ToastContainer position="top-right" autoClose={5000} hideProgressBar={false} newestOnTop={true} closeOnClick rtl={false} pauseOnFocusLoss draggable pauseOnHover theme="colored" />
      </div>

      {/* Modale de changement de mot de passe obligatoire */}
      <Modal show={!!userRole && mustChangePassword} backdrop="static" keyboard={false} centered>
        <Modal.Header>
          <Modal.Title className="text-danger">🔒 Changement de mot de passe requis</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handlePasswordChange}>
          <Modal.Body>
            {pwdSuccess ? (
              <Alert variant="success" className="text-center">
                <iconify-icon icon="solar:check-circle-bold" style={{ fontSize: '48px' }} className="mb-2"></iconify-icon>
                <h5 className="fw-bold">Succès !</h5>
                <p>{pwdSuccess}</p>
              </Alert>
            ) : (
              <>
                <Alert variant="warning">
                  Pour votre sécurité, vous devez changer votre mot de passe par défaut avant de continuer.
                </Alert>
                {pwdError && <Alert variant="danger">{pwdError}</Alert>}

                <Form.Group className="mb-3">
                  <Form.Label>Mot de passe actuel</Form.Label>
                  <InputGroup>
                    <Form.Control type={showCurrentPwd ? "text" : "password"} required
                      value={pwdData.currentPassword}
                      onChange={(e) => setPwdData({ ...pwdData, currentPassword: e.target.value })}
                    />
                    <Button variant="outline-secondary" onClick={() => setShowCurrentPwd(!showCurrentPwd)}>
                      <iconify-icon icon={showCurrentPwd ? "solar:eye-bold" : "solar:eye-closed-bold"}></iconify-icon>
                    </Button>
                  </InputGroup>
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Nouveau mot de passe</Form.Label>
                  <InputGroup>
                    <Form.Control type={showNewPwd ? "text" : "password"} required minLength="6"
                      value={pwdData.newPassword}
                      onChange={(e) => setPwdData({ ...pwdData, newPassword: e.target.value })}
                    />
                    <Button variant="outline-secondary" onClick={() => setShowNewPwd(!showNewPwd)}>
                      <iconify-icon icon={showNewPwd ? "solar:eye-bold" : "solar:eye-closed-bold"}></iconify-icon>
                    </Button>
                  </InputGroup>
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Confirmer le nouveau mot de passe</Form.Label>
                  <InputGroup>
                    <Form.Control type={showConfirmPwd ? "text" : "password"} required
                      value={pwdData.confirmPassword}
                      onChange={(e) => setPwdData({ ...pwdData, confirmPassword: e.target.value })}
                    />
                    <Button variant="outline-secondary" onClick={() => setShowConfirmPwd(!showConfirmPwd)}>
                      <iconify-icon icon={showConfirmPwd ? "solar:eye-bold" : "solar:eye-closed-bold"}></iconify-icon>
                    </Button>
                  </InputGroup>
                </Form.Group>
              </>
            )}
          </Modal.Body>
          {!pwdSuccess && (
            <Modal.Footer>
              <Button variant="secondary" onClick={handleLogout}>Se déconnecter</Button>
              <Button variant="primary" type="submit" disabled={pwdLoading}>
                {pwdLoading ? <Spinner size="sm" animation="border" /> : 'Changer le mot de passe'}
              </Button>
            </Modal.Footer>
          )}
        </Form>
      </Modal>
    </NotificationProvider>
  );
}

const AppWrapper = () => (
  <Router>
    <App />
  </Router>
);

export default AppWrapper;