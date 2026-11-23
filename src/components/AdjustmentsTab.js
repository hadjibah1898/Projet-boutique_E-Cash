
/**
 * @file AdjustmentsTab.js
 * @description Journal des écarts d'inventaire.
 * Les boutons Approuver / Rejeter disparaissent
 * lorsque la correction est traitée.
 */

import React, { useState } from 'react';
import {
    Button,
    Card,
    Badge,
    OverlayTrigger,
    Tooltip,
    Form,
    Modal
} from 'react-bootstrap';
import TableComponent from './common/Table';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logo from '../assets/logo.png';

const AdjustmentsTab = ({
    userRole,
    handleOpenAdjustmentModal,
    adjustments = [],
    adjLoading,
    handleImageClick,
    handleOpenValModal,
    boutiques = []
}) => {
    const [search, setSearch] = useState('');
    const [reasonFilter, setReasonFilter] = useState('all');
    const [shopFilter, setShopFilter] = useState('all');
    const [showJustificationModal, setShowJustificationModal] = useState(false);
    const [selectedJustification, setSelectedJustification] = useState('');
    const [showAdminCommentModal, setShowAdminCommentModal] = useState(false);
    const [selectedAdminComment, setSelectedAdminComment] = useState('');

    const isAdmin = ['ADMIN', 'Admin'].includes(userRole);
    const isManager = ['MANAGER', 'Gérant', 'GERANT'].includes(userRole);

    const formatImage = (img) => {
        if (!img || img === 'null' || img === 'undefined') return null;
        if (typeof img !== 'string') return null;

        if (!img.startsWith('data:image')) {
            return `data:image/jpeg;base64,${img}`;
        }

        return img;
    };

    /**
     * Normalise les statuts retournés par le backend.
     * statutCode est prioritaire sur statut.
     */
    const getAdjustmentStatus = (adj) => {
        const normalize = (value) =>
            String(value || '')
                .trim()
                .toUpperCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[\s-]+/g, '_');

        const code = normalize(adj.statutCode || adj.statusCode);
        const label = normalize(adj.statut);

        const pendingCodes = ['PENDING', 'EN_ATTENTE'];
        const approvedCodes = [
            'APPROVED',
            'VALIDE',
            'VALIDATED',
            'ACCEPTE'
        ];
        const rejectedCodes = [
            'REJECTED',
            'REJETE',
            'REFUSED',
            'REFUSE'
        ];

        if (approvedCodes.includes(code)) return 'APPROVED';
        if (rejectedCodes.includes(code)) return 'REJECTED';

        // Le libellé peut confirmer un statut déjà traité.
        if (approvedCodes.includes(label)) return 'APPROVED';
        if (rejectedCodes.includes(label)) return 'REJECTED';

        if (pendingCodes.includes(code)) return 'PENDING';
        if (pendingCodes.includes(label)) return 'PENDING';

        return 'UNKNOWN';
    };

    const getStatusLabel = (adj) => {
        const status = getAdjustmentStatus(adj);

        if (status === 'APPROVED') return 'Validé';
        if (status === 'REJECTED') return 'Rejeté';
        if (status === 'PENDING') return 'En attente';

        return adj.statut || 'Statut inconnu';
    };

    const formatDate = (value) => {
        if (!value) return '-';

        const date = new Date(value);

        return Number.isNaN(date.getTime())
            ? '-'
            : date.toLocaleDateString('fr-FR');
    };

    const filteredAdjustments = (
        Array.isArray(adjustments) ? adjustments : []
    ).filter((adj) => {
        const searchLower = search.toLowerCase();

        const searchText = [
            adj.produitNom,
            adj.article,
            adj.motif,
            adj.justification
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

        const matchesSearch = searchText.includes(searchLower);

        const matchesReason =
            reasonFilter === 'all' ||
            adj.motif === reasonFilter;

        const matchesShop =
            shopFilter === 'all' ||
            adj.boutiqueNom === shopFilter ||
            adj.pointDeVente === shopFilter;

        return matchesSearch && matchesReason && matchesShop;
    });

    const handleExportPDF = () => {
        const doc = new jsPDF();

        try {
            doc.addImage(logo, 'PNG', 14, 8, 40, 15);
        } catch (e) {
            // Exporter même si le logo est indisponible.
        }

        doc.setFontSize(18);
        doc.setTextColor(41, 128, 185);
        doc.text("Journal des Écarts d'Inventaire", 60, 16);

        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(
            `Généré le : ${new Date().toLocaleString('fr-FR')}`,
            60,
            22
        );

        const tableColumn = [
            'Date',
            'Article',
            'Boutique',
            'Motif',
            'Justification',
            'Qté',
            'Statut'
        ];

        const tableRows = filteredAdjustments.map((adj) => [
            formatDate(adj.createdAt || adj.date),
            adj.produitNom || adj.article || 'N/A',
            adj.boutiqueNom || adj.pointDeVente || 'N/A',
            adj.motif || 'N/A',
            adj.justification || '-',
            `-${adj.quantite}`,
            getStatusLabel(adj)
        ]);

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 35,
            theme: 'grid',
            headStyles: {
                fillColor: [41, 128, 185],
                halign: 'center'
            },
            columnStyles: {
                5: { halign: 'center' },
                6: { halign: 'center' }
            }
        });

        doc.save(
            `journal_ecarts_${new Date().toISOString().split('T')[0]}.pdf`
        );
    };

    const showAdminComment = (comment) => {
        setSelectedAdminComment(comment);
        setShowAdminCommentModal(true);
    };

    const renderActions = (adj) => {
        const status = getAdjustmentStatus(adj);

        // Une correction validée ou rejetée
        // ne peut plus afficher les boutons.
        if (status === 'APPROVED' || status === 'REJECTED') {
            return (
                <div className="d-flex align-items-center gap-2">
                    <span className="text-muted small">
                        <iconify-icon
                            icon="solar:check-circle-bold"
                            className="me-1"
                        />
                        Traité
                    </span>

                    {adj.commentaireAdmin && (
                        <OverlayTrigger
                            overlay={
                                <Tooltip>
                                    Voir le commentaire de l'admin
                                </Tooltip>
                            }
                        >
                            <Button
                                variant="link"
                                size="sm"
                                className="p-0 text-decoration-none"
                                onClick={() =>
                                    showAdminComment(adj.commentaireAdmin)
                                }
                            >
                                Obs.
                            </Button>
                        </OverlayTrigger>
                    )}
                </div>
            );
        }

        // Les statuts inconnus ne doivent pas
        // donner accès à une décision.
        if (status !== 'PENDING') {
            return <span className="text-muted">—</span>;
        }

        if (!isAdmin) {
            return '-';
        }

        return (
            <div className="d-flex gap-2">
                <Button
                    variant="success"
                    size="sm"
                    className="rounded-pill shadow-sm"
                    disabled={adjLoading}
                    onClick={() =>
                        handleOpenValModal(adj, 'VALIDE')
                    }
                >
                    <iconify-icon
                        icon="solar:check-circle-bold"
                        className="me-1"
                    />
                    Approuver
                </Button>

                <Button
                    variant="danger"
                    size="sm"
                    className="rounded-pill"
                    disabled={adjLoading}
                    onClick={() =>
                        handleOpenValModal(adj, 'REJETE')
                    }
                >
                    Rejeter
                </Button>
            </div>
        );
    };

    return (
        <div className="animate__animated animate__fadeIn">
            <div className="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center mb-4 gap-3">
                <h5 className="fw-bold mb-0">
                    Journal des Écarts d'Inventaire
                </h5>

                <div className="d-flex flex-wrap gap-2 w-100 justify-content-lg-end align-items-center">
                    {isAdmin && (
                        <Form.Select
                            size="sm"
                            className="rounded-pill px-3 shadow-sm flex-grow-1 flex-md-grow-0"
                            value={shopFilter}
                            onChange={(e) => setShopFilter(e.target.value)}
                            style={{
                                minWidth: '150px',
                                maxWidth: '180px'
                            }}
                        >
                            <option value="all">
                                Toutes les boutiques
                            </option>

                            {Array.isArray(boutiques) &&
                                boutiques.map((b) => (
                                    <option
                                        key={b._id || b.storeId}
                                        value={b.nom || b.vcStoreName}
                                    >
                                        {b.nom || b.vcStoreName}
                                    </option>
                                ))}
                        </Form.Select>
                    )}

                    <Form.Select
                        size="sm"
                        className="rounded-pill px-3 shadow-sm flex-grow-1 flex-md-grow-0"
                        value={reasonFilter}
                        onChange={(e) => setReasonFilter(e.target.value)}
                        style={{
                            minWidth: '150px',
                            maxWidth: '180px'
                        }}
                    >
                        <option value="all">Tous les motifs</option>
                        <option value="Casse">Casse</option>
                        <option value="Vol">Vol</option>
                        <option value="Perte">Perte</option>
                        <option value="Périmé">Périmé</option>
                    </Form.Select>

                    <Button
                        variant="outline-danger"
                        size="sm"
                        className="rounded-pill px-3 shadow-sm flex-grow-1 flex-md-grow-0"
                        onClick={handleExportPDF}
                        disabled={filteredAdjustments.length === 0}
                    >
                        <iconify-icon
                            icon="solar:file-pdf-bold"
                            className="me-2 align-middle"
                        />
                        PDF
                    </Button>

                    <Form.Control
                        placeholder="🔍 Rechercher..."
                        size="sm"
                        className="rounded-pill px-3 shadow-sm flex-grow-1 flex-md-grow-0"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{
                            minWidth: '200px',
                            maxWidth: '250px'
                        }}
                    />

                    {isManager && (
                        <Button
                            variant="danger"
                            size="sm"
                            onClick={handleOpenAdjustmentModal}
                            className="rounded-pill shadow-sm px-4 fw-bold d-flex justify-content-center align-items-center flex-grow-1 flex-lg-grow-0 mt-2 mt-lg-0"
                            style={{
                                background:
                                    'linear-gradient(135deg, #dc3545 0%, #c82333 100%)',
                                border: 'none'
                            }}
                        >
                            <iconify-icon
                                icon="solar:danger-triangle-bold-duotone"
                                className="me-2 fs-5"
                            />
                            Déclarer une Perte / Casse
                        </Button>
                    )}
                </div>
            </div>

            <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
                <div className="table-responsive">
                    <TableComponent
                        columns={[
                            {
                                key: 'createdAt',
                                label: 'Date',
                                render: (_, adj) => (
                                    <span className="text-muted small">
                                        {formatDate(
                                            adj.createdAt || adj.date
                                        )}
                                    </span>
                                )
                            },
                            {
                                key: 'article',
                                label: 'Article',
                                render: (_, adj) => (
                                    <span className="fw-bold text-dark">
                                        {adj.produitNom ||
                                            adj.article ||
                                            'Produit inconnu'}
                                    </span>
                                )
                            },
                            {
                                key: 'boutique',
                                label: 'Point de Vente',
                                render: (_, adj) => (
                                    <Badge
                                        bg="light"
                                        text="dark"
                                        className="border"
                                    >
                                        {adj.boutiqueNom ||
                                            adj.pointDeVente ||
                                            'N/A'}
                                    </Badge>
                                )
                            },
                            {
                                key: 'raison',
                                label: 'Motif',
                                render: (_, adj) => (
                                    <Badge bg="dark">
                                        {adj.motif || 'Autre'}
                                    </Badge>
                                )
                            },
                            {
                                key: 'justification',
                                label: 'Note',
                                render: (_, adj) =>
                                    adj.justification ? (
                                        <span
                                            className="text-primary small cursor-pointer d-flex align-items-center gap-1 hover-underline"
                                            onClick={() => {
                                                setSelectedJustification(
                                                    adj.justification
                                                );
                                                setShowJustificationModal(true);
                                            }}
                                        >
                                            <iconify-icon
                                                icon="solar:chat-square-dots-bold-duotone"
                                                style={{
                                                    fontSize: '18px'
                                                }}
                                            />
                                            Voir
                                        </span>
                                    ) : '-'
                            },
                            {
                                key: 'quantite',
                                label: 'Qté',
                                render: (_, adj) => (
                                    <span className="text-danger fw-bold">
                                        -{adj.quantite}
                                    </span>
                                )
                            },
                            {
                                key: 'imageJustificatif',
                                label: 'Preuve',
                                render: (_, adj) => {
                                    const imgSrc = formatImage(
                                        adj.imageJustificatif ||
                                        adj.preuve
                                    );

                                    return imgSrc ? (
                                        <Button
                                            variant="outline-primary"
                                            size="sm"
                                            className="rounded-circle p-0 d-flex align-items-center justify-content-center"
                                            style={{
                                                width: '35px',
                                                height: '35px'
                                            }}
                                            onClick={() =>
                                                handleImageClick(imgSrc)
                                            }
                                            title="Cliquez pour voir l'image"
                                        >
                                            <iconify-icon
                                                icon="solar:gallery-bold"
                                                style={{
                                                    fontSize: '20px'
                                                }}
                                            />
                                        </Button>
                                    ) : (
                                        <iconify-icon
                                            icon="solar:camera-minimalistic-linear"
                                            className="text-muted opacity-25"
                                        />
                                    );
                                }
                            },
                            {
                                key: 'statut',
                                label: 'Statut',
                                render: (_, adj) => {
                                    const status = getAdjustmentStatus(adj);

                                    const bgColor =
                                        status === 'PENDING'
                                            ? 'warning-subtle'
                                            : status === 'APPROVED'
                                                ? 'success-subtle'
                                                : status === 'REJECTED'
                                                    ? 'danger-subtle'
                                                    : 'secondary';

                                    const textColor =
                                        status === 'PENDING'
                                            ? 'warning-emphasis'
                                            : status === 'APPROVED'
                                                ? 'success'
                                                : status === 'REJECTED'
                                                    ? 'danger'
                                                    : 'light';

                                    return (
                                        <Badge
                                            bg={bgColor}
                                            text={textColor}
                                            className="px-3 py-2"
                                        >
                                            {getStatusLabel(adj)}
                                        </Badge>
                                    );
                                }
                            },
                            {
                                key: 'actions',
                                label: 'Actions',
                                render: (_, adj) => renderActions(adj)
                            }
                        ]}
                        data={filteredAdjustments}
                        loading={adjLoading}
                        emptyMessage="Aucune correction enregistrée."
                    />
                </div>
            </Card>

            {/* MODALE JUSTIFICATION */}
            <Modal
                show={showJustificationModal}
                onHide={() => setShowJustificationModal(false)}
                centered
                size="sm"
            >
                <Modal.Header closeButton className="border-0 pb-0">
                    <Modal.Title className="fw-bold h6 text-primary text-uppercase">
                        Justification du gérant
                    </Modal.Title>
                </Modal.Header>

                <Modal.Body className="pt-2">
                    <div
                        className="p-3 bg-light rounded-4 small text-dark border shadow-sm"
                        style={{
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word'
                        }}
                    >
                        {selectedJustification}
                    </div>
                </Modal.Body>

                <Modal.Footer className="border-0 pt-0">
                    <Button
                        variant="secondary"
                        size="sm"
                        className="rounded-pill px-4 shadow-sm fw-bold"
                        onClick={() =>
                            setShowJustificationModal(false)
                        }
                    >
                        Fermer
                    </Button>
                </Modal.Footer>
            </Modal>

            {/* MODALE COMMENTAIRE ADMIN */}
            <Modal
                show={showAdminCommentModal}
                onHide={() => setShowAdminCommentModal(false)}
                centered
                size="sm"
            >
                <Modal.Header closeButton className="border-0 pb-0">
                    <Modal.Title className="fw-bold h6 text-info text-uppercase">
                        Commentaire de l'administrateur
                    </Modal.Title>
                </Modal.Header>

                <Modal.Body className="pt-2">
                    <div
                        className="p-3 bg-light rounded-4 small text-dark border shadow-sm"
                        style={{
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word'
                        }}
                    >
                        {selectedAdminComment}
                    </div>
                </Modal.Body>

                <Modal.Footer className="border-0 pt-0">
                    <Button
                        variant="secondary"
                        size="sm"
                        className="rounded-pill px-4 shadow-sm fw-bold"
                        onClick={() =>
                            setShowAdminCommentModal(false)
                        }
                    >
                        Fermer
                    </Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
};

export default AdjustmentsTab;
