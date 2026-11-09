// src/components/Auth.js
import React, { useState } from 'react';
import { Container, Row, Col, Card, Form, Button, Alert, Spinner, Modal } from 'react-bootstrap';
import { Link, useLocation } from 'react-router-dom';
import { authAPI } from '../services/api';
import './Auth.css';

const Auth = ({ onLogin }) => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const location = useLocation();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState({ type: '', text: '' });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authAPI.login(formData.email, formData.password);
      let payload = response;
      if (response?.data?.data) payload = response.data.data;
      else if (response?.data?.user) payload = response.data;

      if (!payload || !payload.user) throw new Error("Utilisateur introuvable.");

      const { token, user, stores, companies, mustChangePassword } = payload;
      const userId = user.userId;
      const role = user.roleCode || (companies && companies[0] && companies[0].roleCode) || (stores && stores[0] && stores[0].roleCode) || null;
      
      if (!role) throw new Error("Aucun rôle associé à ce compte.");
      
      const nom = `${user.vcFirstName || ''} ${user.vcLastName || ''}`.trim();
      const firstStoreId = stores && stores.length > 0 ? stores[0].storeId : null;

      onLogin(token, userId, role, nom, firstStoreId, mustChangePassword, null);
    } catch (err) {
      setError(err.message || 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setForgotLoading(true);
    setForgotMessage({ type: '', text: '' });
    try {
      await authAPI.forgotPassword(forgotEmail);
      setForgotMessage({ type: 'success', text: 'Email envoyé avec succès !' });
      setTimeout(() => {
        setShowForgotModal(false);
        setForgotEmail('');
        setForgotMessage({ type: '', text: '' });
      }, 3000);
    } catch (err) {
      setForgotMessage({ type: 'danger', text: err.response?.data?.message || 'Erreur.' });
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="auth-page d-flex align-items-center">
      <Container>
        <Row className="justify-content-center w-100 mx-0">
          {/* Correction ici : on garde une taille cohérente sur tous les grands écrans */}
          <Col xs={12} sm={11} md={10} lg={9} xl={8}>
            <Card className="auth-card shadow-lg border-0 overflow-hidden">
              <Row className="g-0">
                {/* Panneau gauche */}
                <Col md={5} lg={5} className="d-none d-md-flex auth-info-panel">
                  <div className="p-4 p-lg-5 text-white w-100">
                    <div className="d-flex align-items-center mb-4 auth-brand">
                      <iconify-icon icon="solar:widget-5-bold-duotone" className="me-2 flex-shrink-0" style={{ fontSize: '32px' }}></iconify-icon>
                      <h3 className="m-0 fw-bold fs-3">StockDash</h3>
                    </div>
                    <h4 className="fw-light mb-3 text-break fs-5">Gestion de stock simplifiée.</h4>
                    <p className="opacity-75 small text-break mb-0">
                      Connectez-vous pour accéder à votre tableau de bord.
                    </p>
                  </div>
                </Col>

                {/* Panneau droit */}
                <Col xs={12} md={7} lg={7}>
                  <Card.Body className="auth-card-body p-4 p-md-5">
                    <div className="d-md-none text-center mb-4 auth-mobile-brand">
                      <div className="auth-mobile-logo mx-auto mb-3">
                        <iconify-icon icon="solar:widget-5-bold-duotone" style={{ fontSize: '28px', color: '#fff' }} />
                      </div>
                      <h4 className="fw-bold text-primary mb-1">StockDash</h4>
                    </div>

                    <div className="mb-4">
                      <h3 className="fw-bold text-primary auth-title">Connexion</h3>
                      <p className="text-muted auth-subtitle mb-0">Accédez à votre espace de gestion.</p>
                    </div>

                    {location.state?.message && <Alert variant="success" className="mb-4">{location.state.message}</Alert>}
                    {error && <Alert variant="danger" className="mt-4">{error}</Alert>}

                    <Form onSubmit={handleLogin} className="mt-4">
                      <Form.Group className="mb-3 input-group-icon">
                        <iconify-icon icon="solar:letter-linear" className="form-icon" />
                        <Form.Control type="email" name="email" value={formData.email} onChange={handleChange} placeholder="Adresse e-mail" autoComplete="email" required />
                      </Form.Group>

                      <Form.Group className="mb-3 input-group-icon position-relative">
                        <iconify-icon icon="solar:lock-password-linear" className="form-icon" />
                        <Form.Control
                          type={showPassword ? 'text' : 'password'}
                          name="password"
                          value={formData.password}
                          onChange={handleChange}
                          placeholder="Mot de passe"
                          autoComplete="current-password"
                          required
                          className="has-trailing-icon"
                        />
                        <span
                          className="password-toggle"
                          role="button"
                          tabIndex={0}
                          onClick={() => setShowPassword(!showPassword)}
                        >
                          <iconify-icon icon={showPassword ? 'solar:eye-bold' : 'solar:eye-closed-bold'} style={{ fontSize: '1.2rem' }} />
                        </span>
                      </Form.Group>

                      <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-2 auth-options">
                        <Form.Check type="checkbox" label="Se souvenir de moi" id="remember-me" className="small text-muted" />
                        <button
                          type="button"
                          className="small text-decoration-none text-primary fw-bold bg-transparent border-0 p-0"
                          onClick={() => { setForgotEmail(formData.email); setShowForgotModal(true); }}
                        >
                          Mot de passe oublié ?
                        </button>
                      </div>

                      <div className="d-grid">
                        <Button variant="primary" type="submit" disabled={loading} className="py-2 fw-bold shadow-sm auth-submit-btn">
                          {loading ? <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" /> : 'Se connecter'}
                        </Button>
                      </div>
                    </Form>

                    <div className="text-center mt-4">
                      <p className="mb-2 text-muted">Pas encore de compte ?</p>
                      <Button as={Link} to="/register" variant="outline-primary" className="w-100 py-2 fw-bold">
                        S'inscrire
                      </Button>
                    </div>
                  </Card.Body>
                </Col>
              </Row>
            </Card>
          </Col>
        </Row>
      </Container>

      <Modal show={showForgotModal} onHide={() => setShowForgotModal(false)} centered dialogClassName="forgot-modal">
        <Modal.Header closeButton>
          <Modal.Title className="fs-5">Réinitialisation du mot de passe</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleForgotSubmit}>
          <Modal.Body>
            <p className="text-muted small">Entrez votre adresse email.</p>
            {forgotMessage.text && <Alert variant={forgotMessage.type}>{forgotMessage.text}</Alert>}
            <Form.Group className="mb-3">
              <Form.Label>Adresse Email</Form.Label>
              <Form.Control type="email" required value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer className="flex-column flex-sm-row gap-2">
            <Button variant="secondary" onClick={() => setShowForgotModal(false)} className="w-100 w-sm-auto order-2 order-sm-1">
              Annuler
            </Button>
            <Button variant="primary" type="submit" disabled={forgotLoading} className="w-100 w-sm-auto order-1 order-sm-2">
              {forgotLoading ? <Spinner size="sm" animation="border" /> : 'Envoyer'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
};

export default Auth;