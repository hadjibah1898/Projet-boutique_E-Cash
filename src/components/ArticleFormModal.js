/**
 * @file ArticleFormModal.js
 * @description Modale formulaire de création/édition d'article.
 */

import React, { useMemo } from 'react';
import { Modal, Form, Row, Col, Button, InputGroup, Badge } from 'react-bootstrap';

/**
 * Composant Modale pour la création et la modification d'articles.
 * Isolé pour une meilleure maintenabilité.
 */
const ArticleFormModal = ({
    show, 
    onHide, 
    editMode, 
    handleSubmit, 
    currentArticle, 
    setCurrentArticle, 
    handleImageChange, 
    generateUniqueCode, 
    handleChange, 
    fieldErrors, 
    availableCategories, 
    handleAddCategory, 
    boutiques, 
    fournisseurs, 
    userRole
}) => {
    // Calcul automatique du prix TTC à partir du prix HT et de la TVA
    const prixVenteTTC = useMemo(() => {
        const ht = parseFloat(currentArticle.prixVente) || 0;
        const tva = parseFloat(currentArticle.tva) || 0;
        return ht * (1 + tva / 100);
    }, [currentArticle.prixVente, currentArticle.tva]);

    return (
        <Modal show={show} onHide={onHide} size="lg" centered>
            <Modal.Header closeButton className="bg-light">
                <Modal.Title className="fw-bold">
                    {editMode ? (
                        <><iconify-icon icon="solar:pen-new-square-bold" className="me-2 align-middle text-primary"></iconify-icon> Modifier l'Article</>
                    ) : (
                        <><iconify-icon icon="solar:add-circle-bold" className="me-2 align-middle text-success"></iconify-icon> Nouvel Article</>
                    )}
                </Modal.Title>
            </Modal.Header>
            <Form onSubmit={handleSubmit}>
                <Modal.Body className="p-4">
                    <Form.Group className="mb-4">
                        <Form.Label className="fw-bold text-muted small text-uppercase">Image du produit</Form.Label>
                        <div className="d-flex align-items-center gap-3">
                            <div 
                                className="bg-light rounded-4 d-flex align-items-center justify-content-center overflow-hidden border shadow-sm"
                                style={{ width: '100px', height: '100px' }}
                            >
                                {currentArticle.image ? (
                                    <img src={currentArticle.image} alt="Aperçu" className="img-fluid h-100 w-100" style={{ objectFit: 'cover' }} />
                                ) : (
                                    <iconify-icon icon="solar:camera-linear" style={{ fontSize: '32px' }} className="text-muted"></iconify-icon>
                                )}
                            </div>
                            <div className="flex-grow-1">
                                <Form.Control 
                                    type="file" 
                                    accept="image/*" 
                                    capture="environment" 
                                    onChange={handleImageChange}
                                    className="rounded-pill shadow-sm"
                                />
                                <Form.Text className="text-muted small ps-2">Capturez une photo (mobile) ou choisissez un fichier.</Form.Text>
                                {currentArticle.image && (
                                    <Button variant="link" size="sm" className="text-danger p-0 d-block mt-1 ps-2" onClick={() => setCurrentArticle({ ...currentArticle, image: '' })}>
                                        Supprimer l'image
                                    </Button>
                                )}
                            </div>
                        </div>
                    </Form.Group>

                    <Row className="g-3">
                        <Col md={4}>
                            <Form.Group className="mb-3">
                                <Form.Label className="fw-bold text-muted small text-uppercase">Code Article (Référence)</Form.Label>
                                <InputGroup className="shadow-sm rounded-pill overflow-hidden">
                                    <Form.Control
                                        type="text"
                                        name="code"
                                        value={currentArticle.code}
                                        onChange={handleChange}
                                        isInvalid={!!fieldErrors.code}
                                        placeholder="Ex: REF-001"
                                        className="border-end-0"
                                    />
                                    <Button variant="outline-secondary" className="border-start-0" onClick={() => setCurrentArticle(prev => ({ ...prev, code: generateUniqueCode() }))}>
                                        <iconify-icon icon="solar:magic-wand-bold-duotone" className="me-1"></iconify-icon>
                                        Générer
                                    </Button>
                                    <Form.Control.Feedback type="invalid" className="ps-3">
                                        {fieldErrors.code}
                                    </Form.Control.Feedback>
                                </InputGroup>
                            </Form.Group>
                        </Col>
                        <Col md={6}>
                            <Form.Group className="mb-3">
                                <Form.Label className="fw-bold text-muted small text-uppercase">Catégorie</Form.Label>
                                <InputGroup className="shadow-sm rounded-pill overflow-hidden">
                                    <Form.Select
                                        name="categorie"
                                        value={currentArticle.categorie || 'Divers'}
                                        onChange={handleChange}
                                        isInvalid={!!fieldErrors.categorie}
                                        required
                                        className="border-end-0"
                                    >
                                        {availableCategories.sort().map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </Form.Select>
                                    <Button 
                                        variant="outline-primary" 
                                        className="border-start-0"
                                        onClick={handleAddCategory}
                                        title="Ajouter une nouvelle catégorie"
                                    >
                                        <iconify-icon icon="solar:add-circle-bold" style={{ verticalAlign: 'middle' }}></iconify-icon>
                                    </Button>
                                </InputGroup>
                                {fieldErrors.categorie && (
                                    <div className="text-danger small mt-1 ps-3">{fieldErrors.categorie}</div>
                                )}
                            </Form.Group>
                        </Col>
                    </Row>

                    <Row className="g-3">
                        <Col md={4}>
                            <Form.Group className="mb-3">
                               
                            </Form.Group>
                        </Col>
                        <Col md={4}>
                           
                        </Col>
                        <Col md={4}>
                           
                        </Col>
                    </Row>

                    <Form.Group className="mb-3">
                        <Form.Label className="fw-bold text-muted small text-uppercase">Nom de l'article</Form.Label>
                        <Form.Control
                            type="text"
                            name="nom"
                            value={currentArticle.nom}
                            onChange={handleChange}
                            isInvalid={!!fieldErrors.nom}
                            required
                            placeholder="Désignation du produit..."
                            className="rounded-pill shadow-sm"
                        />
                        <Form.Control.Feedback type="invalid" className="ps-3">
                            {fieldErrors.nom}
                        </Form.Control.Feedback>
                    </Form.Group>

                    <Row className="g-3">
                        <Col md={6}>
                            <Form.Group className="mb-3">
                                <Form.Label className="fw-bold text-muted small text-uppercase">Boutique</Form.Label>
                                <Form.Select
                                    name="boutique"
                                    value={currentArticle.boutique?._id || currentArticle.boutique || ''}
                                    onChange={handleChange}
                                    isInvalid={!!fieldErrors.boutique}
                                    required
                                    disabled={userRole !== 'Admin'}
                                    className="rounded-pill shadow-sm"
                                >
                                    <option value="">Sélectionner une boutique</option>
                                    {(boutiques || []).map(boutique => (
                                        <option key={boutique._id} value={boutique._id}>
                                            {boutique.type === 'Bar' && 'BAR : '}
                                            {boutique.type === 'Centrale' && 'CENTRALE : '}
                                            {boutique.type === 'Secondaire' && 'BOUTIQUE : '}
                                            {boutique.nom}
                                        </option>
                                    ))}
                                </Form.Select>
                                <Form.Control.Feedback type="invalid" className="ps-3">
                                    {fieldErrors.boutique}
                                </Form.Control.Feedback>
                            </Form.Group>
                        </Col>
                        <Col md={6}>
                            <Form.Group className="mb-3">
                                <Form.Label className="fw-bold text-muted small text-uppercase">Fournisseur</Form.Label>
                                <Form.Select
                                    name="fournisseur"
                                    value={currentArticle.fournisseur?._id || currentArticle.fournisseur || ''}
                                    onChange={handleChange}
                                    disabled={userRole !== 'Admin'}
                                    className="rounded-pill shadow-sm"
                                >
                                    <option value="">Sélectionner un fournisseur</option>
                                    {(fournisseurs || []).map(fournisseur => (
                                        <option key={fournisseur._id} value={fournisseur._id}>
                                            {fournisseur.nom}
                                        </option>
                                    ))}
                                </Form.Select>
                            </Form.Group>
                        </Col>
                    </Row>

                    <Row className="g-3">
                        <Col md={6}>
                            <Form.Group className="mb-3">
                                <Form.Label className="fw-bold text-muted small text-uppercase">Prix d'achat (GNF)</Form.Label>
                                <InputGroup className="shadow-sm rounded-pill overflow-hidden">
                                    <Form.Control
                                        type="number"
                                        name="prixAchat"
                                        value={currentArticle.prixAchat}
                                        onChange={handleChange}
                                        min="0"
                                        step="0.01"
                                        isInvalid={!!fieldErrors.prixAchat}
                                        required
                                    />
                                    <InputGroup.Text className="bg-light">GNF</InputGroup.Text>
                                    <Form.Control.Feedback type="invalid" className="ps-3">
                                        {fieldErrors.prixAchat}
                                    </Form.Control.Feedback>
                                </InputGroup>
                            </Form.Group>
                        </Col>
                        <Col md={4}>
                            <Form.Group className="mb-3">
                                <Form.Label className="fw-bold text-muted small text-uppercase">Prix de vente HT (GNF)</Form.Label>
                                <InputGroup className="shadow-sm rounded-pill overflow-hidden">
                                    <Form.Control
                                        type="number"
                                        name="prixVente"
                                        value={currentArticle.prixVente}
                                        onChange={handleChange}
                                        min="0"
                                        step="0.01"
                                        isInvalid={!!fieldErrors.prixVente}
                                        required
                                    />
                                    <InputGroup.Text className="bg-light">GNF</InputGroup.Text>
                                    <Form.Control.Feedback type="invalid" className="ps-3">
                                        {fieldErrors.prixVente}
                                    </Form.Control.Feedback>
                                </InputGroup>
                            </Form.Group>
                        </Col>
                        <Col md={4}>
                            <Form.Group className="mb-3">
                                <Form.Label className="fw-bold text-primary small text-uppercase">Prix de vente TTC</Form.Label>
                                <InputGroup className="shadow-sm rounded-pill overflow-hidden border border-primary border-opacity-25">
                                    <Form.Control
                                        type="text"
                                        value={prixVenteTTC.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                        disabled
                                        className="bg-primary bg-opacity-10 fw-bold text-primary border-0"
                                    />
                                    <InputGroup.Text className="bg-primary text-white border-0 small fw-bold">TTC</InputGroup.Text>
                                </InputGroup>
                            </Form.Group>
                        </Col>
                    </Row>

                    <Row className="g-3">
                        <Col md={6}>
                            <Form.Group className="mb-3">
                                <Form.Label className="fw-bold text-muted small text-uppercase">Quantité initiale</Form.Label>
                                <Form.Control
                                    type="number"
                                    name="quantite"
                                    value={currentArticle.quantite}
                                    onChange={handleChange}
                                    disabled={editMode}
                                    isInvalid={!!fieldErrors.quantite}
                                    min="0"
                                    required
                                    className="rounded-pill shadow-sm"
                                />
                                <Form.Control.Feedback type="invalid" className="ps-3">
                                    {fieldErrors.quantite}
                                </Form.Control.Feedback>
                            </Form.Group>
                        </Col>
                        <Col md={6}>
                            <Form.Group className="mb-3">
                                <Form.Label className="fw-bold text-muted small text-uppercase">Date de péremption</Form.Label>
                                <Form.Control
                                    type="date"
                                    name="datePeremption"
                                    value={currentArticle.datePeremption ? currentArticle.datePeremption.split('T')[0] : ''}
                                    onChange={handleChange}
                                    min={new Date().toISOString().split('T')[0]}
                                    className="rounded-pill shadow-sm"
                                />
                            </Form.Group>
                        </Col>
                    </Row>

                    <Form.Group className="mb-3">
                        <Form.Label className="fw-bold text-muted small text-uppercase">Seuil d'alerte stock</Form.Label>
                        <Form.Control
                            type="number"
                            name="seuilAlerte"
                            value={currentArticle.seuilAlerte}
                            onChange={handleChange}
                            min="0"
                            disabled={userRole !== 'Admin'}
                            className="rounded-pill shadow-sm"
                        />
                        <Form.Text className="text-muted small ps-2">Quantité critique pour les alertes (Défaut: 10).</Form.Text>
                    </Form.Group>

                    <Form.Group className="mb-3">
                        <Form.Label className="fw-bold text-muted small text-uppercase">Notes Internes / Description</Form.Label>
                        <Form.Control as="textarea" rows={2} name="description" value={currentArticle.description || ''} onChange={handleChange} placeholder="Informations privées pour le gérant..." className="rounded-4 shadow-sm" />
                    </Form.Group>

                    {/* Section Promotion & Remise (Admin Uniquement) */}
                    {userRole === 'Admin' && (
                        <div className="border-top pt-4 mt-4">
                            <h6 className="text-primary fw-bold mb-3 d-flex align-items-center">
                                <iconify-icon icon="solar:tag-price-bold-duotone" className="me-2"></iconify-icon>
                                Gestion Promotions & Remises
                            </h6>
                            <Row className="g-3 align-items-end">
                                <Col md={6}>
                                    <Form.Group className="mb-3">
                                        <Form.Label className="fw-bold text-muted small text-uppercase">Promotion (%)</Form.Label>
                                        <InputGroup className="shadow-sm rounded-pill overflow-hidden">
                                            <Form.Control
                                                type="number"
                                                name="promo"
                                                value={currentArticle.promo}
                                                onChange={handleChange}
                                                min="0"
                                                max="100"
                                            />
                                            <InputGroup.Text className="bg-light">%</InputGroup.Text>
                                        </InputGroup>
                                    </Form.Group>
                                </Col>
                                <Col md={6}>
                                    <Form.Group className="mb-3">
                                        <Form.Check 
                                            type="switch"
                                            id="promo-switch"
                                            label="Activer la promotion"
                                            name="promoActive"
                                            checked={currentArticle.promoActive}
                                            onChange={handleChange}
                                            className="fw-bold text-muted small text-uppercase"
                                        />
                                    </Form.Group>
                                </Col>
                            </Row>
                            {currentArticle.promoActive && (
                                <Row className="g-3 mb-3">
                                    <Col md={6}>
                                        <Form.Label className="fw-bold text-muted small text-uppercase">Date début</Form.Label>
                                        <Form.Control 
                                            type="date" 
                                            name="dateDebutPromo" 
                                            value={currentArticle.dateDebutPromo ? currentArticle.dateDebutPromo.split('T')[0] : ''} 
                                            onChange={handleChange} 
                                            className="rounded-pill shadow-sm"
                                        />
                                    </Col>
                                    <Col md={6}>
                                        <Form.Label className="fw-bold text-muted small text-uppercase">Date fin</Form.Label>
                                        <Form.Control 
                                            type="date" 
                                            name="dateFinPromo" 
                                            value={currentArticle.dateFinPromo ? currentArticle.dateFinPromo.split('T')[0] : ''} 
                                            onChange={handleChange}
                                            min={currentArticle.dateDebutPromo ? currentArticle.dateDebutPromo.split('T')[0] : ''} 
                                            className="rounded-pill shadow-sm"
                                        />
                                    </Col>
                                </Row>
                            )}
                            <Form.Group className="mb-3">
                                <Form.Label className="fw-bold text-muted small text-uppercase d-flex align-items-center justify-content-between">
                                    Remise exceptionnelle (%) 
                                    {currentArticle.remiseEnAttente?.valeur > 0 && (
                                        <div className="d-flex gap-1">
                                            <Badge bg="success" className="cursor-pointer d-flex align-items-center"
                                                onClick={() => setCurrentArticle({
                                                    ...currentArticle, 
                                                    remise: currentArticle.remiseEnAttente.valeur,
                                                    remiseEnAttente: null
                                                })}
                                                title="Accepter la demande"
                                            >
                                                <iconify-icon icon="solar:check-circle-bold" className="me-1"></iconify-icon>
                                                Accepter {currentArticle.remiseEnAttente.valeur}%
                                            </Badge>
                                            <Badge bg="danger" className="cursor-pointer d-flex align-items-center"
                                                onClick={() => setCurrentArticle({
                                                    ...currentArticle, 
                                                    remiseEnAttente: null 
                                                })}
                                                title="Refuser la demande"
                                            >
                                                <iconify-icon icon="solar:close-circle-bold" className="me-1"></iconify-icon>
                                                Refuser
                                            </Badge>
                                        </div>
                                    )}
                                </Form.Label>
                                <InputGroup className="shadow-sm rounded-pill overflow-hidden">
                                    <Form.Control
                                        type="number"
                                        name="remise"
                                        value={currentArticle.remise}
                                        onChange={handleChange}
                                        min="0"
                                        max="100"
                                        placeholder="Saisir pour valider une remise..."
                                    />
                                    <InputGroup.Text className="bg-light">%</InputGroup.Text>
                                </InputGroup>
                                <Form.Text className="text-muted small ps-2">S'applique si aucune promotion n'est active.</Form.Text>
                            </Form.Group>
                        </div>
                    )}
                </Modal.Body>
                <Modal.Footer className="bg-light border-0 py-3">
                    <Button variant="secondary" className="rounded-pill px-4 fw-bold" onClick={onHide}>Annuler</Button>
                    <Button variant="primary" type="submit" className="rounded-pill px-4 fw-bold shadow-sm">
                        {editMode ? 'Mettre à jour' : 'Créer l\'article'}
                    </Button>
                </Modal.Footer>
            </Form>
        </Modal>
    );
};

export default ArticleFormModal;