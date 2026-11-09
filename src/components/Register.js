// src/components/Register.js
import React, { useState, useEffect, useCallback } from 'react';
import { Container, Row, Col, Form, Button, Alert, Spinner, ProgressBar, Badge, InputGroup } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';
import './Auth.css';

const Register = () => {
    const [formData, setFormData] = useState({
        nom: '',
        email: '',
        telephone: '',
        password: '',
        confirmPassword: '',
        accountType: null,
        entrepriseNom: '',
        registreCommerce: '',
        ville: '',
        nombreServeursEstime: '',
        deviseParDefaut: 'GNF'
    });

    const [step, setStep] = useState(1);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [fieldErrors, setFieldErrors] = useState({});
    const [passwordStrength, setPasswordStrength] = useState({ score: 0, label: 'Vide', color: 'secondary', progress: 0 });
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const navigate = useNavigate();

    const checkPasswordStrength = useCallback((pass) => {
        if (!pass) {
            setPasswordStrength({ score: 0, label: 'Vide', color: 'secondary', progress: 0 });
            return;
        }
        let score = 0;
        if (pass.length >= 6) score++;
        if (pass.length >= 10) score++;
        if (/[A-Z]/.test(pass)) score++;
        if (/[0-9]/.test(pass)) score++;
        if (/[^A-Za-z0-9]/.test(pass)) score++;

        if (score <= 1) setPasswordStrength({ score, label: 'Très Faible', color: 'danger', progress: 20 });
        else if (score === 2) setPasswordStrength({ score, label: 'Faible', color: 'warning', progress: 40 });
        else if (score === 3) setPasswordStrength({ score, label: 'Moyen', color: 'info', progress: 60 });
        else if (score === 4) setPasswordStrength({ score, label: 'Fort', color: 'primary', progress: 85 });
        else setPasswordStrength({ score, label: 'Excellent', color: 'success', progress: 100 });
    }, []);

    useEffect(() => {
        checkPasswordStrength(formData.password);
    }, [formData.password, checkPasswordStrength]);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const validateForm = () => {
        let errors = {};
        let isValid = true;

        if (!formData.accountType) { setError("Veuillez choisir un type de compte."); isValid = false; }
        if (!formData.nom.trim()) { errors.nom = "Le nom est requis."; isValid = false; }
        if (!formData.email.trim() || !/\S+@\S+\.\S+/.test(formData.email)) { errors.email = "Email invalide."; isValid = false; }
        if (!formData.telephone.trim()) { errors.telephone = "Téléphone requis."; isValid = false; }
        if (!formData.password || formData.password.length < 6) { errors.password = "Minimum 6 caractères."; isValid = false; }
        if (formData.password !== formData.confirmPassword) { errors.confirmPassword = "Mots de passe différents."; isValid = false; }
        if (!formData.entrepriseNom.trim()) { errors.entrepriseNom = "Nom d'établissement requis."; isValid = false; }
        if (!formData.ville.trim()) { errors.ville = "Ville requise."; isValid = false; }

        setFieldErrors(errors);
        return isValid;
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setError('');
        if (!validateForm()) return;

        setLoading(true);
        try {
            await authAPI.register(formData);
            navigate('/register/success', {
                state: {
                    accountType: formData.accountType,
                    entrepriseNom: formData.entrepriseNom,
                    nom: formData.nom
                }
            });
        } catch (err) {
            setError(err.response?.data?.message || "Erreur lors de l'inscription");
        } finally {
            setLoading(false);
        }
    };

    const selectAccountType = (type) => {
        setFormData({ ...formData, accountType: type });
    };

    return (
        <div className="auth-page bg-light">
            {/* ✅ STYLE INTÉGRÉ POUR LE DESIGN PREMIUM */}
            <style>{`
                .mesh-gradient {
                    background-color: #0d6efd;
                    background-image: 
                        radial-gradient(at 10% 20%, hsla(217, 89%, 61%, 1) 0px, transparent 50%),
                        radial-gradient(at 90% 80%, hsla(242, 88%, 61%, 1) 0px, transparent 50%),
                        radial-gradient(at 50% 50%, hsla(200, 95%, 50%, 1) 0px, transparent 50%);
                }
                .glass-bubble {
                    position: absolute;
                    border-radius: 50%;
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                }
                .modern-input {
                    background-color: #f8f9fa !important;
                    border: 1px solid #e9ecef !important;
                    padding: 0.75rem 1rem !important;
                    border-radius: 12px !important;
                    transition: all 0.2s ease-in-out;
                    font-size: 0.95rem;
                }
                .modern-input:focus {
                    background-color: #ffffff !important;
                    border-color: #0d6efd !important;
                    box-shadow: 0 0 0 4px rgba(13, 110, 253, 0.1) !important;
                }
                .modern-label {
                    font-size: 0.85rem;
                    font-weight: 600;
                    color: #6c757d;
                    margin-bottom: 0.5rem;
                }
                .btn-primary-gradient {
                    background: linear-gradient(135deg, #0d6efd, #0b5ed7);
                    border: none;
                    border-radius: 12px;
                    padding: 0.8rem;
                    font-weight: 600;
                    transition: all 0.3s ease;
                }
                .btn-primary-gradient:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 15px rgba(13, 110, 253, 0.3);
                }
                .type-selector {
                    cursor: pointer;
                    border: 2px solid #e9ecef;
                    border-radius: 12px;
                    padding: 1.5rem;
                    transition: all 0.2s ease;
                    background: #ffffff;
                }
                .type-selector:hover {
                    border-color: #0d6efd;
                    box-shadow: 0 4px 12px rgba(13, 110, 253, 0.1);
                }
                .type-selector.active {
                    border-color: #0d6efd;
                    background-color: #f0f7ff;
                }
            `}</style>

            <Container fluid className="p-0">
                <Row className="g-0 vh-100">
                    {/* Panneau gauche : Design Premium */}
                    <Col lg={5} className="d-none d-lg-flex mesh-gradient align-items-center justify-content-center text-white p-5 position-relative overflow-hidden">
                        {/* Bulles décoratives Glassmorphism */}
                        <div className="glass-bubble" style={{ width: '300px', height: '300px', top: '-50px', left: '-50px' }}></div>
                        <div className="glass-bubble" style={{ width: '200px', height: '200px', bottom: '10%', right: '5%' }}></div>
                        <div className="glass-bubble" style={{ width: '100px', height: '100px', top: '40%', right: '20%' }}></div>

                        <div className="z-1 position-relative" style={{ maxWidth: '450px' }}>
                            <div className="d-flex align-items-center mb-5">
                                <div className="bg-white bg-opacity-25 rounded-3 p-2 me-3 d-flex align-items-center justify-content-center" style={{ width: '56px', height: '56px' }}>
                                    <iconify-icon icon="solar:widget-5-bold-duotone" style={{ fontSize: '32px' }}></iconify-icon>
                                </div>
                                <h2 className="m-0 fw-bold tracking-wide">StockDash</h2>
                            </div>
                            <h1 className="display-6 fw-bold mb-4" style={{ lineHeight: '1.2' }}>Propulsez la gestion de votre établissement.</h1>
                            <p className="opacity-75 fs-5 lh-base">Suivez vos ventes, gérez vos stocks et pilotez vos équipes en temps réel sur une plateforme unique et sécurisée.</p>
                            
                            <div className="d-flex gap-3 mt-5 pt-4 border-top border-white border-opacity-25">
                                <div className="d-flex align-items-center">
                                    <iconify-icon icon="solar:check-circle-bold" className="me-2 text-success bg-white rounded-circle"></iconify-icon>
                                    <span className="small fw-semibold">Sécurisé</span>
                                </div>
                                <div className="d-flex align-items-center">
                                    <iconify-icon icon="solar:check-circle-bold" className="me-2 text-success bg-white rounded-circle"></iconify-icon>
                                    <span className="small fw-semibold">Multi-boutiques</span>
                                </div>
                            </div>
                        </div>
                    </Col>

                    {/* Panneau droit : Formulaire épuré */}
                    <Col lg={7} className="d-flex align-items-center justify-content-center bg-white p-4 p-md-5 overflow-auto">
                        <div style={{ maxWidth: '600px', width: '100%' }}>
                            {step === 1 ? (
                                <div className="animate__animated animate__fadeIn">
                                    <h2 className="fw-bold mb-2 text-dark" style={{ letterSpacing: '-0.5px' }}>Dites-nous qui vous êtes</h2>
                                    <p className="text-muted mb-5 fs-5">Sélectionnez votre profil pour configurer vos outils.</p>

                                    <Form.Group className="mb-4">
                                        <Form.Label className="modern-label">Type de compte</Form.Label>
                                        <Form.Select
                                            name="accountType"
                                            value={formData.accountType || ''}
                                            onChange={(e) => selectAccountType(e.target.value)}
                                            className="modern-input shadow-none"
                                            style={{ appearance: 'none' }}
                                        >
                                            <option value="">Sélectionner votre profil...</option>
                                            <option value="Marchand">MARCHAND</option>
                                        </Form.Select>
                                    </Form.Group>

                                    {formData.accountType && (
                                        <div className="mt-4 p-4 border rounded-4 bg-light shadow-sm animate__animated animate__slideInUp">
                                            <div className="d-flex align-items-center mb-4 pb-3 border-bottom">
                                                <div className="bg-primary bg-opacity-10 p-3 rounded-circle me-3">
                                                    <iconify-icon icon="solar:globus-bold-duotone" className="text-primary fs-4"></iconify-icon>
                                                </div>
                                                <h5 className="fw-bold mb-0 text-dark">{formData.accountType === 'Marchand' ? "Le cycle de gestion de votre entreprise :" : "Inclus dans votre version :"}</h5>
                                            </div>

                                            <Row className="g-4 mb-2">
                                                {formData.accountType === 'Marchand' ? (
                                                    <>
                                                        <Col md={6}>
                                                            <div className="d-flex flex-column gap-1">
                                                                <span className="fw-bold text-dark small"><iconify-icon icon="solar:user-rounded-bold" className="text-primary me-2"></iconify-icon> 1. Compte Administrateur</span>
                                                                <p className="text-muted small mb-0">Créez votre identité d'entreprise et gardez le contrôle total sur vos accès.</p>
                                                            </div>
                                                        </Col>
                                                        <Col md={6}>
                                                            <div className="d-flex flex-column gap-1">
                                                                <span className="fw-bold text-dark small"><iconify-icon icon="solar:home-2-bold" className="text-primary me-2"></iconify-icon> 2. Dépôt Principal</span>
                                                                <p className="text-muted small mb-0">Activez votre centre de stockage. Gérez vos entrées en gros et fournisseurs.</p>
                                                            </div>
                                                        </Col>
                                                        <Col md={6}>
                                                            <div className="d-flex flex-column gap-1">
                                                                <span className="fw-bold text-dark small"><iconify-icon icon="solar:shop-2-bold" className="text-primary me-2"></iconify-icon> 3. Boutiques Secondaires</span>
                                                                <p className="text-muted small mb-0">Déployez votre réseau. Alimentez vos points de vente par transferts sécurisés.</p>
                                                            </div>
                                                        </Col>
                                                        <Col md={6}>
                                                            <div className="d-flex flex-column gap-1">
                                                                <span className="fw-bold text-dark small"><iconify-icon icon="solar:graph-up-bold" className="text-primary me-2"></iconify-icon> 4. Analyse & Pilotage</span>
                                                                <p className="text-muted small mb-0">Analysez vos performances et optimisez votre logistique globale.</p>
                                                            </div>
                                                        </Col>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Col sm={6}><div className="d-flex align-items-center small fw-semibold text-dark"><iconify-icon icon="solar:check-read-bold" className="text-success me-2 fs-5"></iconify-icon> Interface POS tactile</div></Col>
                                                        <Col sm={6}><div className="d-flex align-items-center small fw-semibold text-dark"><iconify-icon icon="solar:check-read-bold" className="text-success me-2 fs-5"></iconify-icon> Gestion des doses</div></Col>
                                                        <Col sm={6}><div className="d-flex align-items-center small fw-semibold text-dark"><iconify-icon icon="solar:check-read-bold" className="text-success me-2 fs-5"></iconify-icon> Clôtures de caisse</div></Col>
                                                        <Col sm={6}><div className="d-flex align-items-center small fw-semibold text-dark"><iconify-icon icon="solar:check-read-bold" className="text-success me-2 fs-5"></iconify-icon> Suivi des pourboires</div></Col>
                                                    </>
                                                )}
                                            </Row>

                                            <div className="d-grid mt-4 pt-3 border-top">
                                                <Button variant="primary" className="btn-primary-gradient d-flex align-items-center justify-content-center" onClick={() => setStep(2)} disabled={!formData.accountType}>
                                                    Continuer vers le formulaire
                                                    <iconify-icon icon="solar:arrow-right-bold" className="ms-2 fs-5"></iconify-icon>
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                    <div className="text-center mt-5">
                                        <small className="text-muted fs-6">Vous avez déjà un compte ? <a href="/login" className="text-primary fw-bold text-decoration-none hover-link">Connectez-vous</a></small>
                                    </div>
                                </div>
                            ) : (
                                <div className="animate__animated animate__fadeInRight">
                                    <Button variant="link" onClick={() => setStep(1)} className="p-0 mb-4 text-muted small text-decoration-none hover-link d-flex align-items-center">
                                        <iconify-icon icon="solar:alt-arrow-left-linear" className="me-1 fs-5"></iconify-icon>
                                        Changer de profil
                                    </Button>
                                    <h3 className="fw-bold mb-4 text-dark" style={{ letterSpacing: '-0.5px' }}>Finalisez votre inscription</h3>
                                    
                                    {error && <Alert variant="danger" className="rounded-3">{error}</Alert>}
                                    
                                    <Form onSubmit={handleRegister}>
                                        {/* SECTION 1 : RESPONSABLE */}
                                        <div className="mb-5">
                                            <h6 className="text-primary text-uppercase small fw-bold mb-3 pb-2 border-bottom border-primary border-opacity-25">
                                                <iconify-icon icon="solar:user-id-bold" className="me-2 align-middle"></iconify-icon>Informations du Responsable
                                            </h6>
                                            <Row className="g-3">
                                                <Col md={6}>
                                                    <Form.Group>
                                                        <Form.Label className="modern-label">Nom du Responsable</Form.Label>
                                                        <Form.Control name="nom" value={formData.nom} onChange={handleChange} isInvalid={!!fieldErrors.nom} required className="modern-input" placeholder="Ex: Mamadou Bah" />
                                                        <Form.Control.Feedback type="invalid">{fieldErrors.nom}</Form.Control.Feedback>
                                                    </Form.Group>
                                                </Col>
                                                <Col md={6}>
                                                    <Form.Group>
                                                        <Form.Label className="modern-label">Téléphone</Form.Label>
                                                        <Form.Control name="telephone" value={formData.telephone} onChange={handleChange} isInvalid={!!fieldErrors.telephone} required className="modern-input" placeholder="Ex: +224 620 00 00 00" />
                                                        <Form.Control.Feedback type="invalid">{fieldErrors.telephone}</Form.Control.Feedback>
                                                    </Form.Group>
                                                </Col>
                                            </Row>
                                            <Form.Group className="mt-3">
                                                <Form.Label className="modern-label">Email</Form.Label>
                                                <Form.Control type="email" name="email" value={formData.email} onChange={handleChange} isInvalid={!!fieldErrors.email} required className="modern-input" placeholder="votre@email.com" />
                                                <Form.Control.Feedback type="invalid">{fieldErrors.email}</Form.Control.Feedback>
                                            </Form.Group>
                                        </div>

                                        {/* SECTION 2 : ETABLISSEMENT */}
                                        <div className="mb-5">
                                            <h6 className="text-primary text-uppercase small fw-bold mb-3 pb-2 border-bottom border-primary border-opacity-25">
                                                <iconify-icon icon="solar:shop-bold" className="me-2 align-middle"></iconify-icon>Détails de l'Établissement
                                            </h6>
                                            <Form.Group className="mb-3">
                                                <Form.Label className="modern-label">Nom de l'Etablissement</Form.Label>
                                                <Form.Control name="entrepriseNom" value={formData.entrepriseNom} onChange={handleChange} isInvalid={!!fieldErrors.entrepriseNom} required className="modern-input" placeholder="Ex: Supermarché Le Bon Prix" />
                                                <Form.Control.Feedback type="invalid">{fieldErrors.entrepriseNom}</Form.Control.Feedback>
                                            </Form.Group>
                                            <Row className="g-3">
                                                <Col md={6}>
                                                    <Form.Group>
                                                        <Form.Label className="modern-label">Ville</Form.Label>
                                                        <Form.Control name="ville" value={formData.ville} onChange={handleChange} isInvalid={!!fieldErrors.ville} required className="modern-input" placeholder="Ex: Conakry" />
                                                        <Form.Control.Feedback type="invalid">{fieldErrors.ville}</Form.Control.Feedback>
                                                    </Form.Group>
                                                </Col>
                                                <Col md={6}>
                                                    <Form.Group>
                                                        <Form.Label className="modern-label">RCCM (Optionnel)</Form.Label>
                                                        <Form.Control name="registreCommerce" value={formData.registreCommerce} onChange={handleChange} className="modern-input" placeholder="Numéro RCCM" />
                                                    </Form.Group>
                                                </Col>
                                            </Row>
                                        </div>

                                        {/* SECTION 3 : SECURITE */}
                                        <div className="mb-5">
                                            <h6 className="text-primary text-uppercase small fw-bold mb-3 pb-2 border-bottom border-primary border-opacity-25">
                                                <iconify-icon icon="solar:shield-keyhole-bold" className="me-2 align-middle"></iconify-icon>Sécurité du compte
                                            </h6>
                                            <Form.Group className="mb-3">
                                                <Form.Label className="modern-label d-flex justify-content-between align-items-center">
                                                    Mot de passe 
                                                    <Badge bg={passwordStrength.color} className="px-2 py-1 rounded-pill">{passwordStrength.label}</Badge>
                                                </Form.Label>
                                                <InputGroup>
                                                    <Form.Control type={showPassword ? "text" : "password"} name="password" value={formData.password} onChange={handleChange} isInvalid={!!fieldErrors.password} required className="modern-input border-end-0" placeholder="••••••••" />
                                                    <Button variant="light" onClick={() => setShowPassword(!showPassword)} className="border border-start-0 modern-input" style={{ padding: '0 1rem' }}>
                                                        <iconify-icon icon={showPassword ? "solar:eye-broken" : "solar:eye-closed-broken"} className="text-muted fs-5"></iconify-icon>
                                                    </Button>
                                                </InputGroup>
                                                <Form.Control.Feedback type="invalid" className={fieldErrors.password ? "d-block" : "d-none"}>{fieldErrors.password}</Form.Control.Feedback>
                                                <ProgressBar now={passwordStrength.progress} variant={passwordStrength.color} className="mt-3 rounded-pill" style={{ height: '6px' }} />
                                            </Form.Group>
                                            
                                            <Form.Group>
                                                <Form.Label className="modern-label">Confirmer le mot de passe</Form.Label>
                                                <InputGroup>
                                                    <Form.Control type={showConfirmPassword ? "text" : "password"} name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} isInvalid={!!fieldErrors.confirmPassword} required className="modern-input border-end-0" placeholder="••••••••" />
                                                    <Button variant="light" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="border border-start-0 modern-input" style={{ padding: '0 1rem' }}>
                                                        <iconify-icon icon={showConfirmPassword ? "solar:eye-broken" : "solar:eye-closed-broken"} className="text-muted fs-5"></iconify-icon>
                                                    </Button>
                                                </InputGroup>
                                                <Form.Control.Feedback type="invalid" className={fieldErrors.confirmPassword ? "d-block" : "d-none"}>{fieldErrors.confirmPassword}</Form.Control.Feedback>
                                            </Form.Group>
                                        </div>

                                        <Button variant="primary" type="submit" disabled={loading} className="w-100 btn-primary-gradient py-3 fs-5 mb-3">
                                            {loading ? <Spinner size="sm" className="me-2" /> : <iconify-icon icon="solar:user-plus-bold" className="me-2 fs-5 align-middle"></iconify-icon>}
                                            Créer mon compte
                                        </Button>
                                        <div className="text-center mt-3">
                                            <small className="text-muted">En créant un compte, vous acceptez nos <a href="#" className="text-primary text-decoration-none">conditions d'utilisation</a>.</small>
                                        </div>
                                    </Form>
                                </div>
                            )}
                        </div>
                    </Col>
                </Row>
            </Container>
        </div>
    );
};

export default Register;