/**
 * @file AuditLogView.js
 * @description Composant React.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, Spinner, Alert, Form, Row, Col, Badge, Pagination, Table, Button } from 'react-bootstrap';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { auditAPI, authAPI } from '../services/api';
import XLSX from 'xlsx-js-style';

const AuditLogView = () => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [filters, setFilters] = useState({ user: '', action: '', startDate: '', endDate: '' });
    const [users, setUsers] = useState([]);

    // --- Pagination ---
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [exporting, setExporting] = useState(false);

    // --- Liste des actions pour le filtre ---
    const auditActionLabels = {
        'LOGIN_SUCCESS': 'Connexion Réussie',
        'LOGIN_FAILURE': 'Échec de Connexion',
        'CREATE_USER': 'Création Utilisateur',
        'UPDATE_USER': 'Mise à jour Utilisateur',
        'DELETE_USER': 'Suppression Utilisateur',
        'CHANGE_PASSWORD': 'Changement Mot de Passe',
        'CREATE_BOUTIQUE': 'Création Boutique',
        'UPDATE_BOUTIQUE': 'Mise à jour Boutique',
        'DELETE_BOUTIQUE': 'Suppression Boutique',
        'CREATE_ARTICLE': 'Création Article',
        'UPDATE_ARTICLE': 'Mise à jour Article',
        'DELETE_ARTICLE': 'Suppression Article',
        'TRANSFER_STOCK': 'Transfert Stock',
        'RESTOCK_SHOP': 'Réapprovisionnement Boutique',
        'SUPPLY_STOCK': 'Approvisionnement Fournisseur',
        'CANCEL_SALE': 'Annulation Vente',
        'VALIDATE_DEBT_PAYMENT': 'Validation Paiement Dette',
        'REJECT_DEBT_PAYMENT': 'Rejet Paiement Dette',
        'VALIDATE_CASH_REPORT': 'Validation Rapport Caisse',
        'REJECT_CASH_REPORT': 'Rejet Rapport Caisse',
        'REQUEST_DISCOUNT': 'Demande de Remise',
        'UPDATE_TIP_PERCENTAGE': 'Mise à jour Taux Pourboire',
        'CREATE_TRANSFER': 'Création Transfert',
        'TEST_AUTOMATIQUE': 'Test Automatique'
    };

    const fetchLogs = useCallback(async () => {
        try {
            setLoading(true);
            const params = { ...filters, page: currentPage, limit: 20 };
            const res = await auditAPI.getLogs(params);
            
            // 🟢 CORRECTION ICI : On extrait correctement res.data.logs
            let fetchedLogs = [];
            let fetchedTotalPages = 1;

            if (res && res.data && Array.isArray(res.data.logs)) {
                // Cas standard avec Axios
                fetchedLogs = res.data.logs;
                fetchedTotalPages = res.data.totalPages || 1;
            } else if (res && Array.isArray(res.logs)) {
                // Cas où l'intercepteur a déjà extrait les données
                fetchedLogs = res.logs;
                fetchedTotalPages = res.totalPages || 1;
            } else if (Array.isArray(res)) {
                fetchedLogs = res;
            }

            setLogs(fetchedLogs);
            setTotalPages(fetchedTotalPages);
        } catch (err) {
            setError(err.response?.data?.message || "Erreur lors du chargement des journaux d'audit.");
            setLogs([]); // Sécurité anti-crash
        } finally {
            setLoading(false);
        }
    }, [filters, currentPage]);

    const fetchUsers = useCallback(async () => {
        try {
            const res = await authAPI.getUsers();
            // 🟢 EXTRACTION ROBUSTE
            const fetchedUsers = Array.isArray(res) ? res : (res?.data || []);
            setUsers(fetchedUsers);
        } catch (err) {
            console.error("Could not fetch users for filter", err);
            setUsers([]); // Sécurité anti-crash
        }
    }, []);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const handleFilterChange = (e) => {
        setFilters({ ...filters, [e.target.name]: e.target.value });
        setCurrentPage(1);
    };

    const getStatusBadge = (status) => {
        return status === 'SUCCESS' ? <Badge bg="success">Succès</Badge> : <Badge bg="danger">Échec</Badge>;
    };

    const handleExportPDF = async () => {
        setExporting(true);
        setError('');
        try {
            const params = { ...filters, limit: 0 };
            const res = await auditAPI.getLogs(params);
            
            let allLogs = [];
            if (res && res.data && Array.isArray(res.data.logs)) allLogs = res.data.logs;
            else if (res && Array.isArray(res.logs)) allLogs = res.logs;
            else if (Array.isArray(res)) allLogs = res;

            if (allLogs.length === 0) {
                setError("Aucun log à exporter pour les filtres actuels.");
                setExporting(false);
                return;
            }

            const doc = new jsPDF();
            doc.setFontSize(18);
            doc.text("Journal d'Audit", 14, 22);
            doc.setFontSize(11);
            doc.setTextColor(100);
            doc.text(`Généré le: ${new Date().toLocaleString('fr-FR')}`, 14, 30);

            const tableColumn = ["Date", "Utilisateur", "Action", "Entité", "Détails"];
            const tableRows = [];

            allLogs.forEach(log => {
                const logData = [
                    new Date(log.createdAt).toLocaleString('fr-FR'),
                    log.userName,
                    auditActionLabels[log.action] || log.action,
                    `${log.entity} (${(log.entityId || 'N/A').toString().slice(-6)})`,
                    log.details ? JSON.stringify(log.details).substring(0, 70) + '...' : '-'
                ];
                tableRows.push(logData);
            });

            autoTable(doc, {
                head: [tableColumn],
                body: tableRows,
                startY: 35,
                theme: 'grid',
                styles: { fontSize: 8 },
                headStyles: { fillColor: [41, 128, 185] }
            });

            doc.save(`journal_audit_${new Date().toISOString().slice(0, 10)}.pdf`);

        } catch (err) {
            setError("Erreur lors de la génération du PDF.");
        } finally {
            setExporting(false);
        }
    };

    const handleExportExcel = async () => {
        try {
            setLoading(true);
            const params = { ...filters, limit: 0 };
            const res = await auditAPI.getLogs(params);
            
            let allLogs = [];
            if (res && res.data && Array.isArray(res.data.logs)) allLogs = res.data.logs;
            else if (res && Array.isArray(res.logs)) allLogs = res.logs;
            else if (Array.isArray(res)) allLogs = res;

            const dataToExport = allLogs.map(log => ({
                'Date': new Date(log.createdAt).toLocaleString('fr-FR'),
                'Utilisateur': log.userName,
                'Action': auditActionLabels[log.action] || log.action,
                'Entité': log.entity,
                'ID Entité': log.entityId,
                'Statut': log.status === 'SUCCESS' ? 'Succès' : 'Échec',
                'Adresse IP': log.ipAddress
            }));

            const worksheet = XLSX.utils.json_to_sheet(dataToExport);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "AuditLogs");
            XLSX.writeFile(workbook, `journal_audit_${new Date().toISOString().split('T')[0]}.xlsx`);
        } catch (err) {
            setError("Erreur lors de l'export Excel.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-4">
            <div className="d-flex justify-content-between align-items-center mb-4">
                <h3 className="fw-bold mb-0">Journal d'Audit des Actions</h3>
                <div className="d-flex gap-2">
                    <Button variant="outline-success" onClick={handleExportExcel}>
                        <iconify-icon icon="solar:file-spreadsheet-bold" className="me-2 align-middle"></iconify-icon>
                        Excel
                    </Button>
                    <Button variant="outline-danger" onClick={handleExportPDF} disabled={exporting}>
                        {exporting ? <Spinner as="span" size="sm" /> : <iconify-icon icon="solar:file-pdf-bold" className="me-2 align-middle"></iconify-icon>}
                        PDF
                    </Button>
                </div>
            </div>
            {error && <Alert variant="danger">{error}</Alert>}

            <Card className="border-0 shadow-sm rounded-4 mb-4">
                <Card.Body>
                    <Row className="g-3">
                        <Col md={3}>
                            <Form.Label>Utilisateur</Form.Label>
                            <Form.Select name="user" value={filters.user} onChange={handleFilterChange}>
                                <option value="">Tous les utilisateurs</option>
                                {users.map(u => <option key={u._id || u.userId} value={u._id || u.userId}>{u.nom || u.vcFirstName}</option>)}
                            </Form.Select>
                        </Col>
                        <Col md={3}>
                            <Form.Label>Action</Form.Label>
                            <Form.Select name="action" value={filters.action} onChange={handleFilterChange}>
                                <option value="">Toutes les actions</option>
                                {Object.entries(auditActionLabels)
                                    .sort(([, a], [, b]) => a.localeCompare(b))
                                    .map(([key, label]) => (
                                        <option key={key} value={key}>{label}</option>
                                    ))}
                            </Form.Select>
                        </Col>
                        <Col md={3}>
                            <Form.Label>Date début</Form.Label>
                            <Form.Control type="date" name="startDate" value={filters.startDate} onChange={handleFilterChange} />
                        </Col>
                        <Col md={3}>
                            <Form.Label>Date fin</Form.Label>
                            <Form.Control type="date" name="endDate" value={filters.endDate} onChange={handleFilterChange} />
                        </Col>
                    </Row>
                </Card.Body>
            </Card>

            <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
                <Card.Body className="p-0">
                    {loading ? (
                        <div className="text-center p-5"><Spinner animation="border" /></div>
                    ) : (
                        <Table hover responsive className="align-middle mb-0">
                            <thead className="bg-light">
                                <tr>
                                    <th className="ps-4">Date</th>
                                    <th>Utilisateur</th>
                                    <th>Action</th>
                                    <th>Entité</th>
                                    <th>Détails</th>
                                    <th>IP</th>
                                    <th className="text-center">Statut</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(logs || []).length > 0 ? (
                                    logs.map(log => (
                                        <tr key={log._id || Math.random()}>
                                            <td className="ps-4 text-nowrap">{new Date(log.createdAt).toLocaleString('fr-FR')}</td>
                                            <td>{log.userName}</td>
                                            <td><Badge bg="primary-subtle" text="primary-emphasis">{auditActionLabels[log.action] || log.action}</Badge></td>
                                            <td>{log.entity} {log.entityId && <small className="text-muted">({log.entityId.toString().slice(-6)})</small>}</td>
                                            <td>
                                                {log.details && <pre className="small bg-light p-2 rounded m-0" style={{maxHeight: '100px', overflow: 'auto', whiteSpace: 'pre-wrap'}}>
                                                    {JSON.stringify(log.details, null, 2)}
                                                </pre>}
                                            </td>
                                            <td>{log.ipAddress}</td>
                                            <td className="text-center">{getStatusBadge(log.status)}</td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr><td colSpan="7" className="text-center py-5 text-muted">Aucun journal trouvé pour les filtres sélectionnés.</td></tr>
                                )}
                            </tbody>
                        </Table>
                    )}
                    {!loading && (logs || []).length > 0 && totalPages > 1 && (
                        <div className="d-flex justify-content-center p-3 border-top">
                            <Pagination className="mb-0">
                                <Pagination.First onClick={() => setCurrentPage(1)} disabled={currentPage === 1} />
                                <Pagination.Prev onClick={() => setCurrentPage(currentPage - 1)} disabled={currentPage === 1} />
                                <Pagination.Item active>{currentPage} / {totalPages}</Pagination.Item>
                                <Pagination.Next onClick={() => setCurrentPage(currentPage + 1)} disabled={currentPage === totalPages} />
                                <Pagination.Last onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} />
                            </Pagination>
                        </div>
                    )}
                </Card.Body>
            </Card>
        </div>
    );
};

export default AuditLogView;