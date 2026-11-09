/**
 * @file SaleTab.js
 * @description Ce composant est un composant de présentation ("bête").
 * Il gère l'interface principale de l'onglet "Effectuer une Vente".
 * Il affiche le formulaire d'ajout d'article (par scan ou sélection manuelle), le panier, le total et les options de paiement.
 * Il reçoit toutes les données (articles, clients, panier) et les fonctions de manipulation (ajouter, retirer, valider) via ses props
 * depuis le composant parent `VentesView`.
 */
import React, { useState, useMemo, useEffect } from 'react';
import { Row, Col, Card, Form, InputGroup, Button, Badge, Alert, Spinner, Modal, OverlayTrigger, Tooltip, Offcanvas } from 'react-bootstrap';
import { PlusIcon, MinusIcon } from './ModernIcons';

const SaleTab = ({
    panier,
    userRole,
    setPanier,
    clients,
    articles,
    selectedClientId,
    setSelectedClientId,
    availableCategories, // Récupérer la prop des catégories dynamiques
    setShowClientModal,
    barcodeInputRef,
    barcode,
    setBarcode,
    handleBarcodeScan,
    selectedArticle,
    setSelectedArticle,
    quantite,
    numeroTable,
    setNumeroTable,
    setQuantite, // Renamed prop
    itemRemiseInput, // Renamed prop
    itemRemiseType, // Nouveau prop
    setItemRemiseType, // Nouveau prop
    setItemRemiseInput,
    ajouterAuPanier,
    getEffectivePrice,
    handleImageClick,
    retirerDuPanier,
    montantPaye,
    setMontantPaye,
    modePaiement,
    transactionRef, // Nouveau prop
    setTransactionRef, // Nouveau prop
    setModePaiement,
    echeanceDette,
    setEcheanceDette,
    calculerTotal,
    effectuerVente,
    historique,
    isSubmitting,
    brouillons,
    mettreEnBrouillon,
    chargerBrouillon,
    setBrouillons,
    showMobilePanier,
    setShowMobilePanier,
    boutiqueConfig // Nouvelle prop reçue
}) => {
    // Recherche et filtre catégorie
    const [search, setSearch] = useState('');
    const [activeCategory, setActiveCategory] = useState('all');
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [showDraftsModal, setShowDraftsModal] = useState(false);
    const [cartAnimationTrigger, setCartAnimationTrigger] = useState(false); // État pour déclencher l'animation du panier
    const [expandedTicket, setExpandedTicket] = useState(null);
    const [showViderModal, setShowViderModal] = useState(false);

    // États pour les modales de remise (individuelle et pré-ajout)
    const [showItemDiscountModal, setShowItemDiscountModal] = useState(false);
    const [discountModalItem, setDiscountModalItem] = useState(null);
    const [modalRemiseValue, setModalRemiseValue] = useState('');
    const [modalRemiseType, setModalRemiseType] = useState('montant');
    const [showNextItemDiscountModal, setShowNextItemDiscountModal] = useState(false);

    // Fonction helper pour formater les nombres de manière sécurisée
    const formatPrice = (value) => {
        const num = parseFloat(value) || 0;
        return isNaN(num) ? '0' : num.toLocaleString('fr-FR');
    };

    // Effet pour pré-remplir le numéro de téléphone pour les paiements Fintech
    useEffect(() => {
        const fintechModes = ['Orange Money', 'MobiCash', 'PayCard', 'Virement'];
        if (fintechModes.includes(modePaiement) && selectedClientId && clients) {
            const client = clients.find(c => c.customerId === selectedClientId);
            if (client?.vcPhone) {
                setTransactionRef(client.vcPhone);
            }
        }
    }, [modePaiement, selectedClientId, clients]);

    // Regroupement de l'historique par transaction (basé sur le timestamp et le client)
    const groupedTickets = useMemo(() => {
        const groups = {};
        historique.filter(v => !v.isCancelled).forEach(vente => {
            // Création d'une clé unique basée sur la date (à la seconde près) et le client
            // Cela permet de regrouper les articles validés simultanément
            const dateObj = new Date(vente.createdAt);
            const timeKey = Math.floor(dateObj.getTime() / 1000); // timestamp en secondes
            const key = `${timeKey}-${vente.client?.customerId || 'passage'}`;

            if (!groups[key]) {
                groups[key] = {
                    id: key,
                    date: vente.createdAt,
                    client: vente.client ? `${vente.client.vcFirstName || ''} ${vente.client.vcLastName || ''}`.trim() || 'Passage' : 'Passage',
                    items: [],
                    totalTicket: 0
                };
            }
            groups[key].items.push(vente);
            // Sécuriser l'accès à prixTotal (peut être undefined ou null)
            groups[key].totalTicket += (vente.prixTotal || 0);
        });
        return Object.values(groups).sort((a, b) => new Date(b.date) - new Date(a.date));
    }, [historique]);

    // Articles filtrés
    // Effet pour réinitialiser l'animation du panier
    useEffect(() => {
        if (cartAnimationTrigger) {
            const timer = setTimeout(() => {
                setCartAnimationTrigger(false);
            }, 500); // Durée de l'animation
            return () => clearTimeout(timer);
        }
    }, [cartAnimationTrigger]);

    // Fonctions pour gérer les remises via modale
    const openItemDiscountModal = (e, item) => {
        e.stopPropagation();
        setDiscountModalItem(item);
        setModalRemiseValue(item.remiseTemp || '');
        setModalRemiseType(item.remiseType || 'montant');
        setShowItemDiscountModal(true);
    };

    const applyItemDiscount = () => {
        if (!discountModalItem) return;
        const val = modalRemiseValue === '' ? 0 : parseFloat(modalRemiseValue);
        const newUnitPrice = getEffectivePrice(discountModalItem.article, val, modalRemiseType);
        setPanier(panier.map(p => p.article._id === discountModalItem.article._id ? { ...p, remiseTemp: modalRemiseValue, remiseType: modalRemiseType, prixUnitaire: newUnitPrice, prixTotal: newUnitPrice * p.quantite } : p));
        setShowItemDiscountModal(false);
    };

    const filteredArticles = useMemo(() => {
        let list = articles;
        if (activeCategory !== 'all') {
            list = list.filter(a => a.categorie === activeCategory);
        }
        if (search.trim()) {
            const s = search.trim().toLowerCase();
            list = list.filter(a => a.nom.toLowerCase().includes(s) || (a.code && a.code.toLowerCase().includes(s)));
        }
        return list;
    }, [articles, search, activeCategory]);

    // Sélection rapide d'article (pour ajout au panier)
    const [quickQty, setQuickQty] = useState({});

    const renderPanierCard = (isMobile = false) => (
        <Card className={`border-0 shadow-sm ${!isMobile ? 'rounded-4 mb-4 sticky-md-top' : 'h-100'} ${cartAnimationTrigger ? 'cart-pulse' : ''}`} style={!isMobile ? { top: '1rem', zIndex: 10 } : {}}>
            <Card.Header className="bg-white py-2 py-sm-3 d-flex flex-wrap justify-content-between align-items-center gap-2">
                <h5 className="mb-0 fw-bold d-flex align-items-center">
                    Panier
                    <Badge bg="primary" pill className="ms-2">{panier.reduce((acc, item) => acc + item.quantite, 0)}</Badge>
                </h5>
                <div className="d-flex flex-wrap gap-1 gap-sm-2">
                    <Button variant="outline-warning" size="sm" className="rounded-pill d-flex align-items-center position-relative" onClick={() => setShowDraftsModal(true)} title="Brouillons (Ventes en attente)">
                        <iconify-icon icon="solar:notes-bold-duotone" style={{ fontSize: '18px' }}></iconify-icon>
                        {brouillons && brouillons.length > 0 && (
                            <Badge bg="danger" pill className="position-absolute top-0 start-100 translate-middle border border-light" style={{ fontSize: '0.6em', padding: '0.3em 0.5em' }}>
                                {brouillons.length}
                            </Badge>
                        )}
                    </Button>
                    <Button variant="outline-primary" size="sm" className="rounded-pill d-flex align-items-center position-relative" onClick={() => setShowHistoryModal(true)} title="Historique récent">
                        <iconify-icon icon="solar:history-bold-duotone" style={{ fontSize: '18px' }}></iconify-icon>
                    </Button>
                    {panier.length > 0 && (
                        <Button variant="danger" size="sm" className="rounded-pill fw-bold" onClick={() => setShowViderModal(true)} title="Vider le panier">
                            <iconify-icon icon="solar:trash-bin-trash-bold" className="align-middle"></iconify-icon> Vider
                        </Button>
                    )}
                </div>
            </Card.Header>
            <Card.Body className="p-2 p-sm-3">
                {panier.length > 0 ? (
                    <>
                        <div className="cart-list mb-3 px-1" style={{ maxHeight: isMobile ? 'calc(100vh - 350px)' : '40vh', overflowY: 'auto', overflowX: 'hidden' }}>
                            {panier.map(item => (
                                <div key={item.article._id} className={`d-flex align-items-start py-3 border-bottom gap-2 ${selectedArticle === item.article._id ? 'border border-3 border-primary bg-primary bg-opacity-10' : ''}`} style={{ cursor: 'pointer', borderRadius: selectedArticle === item.article._id ? 12 : 0 }} onClick={() => setSelectedArticle(item.article._id)}>
                                    {item.article.image ? (
                                        <img src={item.article.image} alt="" className="rounded shadow-sm me-2" style={{ width: '40px', height: '40px', objectFit: 'cover' }} />
                                    ) : (
                                        <div className="bg-light rounded d-flex align-items-center justify-content-center me-2" style={{ width: '40px', height: '40px' }}><iconify-icon icon="solar:box-bold" className="text-muted"></iconify-icon></div>
                                    )}
                                    <div className="flex-grow-1" style={{ minWidth: 0 }}>
                                        <div className="d-flex align-items-center justify-content-between">
                                            <div className="fw-bold small text-truncate">{item.article.nom}</div>
                                            <div className="text-muted x-small">Stock boutique: <Badge bg="light" text="dark" className="border ms-1">{item.article.quantite}</Badge></div>
                                            {item.remiseTemp > 0 && (
                                                <Badge bg="warning" text="dark" className="ms-2" style={{ fontSize: '0.65rem' }}>
                                                    Remise: -{formatPrice(item.remiseTemp)} {item.remiseType === 'pourcentage' ? '%' : 'GNF'}
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="d-flex flex-wrap align-items-center gap-2 mt-2">
                                            <Button variant={item.quantite > 1 ? "primary" : "outline-secondary"} size="sm" className="rounded-circle shadow-sm border-0 d-flex align-items-center justify-content-center" style={{ width: 28, height: 28 }} onClick={e => { e.stopPropagation(); if (item.quantite > 1) setPanier(panier.map(p => p.article._id === item.article._id ? { ...p, quantite: p.quantite - 1, prixTotal: p.prixUnitaire * (p.quantite - 1) } : p)); }}>
                                                <MinusIcon size={18} color={item.quantite > 1 ? '#fff' : '#6c757d'} />
                                            </Button>
                                            <span className="fw-bold mx-1">{item.quantite}</span>
                                            <Button variant={item.quantite < item.article.quantite ? "primary" : "outline-secondary"} size="sm" className="rounded-circle shadow-sm border-0 d-flex align-items-center justify-content-center" style={{ width: 28, height: 28 }} onClick={e => { e.stopPropagation(); if (item.quantite < item.article.quantite) setPanier(panier.map(p => p.article._id === item.article._id ? { ...p, quantite: p.quantite + 1, prixTotal: p.prixUnitaire * (p.quantite + 1) } : p)); }}>
                                                <PlusIcon size={18} color={item.quantite < item.article.quantite ? '#fff' : '#6c757d'} />
                                            </Button>
                                            {userRole !== 'Serveur' && (
                                                <Button
                                                    variant={item.remiseTemp > 0 ? "warning" : "outline-secondary"}
                                                    size="sm"
                                                    className="rounded-pill d-flex align-items-center px-3"
                                                    onClick={(e) => openItemDiscountModal(e, item)}
                                                >
                                                    <iconify-icon icon="solar:tag-price-bold" className="me-1"></iconify-icon>
                                                    {item.remiseTemp > 0 ? `${formatPrice(item.remiseTemp)} ${item.remiseType === 'pourcentage' ? '%' : 'GNF'}` : 'Remise'}
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="text-end d-flex flex-column justify-content-between h-100" style={{ minWidth: '80px' }}>
                                        <div className="fw-bold text-primary small">{formatPrice(item.prixTotal)}</div>
                                        <Button variant="outline-danger" size="sm" className="rounded-pill mt-2" onClick={() => retirerDuPanier(item.article._id)}><iconify-icon icon="solar:trash-bin-trash-bold"></iconify-icon></Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="bg-light p-3 rounded-4 mb-3">
                            {/* Client (Caché pour Serveur) */}
                            {userRole !== 'Serveur' && (
                                <div className="mb-3">
                                    <div className="d-flex justify-content-between align-items-center mb-1">
                                        <label className="small fw-bold text-muted">Client</label>
                                        <Button variant="link" size="sm" className="p-0 text-decoration-none" onClick={() => setShowClientModal(true)}>+ Nouveau</Button>
                                    </div>
                                    <Form.Select size="sm" value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)} className="rounded-pill">
                                        <option value="">Client de passage</option>
                                        {clients.filter(client => client && client.customerId).map(client => <option key={client.customerId} value={client.customerId}>{client.vcFirstName} {client.vcLastName}</option>)}
                                    </Form.Select>
                                </div>
                            )}

                            {/* Numéro de Table - Visible uniquement pour le Serveur */}
                            {userRole === 'Serveur' && (
                            <div className="mb-3">
                                <label className="small fw-bold text-muted">Numéro de Table / Emplacement</label>
                                <InputGroup size="sm">
                                    <InputGroup.Text className="bg-light border-end-0">
                                        <iconify-icon icon="solar:chair-bold"></iconify-icon>
                                    </InputGroup.Text>
                                    <Form.Control
                                        type="text"
                                        placeholder={userRole === 'Serveur' ? "N° de Table (Obligatoire)" : "N° de Table"}
                                        value={numeroTable}
                                        onChange={e => setNumeroTable(e.target.value)}
                                        className="border-start-0 rounded-end-pill"
                                    />
                                </InputGroup>
                            </div>
                            )}

                            {/* Mode de Paiement */}
                            <div className="mb-3">
                                <label className="small fw-bold text-muted">Mode de paiement</label>
                                <Form.Select
                                    size="sm"
                                    value={modePaiement}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setModePaiement(val);
                                        // Si on choisit Dette, on initialise le montant payé à 0
                                        if (val === 'Dette') {
                                            setMontantPaye('0');
                                        }
                                    }}
                                    className="rounded-pill"
                                >
                                    <option value="Cash">💵 Espèces (Cash)</option>
                                    <option value="Orange Money">🍊 Orange Money</option>
                                    <option value="MobiCash">🟡 MobiCash (MTN)</option>
                                    <option value="PayCard">💳 PayCard</option>
                                    <option value="Virement">🏦 Virement Bancaire</option>
                                    {userRole !== 'Serveur' && <option value="Dette">📝 Dette (Crédit Total)</option>}
                                </Form.Select>
                            </div>

                            {/* Référence Transactionnelle (pour paiements numériques) */}
                            {['Orange Money', 'MobiCash', 'PayCard', 'Virement'].includes(modePaiement) && (
                                <Form.Group className="mb-3">
                                    <Form.Label className="small fw-bold text-muted">numero de telephone<span className="text-danger">*</span></Form.Label>
                                    <Form.Control
                                        type="text"
                                        value={transactionRef}
                                        onChange={e => setTransactionRef(e.target.value)}
                                        placeholder={`Ex: numro telephone ou carte visa ${modePaiement}`}
                                        required
                                        className="rounded-pill"
                                    />
                                </Form.Group>
                            )}

                            {/* Sélection Manuelle Rapide (cachée sur mobile car trop chargée dans le volet) */}
                            {!isMobile && (
                                <div className="p-3 bg-white rounded-4 border">
                                    <Form.Select size="sm" value={selectedArticle} onChange={e => setSelectedArticle(e.target.value)} className="border-0 mb-2">
                                        <option value="">Sélection manuelle...</option>
                                        {articles.map(article => <option key={article._id} value={article._id}>{article.nom} ({article.quantite})</option>)}
                                    </Form.Select>
                                    {selectedArticle && (
                                        <div className="d-flex gap-2">
                                            <Form.Control size="sm" type="number" value={quantite} onChange={e => setQuantite(e.target.value)} className="rounded-pill" />
                                            {userRole !== 'Serveur' && (
                                                <Button
                                                    variant={itemRemiseInput > 0 ? "warning" : "outline-secondary"}
                                                    size="sm"
                                                    className="rounded-pill px-3"
                                                    onClick={() => setShowNextItemDiscountModal(true)}
                                                >
                                                    <iconify-icon icon="solar:tag-price-bold" className="me-1"></iconify-icon>
                                                    {itemRemiseInput > 0 ? `${itemRemiseInput}${itemRemiseType === 'pourcentage' ? '%' : ' GNF'}` : 'Remise'}
                                                </Button>
                                            )}
                                            <Button variant="primary" size="sm" className="rounded-pill px-3" onClick={() => {
                                                setCartAnimationTrigger(true); // Déclenche l'animation
                                                ajouterAuPanier();
                                            }}><iconify-icon icon="solar:add-circle-bold"></iconify-icon></Button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {selectedClientId && (
                            <Form.Group className="mt-2">
                                <Form.Label className="fw-bold">Montant Payé</Form.Label>
                                <InputGroup><Form.Control type="number" placeholder={`Total : ${formatPrice(calculerTotal())} GNF`} value={montantPaye} onChange={e => setMontantPaye(e.target.value)} className="rounded-pill" /><InputGroup.Text>GNF</InputGroup.Text></InputGroup>
                            </Form.Group>
                        )}

                        {montantPaye !== '' && parseFloat(montantPaye) < calculerTotal() && (
                            <Form.Group className="mt-2">
                                <Form.Label className="fw-bold text-danger">Échéance dette</Form.Label>
                                <Form.Control
                                    type="date"
                                    value={echeanceDette}
                                    onChange={e => setEcheanceDette(e.target.value)}
                                    required
                                    className="rounded-pill"
                                    min={new Date().toISOString().split('T')[0]} // Définit la date minimale à aujourd'hui
                                />
                            </Form.Group>
                        )}

                        <div className="border-top pt-3 mt-3">
                            <div className="d-flex justify-content-between mb-1">
                                <span className="text-muted small">Sous-total (Hors remise)</span>
                                <span className="small">
                                    {formatPrice(panier.reduce((acc, item) => acc + ((item.article?.prixVente || 0) * (item.quantite || 0)), 0))} GNF
                                </span>
                            </div>
                            {panier.some(item => item.remiseTemp > 0) && (
                                <div className="d-flex justify-content-between mb-1">
                                    <span className="text-muted small">Total des remises</span>
                                    <span className="text-danger small fw-bold">
                                        -{formatPrice(panier.reduce((acc, item) => acc + ((item.article?.prixVente || 0) * item.quantite), 0) - calculerTotal())} GNF
                                    </span>
                                </div>
                            )}
                            <div className="d-flex justify-content-between align-items-center mt-2">
                                <span className="fw-bold fs-5">Total TTC</span>
                                <span className="fw-bold fs-4 text-success">{formatPrice(calculerTotal())} GNF</span>
                            </div>
                            {userRole === 'Serveur' && (
                                <div className="d-flex justify-content-between mt-1 text-primary">
                                    {articles[0]?.boutique?.tipsEnabled !== false ? (
                                        <>
                                            <span className="small fw-bold">
                                                Pourboire ({articles[0]?.boutique?.tipPercentage || 5}%) estimé
                                            </span>
                                            <span className="small fw-bold">
                                                +{formatPrice(Math.round(calculerTotal() * ((articles[0]?.boutique?.tipPercentage || 5) / 100)))} GNF
                                            </span>
                                        </>
                                    ) : (
                                        <span className="small fw-bold text-muted italic">Pourboires désactivés pour cet établissement</span>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="d-flex gap-2 mt-3">
                            <Button variant="outline-warning" className="rounded-pill flex-fill" onClick={mettreEnBrouillon} disabled={panier.length === 0}>Brouillon</Button>
                            <Button variant="success" className="rounded-pill flex-fill" onClick={() => { effectuerVente(); if (isMobile) setShowMobilePanier(false); }} disabled={isSubmitting}>
                                {isSubmitting ? <Spinner as="span" animation="border" size="sm" /> : 'Valider la Vente'}
                            </Button>
                        </div>
                    </>
                ) : (
                    <Alert variant="info">Le panier est vide.</Alert>
                )}
            </Card.Body>
        </Card>
    );

    return (
        <Row>
            {/* Catalogue à gauche, panier à droite */}
            <Col lg={8} md={7} xs={12}>
                {/* Filtres et recherche */}
                <div className="mb-3 d-flex flex-column flex-sm-row flex-wrap gap-2 align-items-sm-center">
                    {/* Bouton "Tous" pour afficher tous les articles */}
                    <Button
                        key="all"
                        variant={activeCategory === 'all' ? 'primary' : 'outline-primary'}
                        className="rounded-pill px-3 d-flex align-items-center gap-2"
                        onClick={() => setActiveCategory('all')}
                    >
                        Tous
                        <Badge bg={activeCategory === 'all' ? 'light' : 'primary'} text={activeCategory === 'all' ? 'dark' : 'white'} pill>
                            {articles.length}
                        </Badge>
                    </Button>
                    {/* Boutons pour les catégories dynamiques */}
                    {availableCategories
                        .sort((a, b) => a.label.localeCompare(b.label)) // Tri alphabétique
                        .map(cat => {
                            const count = articles.filter(a => a.categorie === cat.key).length;
                            const totalStockValue = articles
                                .filter(a => a.categorie === cat.key)
                                .reduce((sum, a) => sum + (a.prixAchat * a.quantite), 0);

                            return (
                                <Button
                                    key={cat.key}
                                    variant={activeCategory === cat.key ? 'primary' : 'outline-primary'}
                                    className="rounded-pill px-3 d-flex align-items-center gap-2"
                                    onClick={() => setActiveCategory(cat.key)}
                                >
                                    {cat.label}
                                    {userRole !== 'Serveur' ? (
                                        <OverlayTrigger
                                            placement="top"
                                            overlay={<Tooltip id={`tooltip-stock-value-${cat.key}`}>Valeur stock: {formatPrice(totalStockValue)} GNF</Tooltip>}
                                        >
                                            <Badge bg={activeCategory === cat.key ? 'light' : 'primary'} text={activeCategory === cat.key ? 'dark' : 'white'} pill>
                                                {count}
                                            </Badge>
                                        </OverlayTrigger>
                                    ) : (
                                        <Badge bg={activeCategory === cat.key ? 'light' : 'primary'} text={activeCategory === cat.key ? 'dark' : 'white'} pill>
                                            {count}
                                        </Badge>
                                    )}
                                </Button>
                            );
                        })}
                    <Form.Control
                        type="search"
                        placeholder="Rechercher un article..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="rounded-pill ms-sm-auto w-100 w-sm-auto"
                        style={{ minWidth: 200 }}
                    />
                </div>

                {/* Grille catalogue agrandie */}
                <div
                    className="pe-2"
                    style={{ maxHeight: 'calc(100vh - 180px)', minHeight: '400px', overflowY: 'auto', overflowX: 'hidden' }}
                >
                    <Row className="g-2 g-md-3">
                        {filteredArticles.length === 0 && (
                            <Col xs={12}><Alert variant="info">Aucun article trouvé</Alert></Col>
                        )}
                        {filteredArticles.map(article => (
                            <Col xs={6} md={4} lg={3} key={article._id}>
                                <Card className="h-100 shadow-sm border-0">
                                    <div style={{ position: 'relative' }}>
                                        {article.image ? (
                                            <Card.Img
                                                src={article.image}
                                                alt={article.nom}
                                                style={{ height: 90, objectFit: 'cover', cursor: 'pointer', borderTopLeftRadius: '1rem', borderTopRightRadius: '1rem' }}
                                                onClick={() => handleImageClick(article.image)}
                                            />
                                        ) : (
                                            <div className="bg-light d-flex align-items-center justify-content-center" style={{ height: 90, borderTopLeftRadius: '1rem', borderTopRightRadius: '1rem' }}>
                                                <iconify-icon icon="solar:box-bold" className="text-muted" style={{ fontSize: 32 }}></iconify-icon>
                                            </div>
                                        )}
                                        {article.quantite <= 0 && (
                                            <Badge bg="danger" style={{ position: 'absolute', top: 8, right: 8 }}>Rupture</Badge>
                                        )}
                                    </div>
                                    <Card.Body className="py-2 px-2">
                                        <div className="fw-bold small mb-1">{article.nom}</div>
                                        <div className="text-muted small mb-1">{article.code}</div>
                                        <div className="mb-2">
                                            {getEffectivePrice(article) < article.prixVente ? (
                                                <>
                                                    <span className="text-decoration-line-through text-muted me-1 small">{formatPrice(article.prixVente)}</span>
                                                    <span className="text-danger fw-bold">{formatPrice(getEffectivePrice(article))} GNF</span>
                                                </>
                                            ) : (
                                                <span className="fw-bold text-primary">{formatPrice(article.prixVente)} GNF</span>
                                            )}
                                        </div>
                                        <InputGroup size="sm" className="mb-2">
                                            <Form.Control
                                                type="number"
                                                min={1}
                                                max={article.quantite}
                                                value={quickQty[article._id] || 1}
                                                onChange={e => setQuickQty(q => ({ ...q, [article._id]: e.target.value }))}
                                                style={{ width: 60 }}
                                                disabled={article.quantite <= 0}
                                            />
                                            <Button
                                                variant="success"
                                                size="sm"
                                                className="rounded-pill ms-2"
                                                disabled={article.quantite <= 0}
                                                onClick={() => {
                                                    setSelectedArticle(article._id);
                                                    setQuantite(quickQty[article._id] ? parseInt(quickQty[article._id]) : 1);
                                                    setItemRemiseInput(''); // Reset item discount input
                                                    setCartAnimationTrigger(true); // Déclenche l'animation
                                                    ajouterAuPanier();
                                                }}
                                            >
                                                <iconify-icon icon="solar:cart-plus-bold" className="me-1"></iconify-icon>
                                                Ajouter
                                            </Button>
                                        </InputGroup>
                                        <div className="d-flex justify-content-between align-items-center">
                                            <Badge bg="secondary" pill>{article.categorie}</Badge>
                                            <Badge bg={article.quantite > (article.seuilAlerte || 10) ? "success-subtle" : "danger-subtle"} text={article.quantite > (article.seuilAlerte || 10) ? "success" : "danger"} className="border">Stock: {article.quantite}</Badge>
                                        </div>
                                    </Card.Body>
                                </Card>
                            </Col>
                        ))}
                    </Row>
                </div>
            </Col>

            {/* Panier (Desktop) */}
            <Col lg={4} md={5} className="mt-4 mt-md-0 position-relative d-none d-md-block">
                {renderPanierCard(false)}
            </Col>

            {/* Panier (Mobile - Volet coulissant) */}
            <Offcanvas show={showMobilePanier} onHide={() => setShowMobilePanier(false)} placement="end" className="d-md-none" style={{ width: '90%' }}>
                <Offcanvas.Header closeButton className="border-bottom">
                    <Offcanvas.Title className="fw-bold">Mon Panier</Offcanvas.Title>
                </Offcanvas.Header>
                <Offcanvas.Body className="p-0 bg-light">
                    {renderPanierCard(true)}
                </Offcanvas.Body>
            </Offcanvas>

            {/* Modale Historique Récent sous forme de tickets */}
            <Modal show={showHistoryModal} onHide={() => setShowHistoryModal(false)} centered scrollable>
                <Modal.Header closeButton className="border-0 pb-0">
                    <Modal.Title className="fw-bold">Tickets Récent (Validés)</Modal.Title>
                </Modal.Header>
                <Modal.Body className="pt-3">
                    {groupedTickets.length > 0 ? (
                        groupedTickets.slice(0, 10).map(ticket => (
                            <div
                                key={ticket.id}
                                className={`mb-3 p-3 rounded-4 border-start border-4 border-success shadow-sm transition-all ${expandedTicket === ticket.id ? 'bg-white border-success' : 'bg-light border-light'}`}
                                style={{ cursor: 'pointer' }}
                                onClick={() => setExpandedTicket(expandedTicket === ticket.id ? null : ticket.id)}
                            >
                                <div className="d-flex justify-content-between align-items-start">
                                    <div>
                                        <div className="fw-bold text-dark mb-1 d-flex align-items-center">
                                            <iconify-icon icon="solar:ticket-bold" className="me-2 text-success"></iconify-icon>
                                            Client : {ticket.client}
                                        </div>
                                        <Badge bg="success-subtle" text="success" pill className="mt-1">
                                            {(ticket.totalTicket || 0).toLocaleString('fr-FR')} GNF
                                        </Badge>
                                    </div>
                                    <div className="text-end">
                                        <div className="small fw-bold text-primary">
                                            <iconify-icon icon="solar:calendar-date-bold" className="me-1 align-middle"></iconify-icon>
                                            {new Date(ticket.date).toLocaleDateString('fr-FR')}
                                        </div>
                                        <div className="small text-muted">
                                            <iconify-icon icon="solar:clock-circle-bold" className="me-1 align-middle"></iconify-icon>
                                            {new Date(ticket.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                        <div className="mt-2 text-primary small fw-bold d-flex align-items-center justify-content-end">
                                            {expandedTicket === ticket.id ? 'Masquer' : 'Détails'}
                                            <iconify-icon
                                                icon={expandedTicket === ticket.id ? "solar:alt-arrow-up-linear" : "solar:alt-arrow-down-linear"}
                                                className="ms-1"
                                            ></iconify-icon>
                                        </div>
                                    </div>
                                </div>

                                {expandedTicket === ticket.id && (
                                    <div className="mt-3 pt-3 border-top border-light animate__animated animate__fadeIn">
                                        <h6 className="small fw-bold text-muted mb-2 text-uppercase">Articles du ticket :</h6>
                                        <div className="bg-white p-2 rounded-3 border">
                                            <ul className="list-unstyled mb-0 small text-dark">
                                                {ticket.items.map(item => (
                                                    <li key={item._id} className="d-flex justify-content-between py-1 border-bottom border-light last-child-0">
                                                        <span>
                                                            <iconify-icon icon="solar:dot-bold" className="me-1 text-muted"></iconify-icon>
                                                            {item.article?.nom || 'Article supprimé'}
                                                            <Badge bg="light" text="dark" className="ms-2">x{item.quantite}</Badge>
                                                        </span>
                                                        <span className="fw-bold">{(item.prixTotal || 0).toLocaleString('fr-FR')} GNF</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-4 text-muted">
                            <iconify-icon icon="solar:bill-list-linear" style={{ fontSize: '48px' }} className="mb-2 opacity-50"></iconify-icon>
                            <p>Aucun ticket récent trouvé.</p>
                        </div>
                    )}
                </Modal.Body>
                <Modal.Footer className="border-0">
                    <Button variant="secondary" className="rounded-pill px-4 w-100" onClick={() => setShowHistoryModal(false)}>Fermer</Button>
                </Modal.Footer>
            </Modal>

            {/* Modale des Brouillons */}
            <Modal show={showDraftsModal} onHide={() => setShowDraftsModal(false)} centered scrollable>
                <Modal.Header closeButton className="border-0 pb-0">
                    <Modal.Title className="fw-bold">Ventes en attente (Brouillons)</Modal.Title>
                </Modal.Header>
                <Modal.Body className="pt-3">
                    {brouillons && brouillons.length > 0 ? (
                        brouillons.map(draft => (
                            <div key={draft.id} className="mb-3 p-3 bg-white rounded-4 border shadow-sm">
                                <div className="d-flex justify-content-between align-items-start mb-2">
                                    <div>
                                        <div className="fw-bold text-dark">{draft.clientName}</div>
                                        <Badge bg="warning-subtle" text="warning" pill>{formatPrice(draft.total)} GNF</Badge>
                                        <div className="small text-muted mt-1">{draft.panier.length} article(s)</div>
                                    </div>
                                    <div className="text-end">
                                        <div className="small text-muted">
                                            {new Date(draft.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                        <div className="mt-2 d-flex gap-2">
                                            <Button variant="outline-danger" size="sm" className="rounded-circle p-1" onClick={() => setBrouillons(brouillons.filter(b => b.id !== draft.id))} title="Supprimer">
                                                <iconify-icon icon="solar:trash-bin-trash-bold"></iconify-icon>
                                            </Button>
                                            <Button variant="primary" size="sm" className="rounded-pill px-3" onClick={() => { chargerBrouillon(draft); setShowDraftsModal(false); }}>
                                                Reprendre
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-4 text-muted">
                            <iconify-icon icon="solar:notes-minimalistic-linear" style={{ fontSize: '48px' }} className="mb-2 opacity-50"></iconify-icon>
                            <p>Aucune vente en attente.</p>
                        </div>
                    )}
                </Modal.Body>
                <Modal.Footer className="border-0">
                    <Button variant="secondary" className="rounded-pill px-4 w-100" onClick={() => setShowDraftsModal(false)}>Fermer</Button>
                </Modal.Footer>
            </Modal>

            {/* Modale de Confirmation pour vider le panier */}
            <Modal show={showViderModal} onHide={() => setShowViderModal(false)} centered size="sm">
                <Modal.Header closeButton className="border-0">
                    <Modal.Title className="fw-bold h5">Confirmation</Modal.Title>
                </Modal.Header>
                <Modal.Body className="text-center py-4">
                    <div className="mb-3" style={{ fontSize: '56px', color: '#dc3545' }}>
                        <iconify-icon icon="solar:trash-bin-trash-bold-duotone"></iconify-icon>
                    </div>
                    <h6 className="fw-bold mb-2">Vider le panier ?</h6>
                    <p className="text-muted small mb-0">Cette action est irréversible et retirera tous les articles en cours.</p>
                </Modal.Body>
                <Modal.Footer className="justify-content-center border-0 gap-2 pb-4">
                    <Button variant="light" onClick={() => setShowViderModal(false)} className="rounded-pill px-3 fw-bold btn-sm">
                        Annuler
                    </Button>
                    <Button variant="danger" onClick={() => {
                        setPanier([]);
                        setShowViderModal(false);
                    }} className="rounded-pill px-3 fw-bold shadow-sm btn-sm">
                        Oui, vider
                    </Button>
                </Modal.Footer>
            </Modal>

            {/* Modale de Saisie de Remise par Article (Panier) */}
            <Modal show={showItemDiscountModal} onHide={() => setShowItemDiscountModal(false)} centered size="sm">
                <Modal.Header closeButton className="border-0 pb-0">
                    <Modal.Title className="fw-bold h5">Remise sur article</Modal.Title>
                </Modal.Header>
                <Modal.Body className="py-3">
                    <div className="d-flex justify-content-between align-items-center mb-3">
                        <span className="fw-bold small text-primary text-truncate" style={{ maxWidth: '60%' }}>{discountModalItem?.article.nom}</span>
                        <Badge bg="info-subtle" text="info-emphasis" className="border border-info-subtle py-2 px-3">
                            Prix: {formatPrice(discountModalItem?.article.prixVente)} GNF
                        </Badge>
                    </div>
                    <Form.Group className="mb-3">
                        <Form.Label className="small fw-bold">Valeur de la remise</Form.Label>
                        <InputGroup>
                            <Form.Control
                                type="number"
                                value={modalRemiseValue}
                                onChange={(e) => setModalRemiseValue(e.target.value)}
                                placeholder="0"
                                isInvalid={
                                    (modalRemiseType === 'montant' && parseFloat(modalRemiseValue) > discountModalItem?.article.prixVente) ||
                                    (modalRemiseType === 'pourcentage' && parseFloat(modalRemiseValue) > 100) ||
                                    (parseFloat(modalRemiseValue) > 0 && getEffectivePrice(discountModalItem?.article, parseFloat(modalRemiseValue), modalRemiseType) < discountModalItem?.article.prixAchat)
                                }
                                autoFocus
                            />
                            <Form.Select
                                value={modalRemiseType}
                                onChange={(e) => setModalRemiseType(e.target.value)}
                                style={{ maxWidth: '85px' }}
                            >
                                <option value="montant">GNF</option>
                                <option value="pourcentage">%</option>
                            </Form.Select>
                            <Form.Control.Feedback type="invalid">
                                {
                                    modalRemiseType === 'montant' && parseFloat(modalRemiseValue) > discountModalItem?.article.prixVente ? 'Montant supérieur au prix de vente' :
                                        modalRemiseType === 'pourcentage' && parseFloat(modalRemiseValue) > 100 ? 'Le pourcentage max est 100%' :
                                            parseFloat(modalRemiseValue) > 0 && getEffectivePrice(discountModalItem?.article, parseFloat(modalRemiseValue), modalRemiseType) < discountModalItem?.article.prixAchat ?
                                                `Prix final (${formatPrice(getEffectivePrice(discountModalItem?.article, parseFloat(modalRemiseValue), modalRemiseType))} GNF) inférieur au prix d'achat (${formatPrice(discountModalItem?.article.prixAchat)} GNF)` : ''
                                }
                            </Form.Control.Feedback>
                        </InputGroup>
                    </Form.Group>
                    <Button
                        variant="primary"
                        onClick={applyItemDiscount}
                        className="rounded-pill px-3 fw-bold shadow-sm w-100"
                        disabled={
                            (modalRemiseType === 'montant' && parseFloat(modalRemiseValue) > discountModalItem?.article.prixVente) ||
                            (modalRemiseType === 'pourcentage' && parseFloat(modalRemiseValue) > 100) ||
                            (parseFloat(modalRemiseValue) > 0 && getEffectivePrice(discountModalItem?.article, parseFloat(modalRemiseValue), modalRemiseType) < discountModalItem?.article.prixAchat) ||
                            isNaN(parseFloat(modalRemiseValue)) || parseFloat(modalRemiseValue) < 0
                        }
                    >
                        Appliquer la remise
                    </Button>
                </Modal.Body>
            </Modal>

            {/* Modale de Saisie de Remise pour l'article à ajouter (Formulaire rapide) */}
            <Modal show={showNextItemDiscountModal} onHide={() => setShowNextItemDiscountModal(false)} centered size="sm">
                <Modal.Header closeButton className="border-0 pb-0">
                    <Modal.Title className="fw-bold h5">Définir la remise</Modal.Title>
                </Modal.Header>
                <Modal.Body className="py-3">
                    {selectedArticle && (
                        <div className="d-flex justify-content-between align-items-center mb-3">
                            <span className="fw-bold small text-primary text-truncate" style={{ maxWidth: '60%' }}>
                                {articles.find(a => a._id === selectedArticle)?.nom}
                            </span>
                            <Badge bg="info-subtle" text="info-emphasis" className="border border-info-subtle py-2 px-3">
                                Prix: {formatPrice(articles.find(a => a._id === selectedArticle)?.prixVente)} GNF
                            </Badge>
                        </div>
                    )}
                    <Form.Group className="mb-3">
                        <Form.Label className="small fw-bold">Valeur de la remise</Form.Label>
                        <InputGroup>
                            <Form.Control
                                type="number"
                                value={itemRemiseInput}
                                onChange={(e) => setItemRemiseInput(e.target.value)}
                                placeholder="0"
                                isInvalid={
                                    (itemRemiseType === 'montant' && parseFloat(itemRemiseInput) > articles.find(a => a._id === selectedArticle)?.prixVente) ||
                                    (itemRemiseType === 'pourcentage' && parseFloat(itemRemiseInput) > 100) ||
                                    (parseFloat(itemRemiseInput) > 0 && getEffectivePrice(articles.find(a => a._id === selectedArticle), parseFloat(itemRemiseInput), itemRemiseType) < articles.find(a => a._id === selectedArticle)?.prixAchat)
                                }
                                autoFocus
                            />
                            <Form.Select
                                value={itemRemiseType}
                                onChange={(e) => setItemRemiseType(e.target.value)}
                                style={{ maxWidth: '85px' }}
                            >
                                <option value="montant">GNF</option>
                                <option value="pourcentage">%</option>
                            </Form.Select>
                            <Form.Control.Feedback type="invalid">
                                {
                                    itemRemiseType === 'montant' && parseFloat(itemRemiseInput) > articles.find(a => a._id === selectedArticle)?.prixVente ? 'Montant supérieur au prix de vente' :
                                        itemRemiseType === 'pourcentage' && parseFloat(itemRemiseInput) > 100 ? 'Le pourcentage max est 100%' :
                                            parseFloat(itemRemiseInput) > 0 && getEffectivePrice(articles.find(a => a._id === selectedArticle), parseFloat(itemRemiseInput), itemRemiseType) < articles.find(a => a._id === selectedArticle)?.prixAchat ?
                                                `Prix final (${formatPrice(getEffectivePrice(articles.find(a => a._id === selectedArticle), parseFloat(itemRemiseInput), itemRemiseType))} GNF) inférieur au prix d'achat (${formatPrice(articles.find(a => a._id === selectedArticle)?.prixAchat)} GNF)` : ''
                                }
                            </Form.Control.Feedback>
                        </InputGroup>
                    </Form.Group>
                    <Button
                        variant="primary"
                        onClick={() => setShowNextItemDiscountModal(false)}
                        className="rounded-pill px-3 fw-bold shadow-sm w-100"
                        disabled={
                            (itemRemiseType === 'montant' && parseFloat(itemRemiseInput) > articles.find(a => a._id === selectedArticle)?.prixVente) ||
                            (itemRemiseType === 'pourcentage' && parseFloat(itemRemiseInput) > 100) ||
                            (parseFloat(itemRemiseInput) > 0 && getEffectivePrice(articles.find(a => a._id === selectedArticle), parseFloat(itemRemiseInput), itemRemiseType) < articles.find(a => a._id === selectedArticle)?.prixAchat) ||
                            isNaN(parseFloat(itemRemiseInput)) || parseFloat(itemRemiseInput) < 0
                        }
                    >
                        Valider la remise
                    </Button>
                </Modal.Body>
            </Modal>
        </Row>
    );
};

export default SaleTab;