/**
 * @file BarConfigView.js
 * @description Vue Admin : Configuration QR codes et paramètres du Bar
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Row, Col, Card, Button, Form, Spinner, Alert, Badge } from 'react-bootstrap';
import { boutiqueAPI } from '../services/api';
import { toast } from 'react-toastify';

const PAYMENT_METHODS = [
    { key: 'orangeMoney', label: 'Orange Money', icon: 'solar:smartphone-bold' },
    { key: 'mobicash', label: 'MobiCash', icon: 'solar:wallet-money-bold' },
    { key: 'paycard', label: 'PayCard', icon: 'solar:card-bold' },
];

const BarConfigView = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [boutiques, setBoutiques] = useState([]);
    const [selectedBoutique, setSelectedBoutique] = useState('');
    const [config, setConfig] = useState({
        orangeMoneyQrCode: '',
        orangeMoneyAccount: '',
        mobicashQrCode: '',
        mobicashAccount: '',
        paycardQrCode: '',
        paycardAccount: '',
        pourboirePercentage: 10,
    });
    const [qrFileKeys, setQrFileKeys] = useState({});
    const [error, setError] = useState('');

    const fetchBoutiques = useCallback(async () => {
        try {
            const res = await boutiqueAPI.getAll();
            const bars = (res.data?.data || res.data || []).filter(b => b.type === 'Bar');
            setBoutiques(bars);
            if (bars.length > 0 && !selectedBoutique) {
                setSelectedBoutique(bars[0]._id);
            }
        } catch (err) {
            setError("Impossible de charger les boutiques.");
        }
    }, [selectedBoutique]);

    const fetchConfig = useCallback(async () => {
        if (!selectedBoutique) return;
        try {
            setLoading(true);
            const res = await boutiqueAPI.getDetailsForServeur(selectedBoutique);
            const b = res.data || {};
            setConfig({
                orangeMoneyQrCode: b.orangeMoneyQrCode || '',
                orangeMoneyAccount: b.orangeMoneyAccount || '',
                mobicashQrCode: b.mobicashQrCode || '',
                mobicashAccount: b.mobicashAccount || '',
                paycardQrCode: b.paycardQrCode || '',
                paycardAccount: b.paycardAccount || '',
                pourboirePercentage: b.pourboirePercentage || 10,
            });
            setQrFileKeys({});
        } catch (err) {
            setError("Impossible de charger la configuration.");
        } finally {
            setLoading(false);
        }
    }, [selectedBoutique]);

    useEffect(() => { fetchBoutiques(); }, [fetchBoutiques]);
    useEffect(() => { fetchConfig(); }, [fetchConfig]);

    const handleFileChange = (methodKey, e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => {
            setConfig(prev => ({ ...prev, [`${methodKey}QrCode`]: reader.result }));
            setQrFileKeys(prev => ({ ...prev, [methodKey]: Date.now() }));
        };
        reader.readAsDataURL(file);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await boutiqueAPI.update(selectedBoutique, config);
            toast.success("Configuration du Bar sauvegardée avec succès !");
        } catch (err) {
            toast.error("Erreur lors de la sauvegarde.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="p-4 animate__animated animate__fadeIn">
            <div className="d-flex justify-content-between align-items-center mb-4">
                <div>
                    <h2 className="fw-bold mb-0 text-primary">
                        <iconify-icon icon="solar:settings-bold-duotone" className="me-2"></iconify-icon>
                        Configuration des Bars
                    </h2>
                    <p className="text-muted small mb-0">Configurez les QR codes et paramètres de paiement pour chaque bar.</p>
                </div>
            </div>

            {error && <Alert variant="danger">{error}</Alert>}

            <Row className="g-4">
                <Col md={4}>
                    <Card className="border-0 shadow-sm rounded-4">
                        <Card.Header className="bg-white border-0 pt-3">
                            <h5 className="fw-bold mb-0">Sélectionner un Bar</h5>
                        </Card.Header>
                        <Card.Body>
                            {boutiques.length === 0 ? (
                                <Alert variant="info">Aucun bar trouvé. Créez d'abord une boutique de type Bar.</Alert>
                            ) : (
                                <div className="d-grid gap-2">
                                    {boutiques.map(b => (
                                        <Button
                                            key={b._id}
                                            variant={selectedBoutique === b._id ? 'primary' : 'outline-secondary'}
                                            className="text-start py-3 rounded-4"
                                            onClick={() => setSelectedBoutique(b._id)}
                                        >
                                            <iconify-icon icon="solar:wine-glass-bold" className="me-2 align-middle"></iconify-icon>
                                            <span className="fw-bold">{b.nom}</span>
                                            <small className="d-block text-muted mt-1">{b.adresse || 'Adresse non définie'}</small>
                                        </Button>
                                    ))}
                                </div>
                            )}
                        </Card.Body>
                    </Card>
                </Col>

                <Col md={8}>
                    {loading ? (
                        <div className="text-center py-5"><Spinner animation="border" variant="primary" /></div>
                    ) : !selectedBoutique ? (
                        <Card className="border-0 shadow-sm rounded-4 text-center py-5">
                            <Card.Body>
                                <iconify-icon icon="solar:settings-bold-duotone" style={{ fontSize: '64px', opacity: '0.2' }}></iconify-icon>
                                <h5 className="text-muted mt-3">Sélectionnez un bar pour configurer ses options.</h5>
                            </Card.Body>
                        </Card>
                    ) : (
                        <Card className="border-0 shadow-sm rounded-4">
                            <Card.Header className="bg-white border-0 pt-3">
                                <h5 className="fw-bold mb-0">Paramètres de Paiement</h5>
                            </Card.Header>
                            <Card.Body>
                                {/* Pourboire */}
                                <Form.Group className="mb-4">
                                    <Form.Label className="fw-bold text-muted small">POURCENTAGE DE POURBOIRE PAR DÉFAUT</Form.Label>
                                    <div className="d-flex align-items-center gap-3">
                                        <Form.Range
                                            min="0" max="50" step="5"
                                            value={config.pourboirePercentage}
                                            onChange={(e) => setConfig({ ...config, pourboirePercentage: parseInt(e.target.value) })}
                                            style={{ flex: 1 }}
                                        />
                                        <Badge bg="primary" className="fs-6 px-3">{config.pourboirePercentage}%</Badge>
                                    </div>
                                </Form.Group>

                                <hr />

                                {/* QR Codes */}
                                <h6 className="fw-bold mb-3">QR Codes & Comptes Fintech</h6>
                                {PAYMENT_METHODS.map(method => (
                                    <Card key={method.key} className="border mb-3 rounded-3 bg-light bg-opacity-25">
                                        <Card.Body className="py-3">
                                            <Row className="align-items-center g-3">
                                                <Col md={4}>
                                                    <div className="d-flex align-items-center">
                                                        <iconify-icon icon={method.icon} className="text-primary me-2 fs-4"></iconify-icon>
                                                        <span className="fw-bold">{method.label}</span>
                                                    </div>
                                                </Col>
                                                <Col md={4}>
                                                    <Form.Group>
                                                        <Form.Label className="x-small text-muted">Numéro de compte</Form.Label>
                                                        <Form.Control
                                                            size="sm"
                                                            type="text"
                                                            placeholder={`N° ${method.label}`}
                                                            value={config[`${method.key}Account`]}
                                                            onChange={(e) => setConfig({ ...config, [`${method.key}Account`]: e.target.value })}
                                                        />
                                                    </Form.Group>
                                                </Col>
                                                <Col md={4}>
                                                    <Form.Group>
                                                        <Form.Label className="x-small text-muted">QR Code (image)</Form.Label>
                                                        <Form.Control
                                                            key={qrFileKeys[method.key] || 'initial'}
                                                            size="sm"
                                                            type="file"
                                                            accept="image/*"
                                                            onChange={(e) => handleFileChange(method.key, e)}
                                                        />
                                                    </Form.Group>
                                                </Col>
                                            </Row>
                                            {config[`${method.key}QrCode`] && (
                                                <div className="mt-3 text-center">
                                                    <img
                                                        src={config[`${method.key}QrCode`]}
                                                        alt={`QR ${method.label}`}
                                                        className="img-fluid rounded border"
                                                        style={{ maxHeight: '120px' }}
                                                    />
                                                    <Button
                                                        variant="link"
                                                        size="sm"
                                                        className="text-danger d-block mx-auto"
                                                        onClick={() => setConfig({ ...config, [`${method.key}QrCode`]: '' })}
                                                    >
                                                        Supprimer l'image
                                                    </Button>
                                                </div>
                                            )}
                                        </Card.Body>
                                    </Card>
                                ))}

                                <div className="d-grid mt-4">
                                    <Button
                                        variant="success"
                                        size="lg"
                                        className="rounded-pill fw-bold"
                                        onClick={handleSave}
                                        disabled={saving}
                                    >
                                        {saving ? <Spinner size="sm" className="me-2" /> : <iconify-icon icon="solar:check-circle-bold" className="me-2"></iconify-icon>}
                                        Sauvegarder la Configuration
                                    </Button>
                                </div>
                            </Card.Body>
                        </Card>
                    )}
                </Col>
            </Row>
        </div>
    );
};

export default BarConfigView;