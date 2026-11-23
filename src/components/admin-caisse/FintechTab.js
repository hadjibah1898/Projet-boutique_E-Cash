/**
 * @file FintechTab.js
 * @description Onglet "Transactions Fintech" - Tableau filtré des transactions numériques.
 */

import React from 'react';
import { Card, Table, Badge, Button, Form, Alert } from 'react-bootstrap';

const FintechTab = ({
  fintechSales,
  fintechLoading,
  fintechSearchTerm,
  setFintechSearchTerm,
  dateFilter,
  filterGerant,
  managers,
  formatCurrency,
  resolveBoutiqueName,
  resolveGerantName,
  onExportPDF,
  onExportExcel
}) => {
  if (fintechLoading) {
    return (
      <div className="text-center py-5">
        <span className="spinner-border" role="status" style={{ color: '#FF6600' }} />
      </div>
    );
  }

  if (fintechSales.length === 0) {
    return (
      <Alert variant="info" className="m-4">
        Aucune transaction Fintech trouvée pour cette période.
      </Alert>
    );
  }

  const total = fintechSales.reduce((acc, v) => acc + (parseFloat(v.prixTotal || v.mNetAmount) || 0), 0);

  return (
    <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
      <Card.Header className="bg-white py-3 d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3">
        <h5 className="mb-0 fw-bold" style={{ color: '#FF6600' }}>Historique Global des Flux Numériques</h5>
        <div className="d-flex gap-2">
          <input
            type="text"
            placeholder="Rechercher par Réf. Transaction..."
            className="form-control form-control-sm rounded-pill shadow-sm"
            style={{ maxWidth: '200px' }}
            value={fintechSearchTerm}
            onChange={(e) => setFintechSearchTerm(e.target.value)}
          />
          <button className="btn btn-outline-success btn-sm" onClick={onExportExcel} disabled={fintechLoading}>
            <span className="me-1">📊</span> Export Excel
          </button>
          <button className="btn btn-outline-danger btn-sm" onClick={onExportPDF} disabled={fintechLoading}>
            <span className="me-1">📄</span> Export PDF
          </button>
        </div>
      </Card.Header>
      <Card.Body className="p-0">
        <Table striped hover responsive className="align-middle mb-0">
          <thead className="bg-light">
            <tr>
              <th className="ps-4 py-3">Date & Heure</th>
              <th>Boutique</th>
              <th>Gérant</th>
              <th>Mode</th>
              <th>Réf. Transaction</th>
              <th className="text-end pe-4">Montant</th>
            </tr>
          </thead>
          <tbody>
            {fintechSales.map(v => (
              <tr key={v._id || v.saleId}>
                <td className="ps-4">
                  <div className="fw-bold">{new Date(v.createdAt).toLocaleDateString()}</div>
                  <div className="small text-muted">{new Date(v.createdAt).toLocaleTimeString()}</div>
                </td>
                <td>{resolveBoutiqueName(v.boutique)}</td>
                <td>{resolveGerantName(v.gerant)}</td>
                <td>
                  {v.modePaiement === 'ORANGE_MONEY' && <Badge style={{ backgroundColor: '#FF6600', color: 'white' }} className="border-0 fw-normal">OM</Badge>}
                  {v.modePaiement === 'MTN_MOMO' && <Badge style={{ backgroundColor: '#FFCC00', color: 'black' }} className="border-0 fw-normal">Mobi</Badge>}
                  {v.modePaiement === 'CARD' && <Badge bg="info" className="border-0 fw-normal">Card</Badge>}
                  {v.modePaiement === 'BANK_TRANSFER' && <Badge bg="secondary" className="border-0 fw-normal">Bank</Badge>}
                </td>
                <td className="small text-muted font-monospace">{v.transactionRef || '-'}</td>
                <td className="text-end pe-4 fw-bold">{formatCurrency(v.prixTotal || v.mNetAmount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="table-light">
            <tr>
              <td colSpan="5" className="fw-bold text-end py-3">TOTAL PÉRIODE :</td>
              <td className="text-end pe-4 fw-bold fs-5" style={{ color: '#FF6600' }}>
                {formatCurrency(total)}
              </td>
            </tr>
          </tfoot>
        </Table>
      </Card.Body>
    </Card>
  );
};

export default FintechTab;
