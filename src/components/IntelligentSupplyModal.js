/**
 * @file IntelligentSupplyModal.js
 * @description Modale d'approvisionnement intelligent avec suggestions.
 */

import React, { useState, useEffect } from 'react';
import { Modal, Button, Form, Row, Col, Table, Spinner, Card, InputGroup } from 'react-bootstrap';
import { fournisseurAPI } from '../../services/api';
import { toast } from 'react-toastify';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logo from '../../assets/logo.png';

/**
 * Modale d'Approvisionnement Intelligent
 * Permet de réapprovisionner rapidement un lot d'articles sélectionnés (ex: stock faible)
 * Génère un Bon d'Entrée (PDF) professionnel après validation.
 */
const IntelligentSupplyModal = ({ show, onHide, onSuccess, articlesToSupply, preSelectedFournisseurId }) => {
    const [fournisseurs, setFournisseurs] = useState([]);
    const [supplyData, setSupplyData] = useState({ 
        fournisseurId: '', 
        items: [], 
        imageJustificatif: '',
        referenceFournisseur: '',
        dateReception: new Date().toISOString().split('T')[0]
    });
    const [submitLoading, setSubmitLoading] = useState(false);
    const [movementData, setMovementData] = useState(null);

    const prevShowRef = React.useRef(false);
    useEffect(() => {
        if (show && !prevShowRef.current) {
            loadFournisseurs();
            const items = articlesToSupply.map(a => ({
                articleId: a._id,
                nom: a.nom,
                quantite: 10,
                prixAchat: a.prixAchat || 0,
                prixVente: a.prixVente || 0,
                code: a.code || '',
                categorie: a.categorie || 'Divers'
            }));
            setSupplyData({ 
                fournisseurId: preSelectedFournisseurId || '', 
                items, 
                imageJustificatif: '',
                referenceFournisseur: '',
                dateReception: new Date().toISOString().split('T')[0]
            });
            setMovementData(null);
        }
        prevShowRef.current = show;
    }, [show]); // eslint-disable-line react-hooks/exhaustive-deps

    const loadFournisseurs = async () => {
        try {
            const res = await fournisseurAPI.getAll();
            setFournisseurs(Array.isArray(res) ? res : (res.data && Array.isArray(res.data) ? res.data : []));
        } catch (err) { /* Erreur gérée par l'intercepteur Axios */ }
    };

    const handleItemChange = (index, field, value) => {
        const updatedItems = [...supplyData.items];
        updatedItems[index][field] = value;
        setSupplyData({ ...supplyData, items: updatedItems });
    };

    const handleGlobalJustificatifChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                setSupplyData({ ...supplyData, imageJustificatif: event.target.result });
            };
            reader.readAsDataURL(file);
        }
    };

    const handleGeneratePDF = (mvt, action = 'download') => {
        const doc = new jsPDF();
        const formatCurrency = (val) => (val || 0).toLocaleString('fr-FR').replace(/\s/g, ' ') + ' GNF';

        try {
            doc.addImage(logo, 'PNG', 14, 10, 40, 15);
        } catch (e) { console.error("Logo non trouvé", e); }

        doc.setFontSize(18).setTextColor(41, 128, 185).setFont("helvetica", "bold");
        doc.text("BON D'ENTRÉE EN STOCK (INTEL)", 105, 20, { align: 'center' });

        doc.setFontSize(10).setTextColor(100).setFont("helvetica", "normal");
        doc.text(`N° Bon : #BE-${mvt._id.toString().slice(-6).toUpperCase()}`, 105, 27, { align: 'center' });
        doc.text(`Date : ${new Date(mvt.createdAt).toLocaleString('fr-FR')}`, 196, 20, { align: 'right' });

        const tableColumn = ["Désignation", "Qté", "P. Achat", "P. Vente", "Total (Achat)"];
        const tableRows = mvt.articles.map(a => [
            a.nomArticle,
            a.quantite,
            formatCurrency(a.prixAchatUnitaire),
            formatCurrency(a.prixVenteUnitaire),
            formatCurrency(a.quantite * a.prixAchatUnitaire)
        ]);

        const totalGlobal = mvt.articles.reduce((sum, a) => sum + (a.quantite * (a.prixAchatUnitaire || 0)), 0);
        tableRows.push([
            { content: 'VALEUR TOTALE DU BON D\'ENTRÉE', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold', fillColor: [240, 240, 240] } },
            { content: formatCurrency(totalGlobal), styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } }
        ]);

        autoTable(doc, {
            startY: 40,
            head: [tableColumn],
            body: tableRows,
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185], halign: 'center' },
            columnStyles: {
                1: { halign: 'center' },
                2: { halign: 'right' },
                3: { halign: 'right' },
                4: { halign: 'right' }
            }
        });

        let finalY = doc.lastAutoTable.finalY + 15;
        if (finalY > 250) { doc.addPage(); finalY = 20; }

        doc.setFontSize(11).setTextColor(0).setFont("helvetica", "bold");
        doc.text("LE FOURNISSEUR (VISA)", 14, finalY);
        doc.text("LE RÉCEPTIONNAIRE (DÉPÔT)", 105, finalY);
        
        doc.setFontSize(10).setFont("helvetica", "normal").setTextColor(80);
        doc.text(mvt.fournisseur?.nom || 'N/A', 14, finalY + 7);
        doc.text(mvt.boutiqueDestination?.nom || 'Dépôt Principal', 105, finalY + 7);
        
        doc.setFontSize(9).setTextColor(150);
        doc.text("Précédé de la mention 'Bon pour livraison'", 14, finalY + 15);
        doc.text("Précédé de la mention 'Vérifié et Accepté'", 105, finalY + 15);

        doc.setDrawColor(200).line(14, finalY + 35, 70, finalY + 35);
        doc.line(105, finalY + 35, 160, finalY + 35);

        if (action === 'preview') {
            window.open(doc.output('bloburl'), '_blank');
        } else if (action === 'print') {
            doc.autoPrint();
            window.open(doc.output('bloburl'), '_blank');
        } else {
            doc.save(`bon_entree_intelligent_${mvt._id.toString().slice(-6)}.pdf`);
        }
    };

    const submitSupply = async () => {
        if (!supplyData.fournisseurId) {
            toast.error("Veuillez sélectionner un fournisseur.");
            return;
        }
        setSubmitLoading(true);
        try {
            const res = await fournisseurAPI.approvisionner(supplyData);
            const movement = res.movement || (res.data && res.data.movement);
            if (movement) {
                setMovementData(movement);
            } else {
                onSuccess();
                onHide();
            }
        } catch (err) { /* Erreur gérée par l'intercepteur Axios */
        } finally {
            setSubmitLoading(false);
        }
    };

    return (
        <Modal show={show} onHide={onHide} size="xl">
            <Modal.Header closeButton>
                <Modal.Title>{movementData ? 'Opération Réussie' : 'Réapprovisionnement Intelligent'}</Modal.Title>
            </Modal.Header>
            {movementData ? (
                <Modal.Body className="text-center py-5">
                    <div className="mb-3 text-success">
                        <iconify-icon icon="solar:check-circle-bold-duotone" style={{ fontSize: '72px' }}></iconify-icon>
                    </div>
                    <h4 className="fw-bold mb-3">L'approvisionnement intelligent a été validé !</h4>
                    <p className="text-muted mb-4">Le stock a été mis à jour. Souhaitez-vous générer le Bon d'Entrée (BE) ?</p>
                    <div className="d-flex justify-content-center gap-3">
                        <Button variant="outline-primary" className="rounded-pill px-4 fw-bold" onClick={() => handleGeneratePDF(movementData, 'preview')}>
                            <iconify-icon icon="solar:eye-bold" className="me-2"></iconify-icon> Aperçu PDF
                        </Button>
                        <Button variant="outline-info" className="rounded-pill px-4 fw-bold text-dark" onClick={() => handleGeneratePDF(movementData, 'print')}>
                            <iconify-icon icon="solar:printer-bold" className="me-2"></iconify-icon> Imprimer
                        </Button>
                        <Button variant="primary" className="rounded-pill px-4 shadow-sm fw-bold" onClick={() => handleGeneratePDF(movementData, 'download')}>
                            <iconify-icon icon="solar:download-bold" className="me-2"></iconify-icon> Télécharger PDF
                        </Button>
                    </div>
                </Modal.Body>
            ) : (
                <Modal.Body>
                    <Card className="border-0 bg-light rounded-4 mb-4 shadow-sm">
                        <Card.Body>
                            <Row className="g-3">
                                <Col md={4}>
                                    <Form.Label className="fw-bold small text-uppercase text-muted">Fournisseur</Form.Label>
                                    <Form.Select value={supplyData.fournisseurId} onChange={(e) => setSupplyData({ ...supplyData, fournisseurId: e.target.value })} className="rounded-pill" required>
                                        <option value="">Sélectionner...</option>
                                        {fournisseurs.map(f => <option key={f._id} value={f._id}>{f.nom}</option>)}
                                    </Form.Select>
                                </Col>
                                <Col md={4}>
                                    <Form.Label className="fw-bold small text-uppercase text-muted">Réf. Bon de Livraison (BL)</Form.Label>
                                    <Form.Control type="text" placeholder="Ex: BL-INTEL-001" value={supplyData.referenceFournisseur} onChange={e => setSupplyData({...supplyData, referenceFournisseur: e.target.value})} className="rounded-pill" />
                                </Col>
                                <Col md={4}>
                                    <Form.Label className="fw-bold small text-uppercase text-muted">Date Réception</Form.Label>
                                    <Form.Control type="date" value={supplyData.dateReception} onChange={e => setSupplyData({...supplyData, dateReception: e.target.value})} className="rounded-pill" />
                                </Col>
                            </Row>
                        </Card.Body>
                    </Card>

                    <Form.Group className="mb-4">
                        <Form.Label className="fw-bold text-primary"><iconify-icon icon="solar:camera-bold" className="me-1"></iconify-icon> Photo du Justificatif</Form.Label>
                        <Form.Control type="file" accept="image/*" onChange={handleGlobalJustificatifChange} className="rounded-pill" />
                    </Form.Group>

                    <Table responsive striped bordered hover className="align-middle text-center">
                        <thead className="table-light small text-uppercase">
                            <tr><th>Article</th><th>Quantité</th><th>P. Achat</th><th>P. Vente</th><th>Sous-total</th></tr>
                        </thead>
                        <tbody>
                            {supplyData.items.map((item, idx) => (
                                <tr key={idx}>
                                    <td className="fw-bold text-start">{item.nom}</td>
                                    <td><Form.Control type="number" value={item.quantite} onChange={e => handleItemChange(idx, 'quantite', e.target.value)} size="sm" className="text-center" /></td>
                                    <td><InputGroup size="sm"><Form.Control type="number" value={item.prixAchat} onChange={e => handleItemChange(idx, 'prixAchat', e.target.value)} /><InputGroup.Text>GNF</InputGroup.Text></InputGroup></td>
                                    <td><InputGroup size="sm"><Form.Control type="number" value={item.prixVente} onChange={e => handleItemChange(idx, 'prixVente', e.target.value)} /><InputGroup.Text>GNF</InputGroup.Text></InputGroup></td>
                                    <td className="text-end fw-bold">{(item.quantite * item.prixAchat).toLocaleString()} GNF</td>
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                </Modal.Body>
            )}
            <Modal.Footer>
                {movementData ? (
                    <Button variant="secondary" onClick={() => { onSuccess(); onHide(); }} className="rounded-pill px-4">Fermer</Button>
                ) : (
                    <>
                        <Button variant="secondary" onClick={onHide}>Annuler</Button>
                        <Button variant="success" onClick={submitSupply} disabled={submitLoading || supplyData.items.length === 0} className="rounded-pill px-4 shadow-sm fw-bold">
                            {submitLoading ? <Spinner size="sm" /> : 'Valider le Lot'}
                        </Button>
                    </>
                )}
            </Modal.Footer>
        </Modal>
    );
};

export default IntelligentSupplyModal;