/**
 * @file RestockModal.js
 * @description Composant React.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Button, Form, Alert, Spinner } from 'react-bootstrap';
import { boutiqueAPI, articleAPI } from '../services/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logo from '../assets/logo.png';

const RestockModal = ({ show, onHide, onSuccess }) => {
    const [boutiques, setBoutiques] = useState([]);
    const [centralShop, setCentralShop] = useState(null);
    const [restockTargetId, setRestockTargetId] = useState('');
    const [centralShopArticles, setCentralShopArticles] = useState([]);
    const [selectedRestockArticles, setSelectedRestockArticles] = useState([]);
    const [restockQuantities, setRestockQuantities] = useState({});
    const [nomTransporteur, setNomTransporteur] = useState('');
    const [loading, setLoading] = useState(true);
    const [restockLoading, setRestockLoading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });
    const [movementData, setMovementData] = useState(null);

    const fetchData = useCallback(async () => {
        if (!show) return;
        setLoading(true);
        try {
            const boutiques = await boutiqueAPI.getAll();
            const centrale = boutiques.find(b => b.type === 'Centrale');
            setBoutiques(boutiques);
            setCentralShop(centrale);

            if (centrale) {
                const articlesRes = await articleAPI.getAll();
                const allArticles = (Array.isArray(articlesRes) ? articlesRes : (Array.isArray(articlesRes.data) ? articlesRes.data : []));
                const shopArticles = allArticles.filter(a => (a.boutique?._id || a.boutique) === centrale._id);
                setCentralShopArticles(shopArticles);
            }
        } catch (err) {
            setMessage({ type: 'danger', text: "Erreur de chargement des données initiales." });
        } finally {
            setLoading(false);
        }
    }, [show]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const generateTransferReceipt = (mvt, action = 'download') => {
        const doc = new jsPDF();
        
        const drawExemplaire = (label) => {
            doc.addImage(logo, 'PNG', 14, 10, 40, 15);
            doc.setFontSize(18).setTextColor(25, 118, 210).setFont("helvetica", "bold");
            doc.text("BON DE TRANSFERT DE STOCK", 105, 20, { align: 'center' });
            
            doc.setFontSize(10).setTextColor(150).setFont("helvetica", "italic");
            doc.text(label, 105, 25, { align: 'center' });
            
            doc.setFontSize(10).setTextColor(100).setFont("helvetica", "normal");
            doc.text(`ID Transfert : #TR-${mvt._id.toString().slice(-6).toUpperCase()}`, 105, 31, { align: 'center' });
            doc.text(`Date : ${new Date(mvt.createdAt).toLocaleString('fr-FR')}`, 196, 20, { align: 'right' });

            if (mvt.nomTransporteur) {
                doc.setFontSize(10).setFont("helvetica", "bold").setTextColor(41, 128, 185);
                doc.text(`TRANSPORTEUR : ${mvt.nomTransporteur.toUpperCase()}`, 14, 35);
            }

            autoTable(doc, {
                startY: mvt.nomTransporteur ? 40 : 38,
                head: [['Référence', 'Désignation Article', 'Quantité']],
                body: mvt.articles.map(a => [a.code || '-', a.nomArticle, a.quantite]),
                theme: 'grid',
                headStyles: { fillColor: [25, 118, 210], halign: 'center' },
                columnStyles: {
                    0: { halign: 'center', cellWidth: 30 },
                    2: { halign: 'center', cellWidth: 20 }
                }
            });

            let finalY = doc.lastAutoTable.finalY + 15;
            if (finalY > 250) { doc.addPage(); finalY = 20; }

            doc.setFontSize(11).setTextColor(0).setFont("helvetica", "bold");
            doc.text("L'EXPÉDITEUR (VISA)", 14, finalY);
            doc.text("LE RÉCEPTIONNAIRE (VISA)", 105, finalY);
            
            doc.setFontSize(10).setFont("helvetica", "normal").setTextColor(80);
            doc.text(mvt.boutiqueSource?.nom || 'Dépôt Principal', 14, finalY + 7);
            doc.text(mvt.boutiqueDestination?.nom || 'Boutique Cible', 105, finalY + 7);
            
            doc.setFontSize(9).setTextColor(150);
            doc.text("Précédé de la mention 'Expédié conforme'", 14, finalY + 15);
            doc.text("Précédé de la mention 'Vérifié et Accepté'", 105, finalY + 15);

            if (mvt.nomTransporteur) {
                doc.setFontSize(9).setTextColor(0);
                doc.text(`Visa Transporteur : ${mvt.nomTransporteur}`, 14, finalY + 28);
            }

            doc.setDrawColor(200).line(14, finalY + 35, 70, finalY + 35);
            doc.line(105, finalY + 35, 160, finalY + 35);
        };

        drawExemplaire("EXEMPLAIRE BOUTIQUE SOURCE (EXPÉDITION)");
        doc.addPage();
        drawExemplaire("EXEMPLAIRE BOUTIQUE CIBLE (RÉCEPTION)");

        if (action === 'preview') {
            const blob = doc.output('bloburl');
            window.open(blob, '_blank');
        } else {
            doc.save(`transfert_${mvt._id.toString().slice(-6)}.pdf`);
        }
    };

    const handleRestockSubmit = async (e) => {
        e.preventDefault();
        setRestockLoading(true);
        setMessage({ type: '', text: '' });

        if (!restockTargetId) {
            setRestockLoading(false);
            return setMessage({ type: 'warning', text: "Veuillez sélectionner une boutique de destination." });
        }
        if (selectedRestockArticles.length === 0) {
            setRestockLoading(false);
            return setMessage({ type: 'warning', text: "Veuillez sélectionner au moins un article à réapprovisionner." });
        }
        if (!centralShop) {
            setRestockLoading(false);
            return setMessage({ type: 'danger', text: "Dépôt principal introuvable. Impossible de savoir d'où vient le stock." });
        }

        const articlesPayload = selectedRestockArticles.map(id => ({
            articleId: id,
            quantite: restockQuantities[id] || centralShopArticles.find(a => a._id === id)?.quantite || 1
        }));

        try {
            // ✅ CORRECTION : On envoie sourceId et vcCarrierName
            const res = await articleAPI.restock({ 
                sourceId: centralShop._id, 
                targetId: restockTargetId, 
                articles: articlesPayload,
                vcCarrierName: nomTransporteur
            });
            
            if (res && res._id) {
                setMovementData(res);
            } else {
                onSuccess("Articles réapprovisionnés avec succès!");
                handleClose();
            }
        } catch (err) {
            setMessage({ type: 'danger', text: err.response?.data?.message || "Erreur lors du réapprovisionnement." });
        } finally {
            setRestockLoading(false);
        }
    };

    const handleClose = () => {
        setRestockTargetId('');
        setSelectedRestockArticles([]);
        setRestockQuantities({});
        setNomTransporteur('');
        setMessage({ type: '', text: '' });
        setMovementData(null);
        onHide();
    };

    return (
        <Modal show={show} onHide={handleClose}>
            <Modal.Header closeButton>
                <Modal.Title>{movementData ? 'Opération Réussie' : 'Réapprovisionner une boutique'}</Modal.Title>
            </Modal.Header>
            {movementData ? (
                <Modal.Body className="text-center py-4">
                    <div className="mb-3 text-success">
                        <iconify-icon icon="solar:check-circle-bold-duotone" style={{ fontSize: '64px' }}></iconify-icon>
                    </div>
                    <h5 className="fw-bold mb-3">Le stock a été mis à jour avec succès !</h5>
                    <p className="text-muted mb-4 px-3">Souhaitez-vous prévisualiser le bon de transfert avant de fermer cette fenêtre ?</p>
                    
                    <div className="d-grid gap-2 px-4">
                        <Button variant="outline-primary" className="rounded-pill py-2 d-flex align-items-center justify-content-center fw-bold" onClick={() => generateTransferReceipt(movementData, 'preview')}>
                            <iconify-icon icon="solar:eye-bold" className="me-2" style={{ fontSize: '20px' }}></iconify-icon>
                            Prévisualiser le Bon
                        </Button>
                        <Button variant="primary" className="rounded-pill py-2 d-flex align-items-center justify-content-center fw-bold shadow-sm" onClick={() => generateTransferReceipt(movementData, 'download')}>
                            <iconify-icon icon="solar:download-bold" className="me-2" style={{ fontSize: '20px' }}></iconify-icon>
                            Télécharger le Bon (PDF)
                        </Button>
                    </div>
                </Modal.Body>
            ) : (
                <Form onSubmit={handleRestockSubmit}>
                    <Modal.Body>
                        <Alert variant="info" className="small">
                            Transférez des articles depuis le Dépôt Principal vers une boutique secondaire.
                        </Alert>
                        {message.text && <Alert variant={message.type}>{message.text}</Alert>}
                        
                        <Form.Group className="mb-3">
                            <Form.Label>Depuis la boutique (Source)</Form.Label>
                            <Form.Control 
                                type="text"
                                value={centralShop?.nom || 'Dépôt Principal non trouvé'}
                                disabled
                            />
                        </Form.Group>

                        {centralShop && (
                            <Form.Group className="mb-3">
                                <Form.Label>Sélectionner les articles à transférer</Form.Label>
                                {loading ? <div className="text-center"><Spinner size="sm" /></div> : (
                                    <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #dee2e6', padding: '10px', borderRadius: '4px' }}>
                                        {centralShopArticles.length > 0 ? (
                                            <>
                                            <Form.Check 
                                                type="checkbox"
                                                label="Tout sélectionner"
                                                checked={selectedRestockArticles.length === centralShopArticles.length && centralShopArticles.length > 0}
                                                onChange={(e) => {
                                                    if (e.target.checked) setSelectedRestockArticles(centralShopArticles.map(a => a._id));
                                                    else {
                                                        setSelectedRestockArticles([]);
                                                        setRestockQuantities({});
                                                    }
                                                }}
                                                className="mb-2 fw-bold text-primary"
                                            />
                                            {centralShopArticles.map(article => (
                                                <div key={article._id} className="d-flex align-items-center justify-content-between mb-2 border-bottom pb-1">
                                                    <Form.Check 
                                                        type="checkbox"
                                                        label={`${article.nom} (Dispo: ${article.quantite})`}
                                                        checked={selectedRestockArticles.includes(article._id)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setSelectedRestockArticles([...selectedRestockArticles, article._id]);
                                                                setRestockQuantities(prev => ({...prev, [article._id]: article.quantite}));
                                                            } else {
                                                                setSelectedRestockArticles(selectedRestockArticles.filter(id => id !== article._id));
                                                            }
                                                        }}
                                                        className="flex-grow-1"
                                                    />
                                                    {selectedRestockArticles.includes(article._id) && (
                                                        <Form.Control 
                                                            type="number" 
                                                            min="1" 
                                                            max={article.quantite}
                                                            value={restockQuantities[article._id] !== undefined ? restockQuantities[article._id] : article.quantite}
                                                            onChange={(e) => setRestockQuantities({...restockQuantities, [article._id]: e.target.value === '' ? '' : parseInt(e.target.value)})}
                                                            style={{ width: '80px' }}
                                                            size="sm"
                                                            onClick={(e) => e.stopPropagation()}
                                                        />
                                                    )}
                                                </div>
                                            ))}
                                            </>
                                        ) : <p className="text-muted small mb-0">Aucun article dans le dépôt principal.</p>}
                                    </div>
                                )}
                            </Form.Group>
                        )}

                        <Form.Group className="mb-3">
                            <Form.Label className="fw-bold">Nom du transporteur</Form.Label>
                            <Form.Control 
                                type="text"
                                value={nomTransporteur}
                                onChange={(e) => setNomTransporteur(e.target.value)}
                                placeholder="Ex: Diallo Transport, Taxi-moto N°5, etc."
                            />
                        </Form.Group>

                        <Form.Group className="mb-3">
                            <Form.Label>Vers la boutique (Destination)</Form.Label>
                            <Form.Select 
                                value={restockTargetId}
                                onChange={(e) => setRestockTargetId(e.target.value)}
                                required
                            >
                                <option value="">Sélectionner une boutique secondaire...</option>
                                {boutiques.filter(b => b.type !== 'Centrale').map(b => <option key={b._id} value={b._id}>{b.nom}</option>)}
                            </Form.Select>
                        </Form.Group>
                    </Modal.Body>
                </Form>
            )}
            <Modal.Footer>
                {movementData ? (
                    <Button variant="secondary" className="rounded-pill px-4" onClick={() => { onSuccess("Réapprovisionnement terminé"); handleClose(); }}>Terminer</Button>
                ) : (
                    <>
                        <Button variant="secondary" onClick={handleClose}>Fermer</Button>
                        <Button variant="success" type="submit" onClick={handleRestockSubmit} disabled={restockLoading || loading}>
                            {restockLoading ? <Spinner as="span" animation="border" size="sm" /> : 'Réapprovisionner'}
                        </Button>
                    </>
                )}
            </Modal.Footer>
        </Modal>
    );
};

export default RestockModal;