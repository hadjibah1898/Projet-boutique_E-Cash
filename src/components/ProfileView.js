// src/components/ProfileView.js
// Composant d'affichage et de gestion du profil utilisateur
// Permet de visualiser et modifier les informations personnelles
// Affiche l'historique des actions et les statistiques personnelles
// Contient les fonctionnalités de changement de mot de passe

// src/components/ProfileView.js
import React, { useState, useEffect } from 'react';
import { Card, Form, Button, Alert, Spinner, Row, Col, InputGroup, ProgressBar, Image, Badge } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';

const ProfileView = () => {
    const [formData, setFormData] = useState({ nom: '', email: '' });
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    // États pour le changement de mot de passe
    const [pwdData, setPwdData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
    const [pwdMessage, setPwdMessage] = useState({ type: '', text: '' });
    const [pwdLoading, setPwdLoading] = useState(false);
    const [showCurrentPwd, setShowCurrentPwd] = useState(false);
    const [showNewPwd, setShowNewPwd] = useState(false);
    const [showConfirmPwd, setShowConfirmPwd] = useState(false);
    const [strength, setStrength] = useState({ score: 0, label: '', color: '', progress: 0 });

    const navigate = useNavigate();

    useEffect(() => {
        fetchUserData();
    }, []);

    const fetchUserData = async () => {
        try {
            const response = await authAPI.getCurrentUser();
            setUser(response.data);
            setFormData({ nom: response.data.nom, email: response.data.email });
        } catch (err) {
            setMessage({ type: 'danger', text: 'Erreur lors du chargement du profil.' });
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setMessage({ type: '', text: '' });
        try {
            await authAPI.updateProfile(formData);
            setMessage({ type: 'success', text: 'Profil mis à jour avec succès.' });
            // Mise à jour du nom dans le localStorage pour l'affichage immédiat dans le header
            localStorage.setItem('userName', formData.nom);
            // Optionnel : forcer un rafraîchissement ou utiliser un contexte pour mettre à jour le Header
        } catch (err) {
            setMessage({ type: 'danger', text: err.response?.data?.message || 'Erreur lors de la mise à jour.' });
        } finally {
            setSaving(false);
        }
    };

    const checkPasswordStrength = (password) => {
        let score = 0;
        if (!password) {
            setStrength({ score: 0, label: '', color: '', progress: 0 });
            return;
        }

        if (password.length >= 8) score++;
        if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
        if (/[0-9]/.test(password)) score++;
        if (/[^A-Za-z0-9]/.test(password)) score++;

        let label = 'Faible';
        let color = 'danger';
        let progress = (score / 4) * 100;

        if (score >= 4) {
            label = 'Très fort';
            color = 'success';
        } else if (score === 3) {
            label = 'Fort';
            color = 'primary';
        } else if (score === 2) {
            label = 'Moyen';
            color = 'warning';
        }

        setStrength({ score, label, color, progress });
    };

    const handleNewPasswordChange = (e) => {
        const newPassword = e.target.value;
        setPwdData({ ...pwdData, newPassword });
        checkPasswordStrength(newPassword);
    };

    const handlePasswordChange = async (e) => {
        e.preventDefault();
        if (pwdData.newPassword !== pwdData.confirmPassword) {
            return setPwdMessage({ type: 'danger', text: "Les nouveaux mots de passe ne correspondent pas." });
        }
        if (strength.score < 2) { // On exige au moins une force "Moyenne"
            return setPwdMessage({ type: 'danger', text: "Le mot de passe est trop faible. Veuillez en choisir un plus sécurisé." });
        }
        setPwdLoading(true);
        setPwdMessage({ type: '', text: '' });
        try {
            await authAPI.changePassword({
                currentPassword: pwdData.currentPassword,
                newPassword: pwdData.newPassword
            });
            setPwdMessage({ type: 'success', text: "Mot de passe modifié avec succès." });
            setPwdData({ currentPassword: '', newPassword: '', confirmPassword: '' });

            // Supprimer le flag de changement obligatoire en local
            localStorage.removeItem('mustChangePassword');

            // Redirection automatique vers le bon dashboard après 2 secondes
            setTimeout(() => {
                const roleRaw = (localStorage.getItem('userRole') || '').trim();
                const role = roleRaw.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "");
                // Pour le SuperAdmin, on redirige vers la gestion des utilisateurs par défaut
                const homePath = (role === 'SUPERADMIN') ? '/admin/users'
                    : (role === 'ADMIN') ? '/admin'
                        : (role === 'GERANT') ? '/gerant' : '/serveur/dashboard';
                navigate(homePath);
            }, 2000);
        } catch (err) {
            setPwdMessage({ type: 'danger', text: err.response?.data?.message || "Erreur lors du changement de mot de passe." });
        } finally {
            setPwdLoading(false);
        }
    };

    if (loading) return <div className="text-center p-5"><Spinner animation="border" /></div>;

    const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(formData.nom || 'User')}&background=0D6EFD&color=fff&rounded=true&bold=true&size=128`;

    return (
        <div className="p-4">
            <div className="d-flex align-items-center mb-4">
                <Button
                    variant="light"
                    className="me-3 shadow-sm rounded-circle d-flex align-items-center justify-content-center p-0"
                    style={{ width: '45px', height: '45px', backgroundColor: 'var(--bs-body-bg)' }}
                    onClick={() => navigate(-1)}
                    title="Retour"
                >
                    <iconify-icon icon="solar:arrow-left-linear" style={{ fontSize: '24px' }}></iconify-icon>
                </Button>
                <h3 className="fw-bold mb-0 text-body">Mon Profil</h3>
            </div>
            <Row className="justify-content-center">
                <Col md={4} lg={3} className="mb-4">
                    <Card className="border-0 shadow-sm rounded-4 text-center h-100">
                        <Card.Body className="p-4 d-flex flex-column align-items-center justify-content-center">
                            <div className="position-relative mb-3">
                                <Image
                                    src={avatarUrl}
                                    alt="Profile"
                                    roundedCircle
                                    className="border border-4 border-white shadow-sm"
                                    width={120}
                                    height={120}
                                />
                            </div>
                            <h4 className="fw-bold mb-1">{formData.nom}</h4>
                            <p className="text-muted mb-3">{formData.email}</p>
                            <Badge bg="primary" className="px-3 py-2 rounded-pill">
                                {user?.role || 'Utilisateur'}
                            </Badge>

                            {user?.role === 'Gérant' && user?.createur && (
                                <div className="mt-3 text-muted small border-top pt-3 w-100">
                                    <iconify-icon icon="solar:shield-user-bold" className="me-1"></iconify-icon>
                                    Compte créé par : <strong>{user.createur.nom}</strong>
                                </div>
                            )}
                        </Card.Body>
                    </Card>
                </Col>
                <Col md={8} lg={9}>
                    <Card className="border-0 shadow-sm rounded-4 mb-4">
                        <Card.Body className="p-4">
                            <div className="d-flex align-items-center mb-4">
                                <div className="bg-primary-subtle text-primary rounded-circle d-flex align-items-center justify-content-center me-3" style={{ width: '40px', height: '40px' }}>
                                    <iconify-icon icon="solar:user-id-bold" style={{ fontSize: '20px' }}></iconify-icon>
                                </div>
                                <h5 className="fw-bold mb-0">Informations personnelles</h5>
                            </div>

                            {message.text && <Alert variant={message.type}>{message.text}</Alert>}
                            <Form onSubmit={handleSubmit}>
                                <Row>
                                    <Col md={6}>
                                        <Form.Group className="mb-3">
                                            <Form.Label>Nom complet</Form.Label>
                                            <InputGroup>
                                                <InputGroup.Text className="bg-light border-end-0">
                                                    <iconify-icon icon="solar:user-linear"></iconify-icon>
                                                </InputGroup.Text>
                                                <Form.Control
                                                    type="text"
                                                    name="nom"
                                                    value={formData.nom}
                                                    onChange={handleChange}
                                                    required
                                                    className="border-start-0 bg-light"
                                                />
                                            </InputGroup>
                                        </Form.Group>
                                    </Col>
                                    <Col md={6}>
                                        <Form.Group className="mb-4">
                                            <Form.Label>Email</Form.Label>
                                            <InputGroup>
                                                <InputGroup.Text className="bg-light border-end-0">
                                                    <iconify-icon icon="solar:letter-linear"></iconify-icon>
                                                </InputGroup.Text>
                                                <Form.Control
                                                    type="email"
                                                    name="email"
                                                    value={formData.email}
                                                    onChange={handleChange}
                                                    required
                                                    className="border-start-0 bg-light"
                                                />
                                            </InputGroup>
                                        </Form.Group>
                                    </Col>
                                </Row>
                                <div className="d-flex justify-content-end">
                                    <Button variant="primary" type="submit" disabled={saving} className="px-4 rounded-pill">
                                        {saving ? <Spinner size="sm" animation="border" /> : <>
                                            <iconify-icon icon="solar:disk-bold" className="me-2 align-middle"></iconify-icon>
                                            Enregistrer
                                        </>}
                                    </Button>
                                </div>
                            </Form>
                        </Card.Body>
                    </Card>

                    <Card className="border-0 shadow-sm rounded-4">
                        <Card.Body className="p-4">
                            <div className="d-flex align-items-center mb-4">
                                <div className="bg-warning-subtle text-warning rounded-circle d-flex align-items-center justify-content-center me-3" style={{ width: '40px', height: '40px' }}>
                                    <iconify-icon icon="solar:shield-keyhole-bold" style={{ fontSize: '20px' }}></iconify-icon>
                                </div>
                                <h5 className="fw-bold mb-0">Sécurité</h5>
                            </div>

                            {pwdMessage.text && <Alert variant={pwdMessage.type}>{pwdMessage.text}</Alert>}
                            <Form onSubmit={handlePasswordChange}>
                                <Row>
                                    <Col md={12}>
                                        <Form.Group className="mb-3">
                                            <Form.Label>Mot de passe actuel</Form.Label>
                                            <InputGroup>
                                                <InputGroup.Text className="bg-light border-end-0">
                                                    <iconify-icon icon="solar:key-linear"></iconify-icon>
                                                </InputGroup.Text>
                                                <Form.Control
                                                    type={showCurrentPwd ? "text" : "password"}
                                                    required
                                                    value={pwdData.currentPassword}
                                                    onChange={(e) => setPwdData({ ...pwdData, currentPassword: e.target.value })}
                                                    className="border-start-0 bg-light"
                                                />
                                                <Button variant="outline-secondary" className="bg-light border-start-0" onClick={() => setShowCurrentPwd(!showCurrentPwd)}>
                                                    <iconify-icon icon={showCurrentPwd ? "solar:eye-bold" : "solar:eye-closed-bold"}></iconify-icon>
                                                </Button>
                                            </InputGroup>
                                        </Form.Group>
                                    </Col>
                                    <Col md={6}>
                                        <Form.Group className="mb-3">
                                            <Form.Label>Nouveau mot de passe</Form.Label>
                                            <InputGroup>
                                                <InputGroup.Text className="bg-light border-end-0">
                                                    <iconify-icon icon="solar:lock-password-linear"></iconify-icon>
                                                </InputGroup.Text>
                                                <Form.Control
                                                    type={showNewPwd ? "text" : "password"}
                                                    required
                                                    minLength="6"
                                                    value={pwdData.newPassword}
                                                    onChange={handleNewPasswordChange}
                                                    className="border-start-0 bg-light"
                                                />
                                                <Button variant="outline-secondary" className="bg-light border-start-0" onClick={() => setShowNewPwd(!showNewPwd)}>
                                                    <iconify-icon icon={showNewPwd ? "solar:eye-bold" : "solar:eye-closed-bold"}></iconify-icon>
                                                </Button>
                                            </InputGroup>
                                            {pwdData.newPassword && (
                                                <div className="mt-2">
                                                    <ProgressBar
                                                        now={strength.progress}
                                                        variant={strength.color}
                                                        style={{ height: '6px', borderRadius: '10px' }}
                                                    />
                                                    <small className={`text-${strength.color} fw-bold mt-1 d-block`}>{strength.label}</small>
                                                </div>
                                            )}
                                        </Form.Group>
                                    </Col>
                                    <Col md={6}>
                                        <Form.Group className="mb-4">
                                            <Form.Label>Confirmer le nouveau mot de passe</Form.Label>
                                            <InputGroup>
                                                <InputGroup.Text className="bg-light border-end-0">
                                                    <iconify-icon icon="solar:check-circle-linear"></iconify-icon>
                                                </InputGroup.Text>
                                                <Form.Control
                                                    type={showConfirmPwd ? "text" : "password"}
                                                    required
                                                    value={pwdData.confirmPassword}
                                                    onChange={(e) => setPwdData({ ...pwdData, confirmPassword: e.target.value })}
                                                    className="border-start-0 bg-light"
                                                />
                                                <Button variant="outline-secondary" className="bg-light border-start-0" onClick={() => setShowConfirmPwd(!showConfirmPwd)}>
                                                    <iconify-icon icon={showConfirmPwd ? "solar:eye-bold" : "solar:eye-closed-bold"}></iconify-icon>
                                                </Button>
                                            </InputGroup>
                                        </Form.Group>
                                    </Col>
                                </Row>
                                <div className="d-flex justify-content-end">
                                    <Button variant="warning" type="submit" disabled={pwdLoading} className="text-white fw-bold px-4 rounded-pill">
                                        {pwdLoading ? <Spinner size="sm" animation="border" /> : <>
                                            <iconify-icon icon="solar:refresh-circle-bold" className="me-2 align-middle"></iconify-icon>
                                            Changer le mot de passe
                                        </>}
                                    </Button>
                                </div>
                            </Form>
                        </Card.Body>
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

export default ProfileView;
