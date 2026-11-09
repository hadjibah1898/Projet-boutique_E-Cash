/* eslint-disable */
/**
 * @file SupplyModal.js
 * @description Modale d'approvisionnement/reapprovisionnement de stock.
 */

import React, { useState, useEffect } from 'react';
import { Modal, Button, Form, Row, Col, Table, Alert, InputGroup, Spinner, Badge, Card } from 'react-bootstrap';
import { fournisseurAPI, articleAPI } from '../services/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logo from '../assets/logo.png';

const SupplyModal = ({ show, onHide, onSuccess }) => {
    const [fournisseurs, setFournisseurs] = useState([]);
    const [articles, setArticles] = useState([]); 
    const [supplierProducts, setSupplierProducts] = useState([]); 
    const [supplyData, setSupplyData] = useState({ fournisseurId: '', items: [], imageJustificatif: '' });
    const [customCategories, setCustomCategories] = useState([]);
    const [newItem, setNewItem] = useState({ nom: '', quantite: 10, prixAchat: 0, prixVente: 0, image: '', code: '', datePeremption: '', categorie: 'Divers' });
    
    const [isNewProduct, setIsNewProduct] = useState(false); 

    const [error, setError] = useState('');
    const [submitLoading, setSubmitLoading] = useState(false);
    const [movementData, setMovementData] = useState(null);

    useEffect(() => {
        if (show) {
            loadData();
            setSupplyData({ fournisseurId: '', items: [], imageJustificatif: '' });
            setNewItem({ nom: '', quantite: 10, prixAchat: 0, prixVente: 0, image: '', code: '', datePeremption: '', categorie: 'Divers' });
            setError('');
            setMovementData(null);
            setSupplierProducts([]);
            setIsNewProduct(false);
        }
    }, [show]);

    useEffect(() => {
        const fetchSupplierProducts = async () => {
            if (supplyData.fournisseurId) {
                try {
                    const res = await fournisseurAPI.getProducts(supplyData.fournisseurId);
                    const products = Array.isArray(res) ? res : (res.data || []);
                    setSupplierProducts(products);
                } catch (err) {
                    console.error("Erreur chargement articles fournisseur:", err);
                    setSupplierProducts([]);
                }
            } else {
                setSupplierProducts([]);
            }
        };
        fetchSupplierProducts();
    }, [supplyData.fournisseurId]);

    const loadData = async () => {
        try {
            const [fournisseursRes, articlesRes] = await Promise.all([
                fournisseurAPI.getAll(),
                articleAPI.getAll()
            ]);
            setFournisseurs(Array.isArray(fournisseursRes) ? fournisseursRes : (fournisseursRes.data && Array.isArray(fournisseursRes.data) ? fournisseursRes.data : []));
            const articlesList = Array.isArray(articlesRes) ? articlesRes : (articlesRes.data && Array.isArray(articlesRes.data) ? articlesRes.data : []);
            setArticles(articlesList);
        } catch (err) {
            setError("Erreur lors du chargement des données.");
        }
    };

    const handleAddCategory = () => {
        const newCat = prompt("Entrez le nom de la nouvelle catégorie :");
        if (newCat && newCat.trim() !== '') {
            const trimmedCat = newCat.trim();
            setCustomCategories(prev => prev.includes(trimmedCat) ? prev : [...prev, trimmedCat]);
            setNewItem(prev => ({ ...prev, categorie: trimmedCat }));
        }
    };

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 500;
                    const MAX_HEIGHT = 500;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_WIDTH) {
                            height *= MAX_WIDTH / width;
                            width = MAX_WIDTH;
                        }
                    } else {
                        if (height > MAX_HEIGHT) {
                            width *= MAX_HEIGHT / height;
                            height = MAX_HEIGHT;
                        }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);
                    setNewItem(prev => ({ ...prev, image: compressedBase64 }));
                };
            };
            reader.readAsDataURL(file);
        }
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

    const handleProductSelect = (productName) => {
        if (productName === 'NOUVEAU_PRODUIT') {
            setIsNewProduct(true);
            setNewItem(prev => ({ ...prev, nom: '' })); 
            return;
        }

        setIsNewProduct(false);
        
        const selectedProduct = supplierProducts.find(p => 
            (p.vcProductName || p.nom || '').toLowerCase() === productName.toLowerCase()
        );
        
        const globalProduct = articles.find(a => 
            (a.nom || a.vcProductName || '').toLowerCase() === productName.toLowerCase()
        );

        if (selectedProduct || globalProduct) {
            setNewItem({
                ...newItem,
                nom: productName,
                prixAchat: selectedProduct?.mReferencePurchasePrice || globalProduct?.prixAchat || 0,
                prixVente: selectedProduct?.mCurrentSalePrice || globalProduct?.prixVente || 0,
                code: selectedProduct?.vcProductCode || globalProduct?.code || '',
                image: selectedProduct?.vcImageUrl || globalProduct?.image || '',
                categorie: selectedProduct?.vcCategoryName || globalProduct?.categorie || 'Divers'
            });
        } else {
            setNewItem(prev => ({ ...prev, nom: productName }));
        }
    };

    const addItemToSupply = () => {
        const quantiteNum = Number(newItem.quantite);
        const prixAchatNum = Number(newItem.prixAchat);
        const prixVenteNum = Number(newItem.prixVente);

        if (!newItem.nom || newItem.nom.trim() === '') {
            setError("Veuillez renseigner le nom de l'article.");
            return;
        }

        if (isNaN(quantiteNum) || quantiteNum <= 0 || isNaN(prixAchatNum) || prixAchatNum <= 0) {
            setError("Veuillez renseigner la quantité et le prix d'achat.");
            return;
        }
        
        if (prixVenteNum > 0 && prixAchatNum >= prixVenteNum) {
            setError("Le prix de vente doit être supérieur au prix d'achat.");
            return;
        }

        setError('');
        const existingItemIndex = supplyData.items.findIndex(item => item.nom === newItem.nom);
    
        if (existingItemIndex > -1) {
            const updatedItems = supplyData.items.map((item, index) => {
                if (index === existingItemIndex) {
                    return {
                        ...item,
                        quantite: item.quantite + quantiteNum,
                        prixAchat: prixAchatNum,
                        mPurchasePrice: prixAchatNum,
                        prixVente: prixVenteNum > 0 ? prixVenteNum : item.prixVente,
                        mSalePrice: prixVenteNum > 0 ? prixVenteNum : item.prixVente,
                        categorie: newItem.categorie
                    };
                }
                return item;
            });
            setSupplyData({ ...supplyData, items: updatedItems });
        } else {
            const itemToAdd = {
                ...newItem,
                quantite: quantiteNum,
                prixAchat: prixAchatNum,
                mPurchasePrice: prixAchatNum,
                prixVente: prixVenteNum,
                mSalePrice: prixVenteNum,
            };
            setSupplyData({ ...supplyData, items: [...supplyData.items, itemToAdd] });
        }

        setNewItem(prev => ({ 
            nom: '', quantite: 10, prixAchat: 0, prixVente: 0, 
            image: '', code: '', datePeremption: '', categorie: prev.categorie 
        }));
        setIsNewProduct(false); 
    };

    const removeItemFromSupply = (index) => {
        const newItems = [...supplyData.items];
        newItems.splice(index, 1);
        setSupplyData({ ...supplyData, items: newItems });
    };

    const handleGeneratePDF = (mvt, action = 'download') => {
        const doc = new jsPDF();
        const formatCurrency = (val) => (val || 0).toLocaleString('fr-FR').replace(/\s/g, ' ') + ' GNF';

        try {
            doc.addImage(logo, 'PNG', 14, 10, 40, 15);
        } catch (e) { console.error(e); }

        doc.setFontSize(18).setTextColor(41, 128, 185).setFont("helvetica", "bold");
        doc.text("BON D'ENTRÉE EN STOCK", 105, 20, { align: 'center' });

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
        
        if (finalY > 250) {
            doc.addPage();
            finalY = 20;
        }

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
        } else {
            doc.save(`bon_entree_${mvt._id.toString().slice(-6)}.pdf`);
        }
    };

    // 🟢 CORRECTION ICI : Ajout du storeId pour le Dépôt Principal
    const submitSupply = async () => {
        if (!supplyData.fournisseurId) {
            setError("Veuillez sélectionner un fournisseur.");
            return;
        }
        setSubmitLoading(true);
        setError('');
        try {
            // On récupère l'ID du dépôt principal depuis le localStorage, sinon on force à 10
            const depotPrincipalId = Number(localStorage.getItem('storeId')) || 10;

            const payload = {
                ...supplyData,
                storeId: depotPrincipalId // 🟢 ON AJOUTE LE STORE ID
            };

            const res = await fournisseurAPI.approvisionner(payload);
            
            const responseData = res.data || res;
            if (responseData && (responseData.success || responseData.message)) {
                onSuccess(responseData.message || "Approvisionnement réussi !");
                onHide();
            } else if (res.data && res.data.movement) {
                setMovementData(res.data.movement);
            } else {
                onSuccess("Approvisionnement réussi !");
                onHide();
            }
        } catch (err) {
            console.error("Erreur approvisionnement:", err);
            setError(err.response?.data?.message || "Erreur lors de l'approvisionnement.");
        } finally {
            setSubmitLoading(false);
        }
    };

    const selectedFournisseur = fournisseurs.find(f => (f.supplierId || f._id) === supplyData.fournisseurId);
    const existingArticle = newItem.nom ? articles.find(a => (a.nom || a.vcProductName) === newItem.nom) : null;

    return (
            <Modal show={show} onHide={onHide} size="xl">
                <Modal.Header closeButton>
                    <Modal.Title>{movementData ? 'Opération Réussie' : 'Approvisionner le Dépôt Principal'}</Modal.Title>
                </Modal.Header>
                {movementData ? (
                    <Modal.Body className="text-center py-5">
                        <div className="mb-3 text-success">
                            <iconify-icon icon="solar:check-circle-bold-duotone" style={{ fontSize: '72px' }}></iconify-icon>
                        </div>
                        <h4 className="fw-bold mb-3">Approvisionnement enregistré avec succès !</h4>
                        <p className="text-muted mb-4">L'inventaire du dépôt principal a été mis à jour. Souhaitez-vous consulter le Bon d'Entrée ?</p>
                        
                        <div className="d-flex justify-content-center gap-3">
                            <Button variant="outline-primary" className="rounded-pill px-4 py-2 d-flex align-items-center fw-bold" onClick={() => handleGeneratePDF(movementData, 'preview')}>
                                <iconify-icon icon="solar:eye-bold" className="me-2" style={{ fontSize: '20px' }}></iconify-icon>
                                Aperçu du Bon
                            </Button>
                            <Button variant="primary" className="rounded-pill px-4 py-2 d-flex align-items-center fw-bold shadow-sm" onClick={() => handleGeneratePDF(movementData, 'download')}>
                                <iconify-icon icon="solar:download-bold" className="me-2" style={{ fontSize: '20px' }}></iconify-icon>
                                Télécharger (PDF)
                            </Button>
                        </div>
                    </Modal.Body>
                ) : (
                    <Modal.Body>
                        {error && <Alert variant="danger">{error}</Alert>}

                        <Card className="border-0 bg-light rounded-4 mb-4 shadow-sm">
                            <Card.Body>
                                <Row className="g-3">
                                    <Col md={4}>
                                        <Form.Label className="fw-bold small text-uppercase text-muted">Fournisseur</Form.Label>
                                        <Form.Select 
                                            value={supplyData.fournisseurId}
                                            onChange={(e) => setSupplyData({ ...supplyData, fournisseurId: e.target.value, items: [] })}
                                            className="rounded-pill border-0 shadow-sm"
                                        >
                                            <option value="">Sélectionner...</option>
                                            {fournisseurs.map(f => (
                                                <option key={f.supplierId || f._id} value={f.supplierId || f._id}>
                                                    {f.vcBusinessName || f.nom}
                                                </option>
                                            ))}
                                        </Form.Select>
                                    </Col>
                                    <Col md={4}>
                                        <Form.Label className="fw-bold small text-uppercase text-muted">Réf. Bon de Livraison (BL)</Form.Label>
                                        <Form.Control 
                                            type="text" 
                                            placeholder="Ex: BL-2024-001" 
                                            value={supplyData.referenceFournisseur || ''} 
                                            onChange={e => setSupplyData({...supplyData, referenceFournisseur: e.target.value})}
                                            className="rounded-pill border-0 shadow-sm"
                                        />
                                    </Col>
                                    <Col md={4}>
                                        <Form.Label className="fw-bold small text-uppercase text-muted">Date Réception</Form.Label>
                                        <Form.Control 
                                            type="date" 
                                            value={supplyData.dateReception || ''} 
                                            onChange={e => setSupplyData({...supplyData, dateReception: e.target.value})}
                                            className="rounded-pill border-0 shadow-sm"
                                        />
                                    </Col>
                                </Row>
                            </Card.Body>
                        </Card>

                        {supplyData.fournisseurId && (
                            <Form.Group className="mb-4">
                                <Form.Label className="fw-bold text-primary">
                                    <iconify-icon icon="solar:camera-bold" className="me-1"></iconify-icon> Photo du Bon de Livraison (Justificatif)
                                </Form.Label>
                                <Form.Control 
                                    type="file" 
                                    accept="image/*" 
                                    capture="environment" 
                                    onChange={handleGlobalJustificatifChange} 
                                    className="bg-light rounded-pill shadow-sm"
                                />
                                {supplyData.imageJustificatif && (
                                    <div className="mt-2 text-center">
                                        <img src={supplyData.imageJustificatif} alt="Justificatif" className="img-fluid rounded-4 shadow-sm border" style={{maxHeight: '120px'}} />
                                        <Button variant="link" size="sm" className="text-danger d-block mx-auto mt-1" onClick={() => setSupplyData({...supplyData, imageJustificatif: ''})}>Retirer la photo</Button>
                                    </div>
                                )}
                            </Form.Group>
                        )}

                        {supplyData.fournisseurId && (
                            <div className="p-3 bg-light rounded mb-3">
                                <Row className="g-3">
                                    <Col md={12} lg={5}>
                                        <Form.Label>Article</Form.Label>
                                        <Form.Select
                                            value={isNewProduct ? 'NOUVEAU_PRODUIT' : (newItem.nom || '')}
                                            onChange={e => handleProductSelect(e.target.value)}
                                            className="border-primary"
                                        >
                                            <option value="">-- Sélectionner un article --</option>
                                            
                                            {supplierProducts.length > 0 && (
                                                <optgroup label="Articles de ce fournisseur">
                                                    {supplierProducts.map((p, i) => (
                                                        <option key={`sup-${i}`} value={p.vcProductName || p.nom}>
                                                            {p.vcProductName || p.nom} (Achat: {(p.mReferencePurchasePrice || 0).toLocaleString()} GNF)
                                                        </option>
                                                    ))}
                                                </optgroup>
                                            )}

                                            <optgroup label="Catalogue général (Tous les articles)">
                                                {articles.map((p, i) => (
                                                    <option key={`all-${i}`} value={p.nom || p.vcProductName}>
                                                        {p.nom || p.vcProductName}
                                                    </option>
                                                ))}
                                            </optgroup>

                                            <optgroup label="Nouveau">
                                                <option value="NOUVEAU_PRODUIT" className="fw-bold text-primary">+ Saisir un nouvel article</option>
                                            </optgroup>
                                        </Form.Select>
                                    </Col>
                                    
                                    {isNewProduct && (
                                        <Col md={12} lg={4}>
                                            <Form.Label className="text-primary">Nom du nouvel article</Form.Label>
                                            <Form.Control 
                                                type="text" 
                                                placeholder="Taper le nom..." 
                                                value={newItem.nom || ''}
                                                onChange={(e) => setNewItem({...newItem, nom: e.target.value})}
                                                autoFocus
                                            />
                                        </Col>
                                    )}

                                    <Col md={4} lg={2}>
                                        <Form.Label>Qté</Form.Label>
                                        <Form.Control type="number" value={newItem.quantite || 0} onChange={e => setNewItem({...newItem, quantite: e.target.value})} />
                                    </Col>
                                    <Col md={4} lg={2}>
                                        <Form.Label>P. Achat</Form.Label>
                                        <Form.Control type="number" value={newItem.prixAchat || 0} onChange={e => setNewItem({...newItem, prixAchat: e.target.value})} />
                                    </Col>
                                    <Col md={4} lg={3}>
                                        <Form.Label>P. Vente</Form.Label>
                                        <Form.Control type="number" value={newItem.prixVente || 0} onChange={e => setNewItem({...newItem, prixVente: e.target.value})} />
                                    </Col>
                                    <Col md={4} lg={3}>
                                        <Form.Label>Code Article</Form.Label>
                                        <Form.Control type="text" placeholder="REF-001" value={newItem.code || ''} onChange={e => setNewItem({...newItem, code: e.target.value})} />
                                    </Col>
                                    <Col md={4} lg={3}>
                                        <Form.Label>Catégorie</Form.Label>
                                        <InputGroup>
                                            <Form.Select 
                                                value={newItem.categorie} 
                                                onChange={e => setNewItem({...newItem, categorie: e.target.value})}
                                            >
                                                {[...new Set(['Divers', 'Fast food', 'Restauration', 'Boulangerie', 'Boucherie', 'Habillement', ...articles.map(a => a.categorie).filter(Boolean), ...customCategories])].sort().map(cat => (
                                                    <option key={cat} value={cat}>{cat}</option>
                                                ))}
                                            </Form.Select>
                                            <Button 
                                                variant="outline-primary" 
                                                onClick={handleAddCategory}
                                                title="Ajouter une nouvelle catégorie"
                                            >
                                                <iconify-icon icon="solar:add-circle-bold" style={{ verticalAlign: 'middle' }}></iconify-icon>
                                            </Button>
                                        </InputGroup>
                                    </Col>
                                    <Col md={4} lg={3}>
                                        <Form.Label>Date Péremption</Form.Label>
                                        <Form.Control type="date" value={newItem.datePeremption || ''} onChange={e => setNewItem({...newItem, datePeremption: e.target.value})} />
                                    </Col>
                                    <Col md={12} lg={3}>
                                        <Form.Label><iconify-icon icon="solar:camera-bold" className="me-1"></iconify-icon> Image (Optionnel)</Form.Label>
                                        <Form.Control type="file" accept="image/*" capture="environment" onChange={handleImageChange} size="sm" />
                                    </Col>
                                </Row>
                                <Row className="mt-3">
                                    <Col md={9}>
                                        {newItem.image && (
                                            <div className="d-flex align-items-center gap-2">
                                                <img src={newItem.image} alt="Aperçu" className="rounded shadow-sm" style={{maxHeight: '50px'}} />
                                                <Button variant="link" size="sm" className="text-danger p-0" onClick={() => setNewItem(prev => ({...prev, image: ''}))}>Retirer</Button>
                                            </div>
                                        )}
                                    </Col>
                                    <Col md={3} className="d-flex align-items-end">
                                        <Button variant="primary" className="w-100" onClick={addItemToSupply}>Ajouter au lot</Button>
                                    </Col>
                                </Row>
                                {existingArticle && (
                                    <div className="mt-3 p-2 bg-white rounded border border-2 small">
                                        <strong>Info Article Existant :</strong> Stock actuel: <Badge bg="info">{existingArticle.quantite || 0}</Badge>
                                    </div>
                                )}
                            </div>
                        )}

                        <Table striped bordered hover size="sm">
                            <thead>
                                <tr className="text-center">
                                    <th>Article</th><th>Catégorie</th><th>Qté</th><th>P. Achat</th><th>P. Vente</th><th>Total</th><th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {supplyData.items.map((item, idx) => (
                                    <tr key={idx}>
                                        <td>{item.nom}</td>
                                        <td className="text-center"><Badge bg="info" pill>{item.categorie || 'Divers'}</Badge></td>
                                        <td className="text-center">{item.quantite}</td>
                                        <td className="text-end">{Number(item.prixAchat || 0).toLocaleString()} GNF</td>
                                        <td className="text-end">{Number(item.prixVente || 0).toLocaleString()} GNF</td>
                                        <td className="fw-bold">{Number((item.quantite * item.prixAchat) || 0).toLocaleString()} GNF</td>
                                        <td className="text-center"><Button variant="link" className="text-danger p-0" onClick={() => removeItemFromSupply(idx)}>Suppr.</Button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </Table>
                    </Modal.Body>
                )}
                <Modal.Footer>
                    {movementData ? (
                        <Button variant="secondary" className="rounded-pill px-4 fw-bold" onClick={() => { onSuccess("Approvisionnement terminé"); onHide(); }}>
                            Terminer
                        </Button>
                    ) : (
                        <>
                            <Button variant="secondary" onClick={onHide} disabled={submitLoading}>Annuler</Button>
                            <Button variant="success" onClick={submitSupply} disabled={supplyData.items.length === 0 || submitLoading}>
                                {submitLoading ? <Spinner as="span" size="sm" /> : 'Valider l\'Approvisionnement'}
                            </Button>
                        </>
                    )}
                </Modal.Footer>
            </Modal>
    );
};

export default SupplyModal;