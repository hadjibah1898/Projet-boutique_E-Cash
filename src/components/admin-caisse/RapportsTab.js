import React from 'react';
import { Card, Table, Badge, Button, Pagination, OverlayTrigger, Tooltip, Spinner } from 'react-bootstrap';

const RapportsTab = ({
  rapports,
  loading,
  currentPage,
  totalPages,
  itemsPerPage,
  setCurrentPage,
  handleValidateReportClick,
  handleRejectReportClick,
  handleShowDetails,
  resolveGerantName,
  resolveBoutiqueName,
  formatCurrency,
  getStatusText,
  CASH_REPORT_STATUS
}) => {
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentRapports = rapports.slice(indexOfFirstItem, indexOfLastItem);

  const getStatusBadge = (statusId, statusStr) => {
    if (statusId === CASH_REPORT_STATUS?.VALIDATED || statusStr === 'VALIDE' || statusStr === 'APPROUVEE') return <Badge bg="success">Validé</Badge>;
    if (statusId === CASH_REPORT_STATUS?.REJECTED || statusStr === 'REJETE' || statusStr === 'REFUSEE') return <Badge bg="danger">Refusé</Badge>;
    return <Badge bg="warning" text="dark">En attente</Badge>;
  };

  if (loading) {
    return <Card className="border-0 shadow-sm rounded-4"><Card.Body className="text-center py-5"><Spinner animation="border" /></Card.Body></Card>;
  }

  return (
    <Card className="border-0 shadow-sm rounded-4 overflow-hidden">
      <Card.Body className="p-0">
        <Table hover responsive className="align-middle mb-0">
          <thead className="bg-light">
            <tr>
              <th className="ps-4 py-3">Date Clôture</th>
              <th className="py-3">Gérant / Boutique</th>
              <th className="py-3 text-end">Total Ventes</th>
              <th className="py-3 text-end">Recouvrements</th>
              <th className="py-3 text-end">Numérique</th>
              <th className="py-3 text-end">Dettes</th>
              <th className="py-3 text-end">Dépenses</th>
              <th className="py-3 text-end">Solde Théorique</th>
              <th className="py-3 text-end">Montant Reçu</th>
              <th className="py-3 text-center">Écart</th>
              <th className="py-3 text-center">Statut</th>
              <th className="pe-4 py-3 text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            {currentRapports.length > 0 ? (
              currentRapports.map(r => {
                const statutVal = getStatusText(r);
                return (
                  <tr key={r.cashReportId || r._id} onClick={() => handleShowDetails(r)} className={statutVal === 'EN_ATTENTE' ? 'bg-warning-subtle' : 'clickable-row'}>
                    <td className="ps-4 text-nowrap">
                      {new Date(r.dtCreatedAt || r.createdAt).toLocaleDateString()}
                      <div className="small text-muted">{new Date(r.dtCreatedAt || r.createdAt).toLocaleTimeString()}</div>
                    </td>
                    <td>
                      <div className="fw-bold">{resolveGerantName(r)}</div>
                      <div className="small text-muted">{resolveBoutiqueName(r)}</div>
                    </td>
                    <td className="text-end text-success">{formatCurrency(r.mTotalSales || r.totalVentes)}</td>
                    <td className="text-end text-info">{formatCurrency(r.mTotalRecoveries || r.totalRecouvrement)}</td>
                    <td className="text-end fw-bold" style={{ color: '#FF6600' }}>{formatCurrency(r.mTotalMobileMoney || r.totalMobileMoney)}</td>
                    <td className="text-end text-warning">{formatCurrency(r.mTotalCredit || r.totalDettes)}</td>
                    <td className="text-end text-danger">{formatCurrency(r.mTotalApprovedExpenses || r.totalDepensesApprouvees)}</td>
                    <td className="text-end fw-bold">{formatCurrency(r.mTheoreticalBalance || r.soldeTheorique)}</td>
                    <td className="text-end fw-bold text-primary">{formatCurrency(r.mClosingAmount || r.montantCloture)}</td>
                    <td className="text-center">
                      {(r.mDifferenceAmount !== undefined ? r.mDifferenceAmount : r.ecart) !== 0 ? (
                        <Badge bg="danger">{formatCurrency(r.mDifferenceAmount || r.ecart)}</Badge>
                      ) : <Badge bg="success">OK</Badge>}
                    </td>
                    <td className="text-center">
                      {statutVal === 'REJETE' && (r.vcAdminComment || r.commentairesAdmin) ? (
                        <OverlayTrigger overlay={<Tooltip>Motif: {r.vcAdminComment || r.commentairesAdmin}</Tooltip>}>
                          {getStatusBadge(r.cashReportStatusId, r.statut)}
                        </OverlayTrigger>
                      ) : (
                        getStatusBadge(r.cashReportStatusId, r.statut)
                      )}
                    </td>
                    <td className="pe-4 text-end">
                      {statutVal === 'EN_ATTENTE' && (
                        <div className="d-flex justify-content-end gap-2">
                          <Button variant="success" size="sm" onClick={(e) => { e.stopPropagation(); handleValidateReportClick(r); }}>Valider</Button>
                          <Button variant="danger" size="sm" onClick={(e) => { e.stopPropagation(); handleRejectReportClick(r); }}>Rejeter</Button>
                        </div>
                      )}
                      {statutVal === 'VALIDE' && (
                        <span className="text-success small">
                          <iconify-icon icon="solar:check-read-bold" className="me-1 align-middle"></iconify-icon> 
                          Encaissé
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr><td colSpan="12" className="text-center py-5 text-muted">Aucun rapport trouvé.</td></tr>
            )}
          </tbody>
        </Table>
        {totalPages > 1 && (
          <div className="d-flex justify-content-center p-3 border-top">
            <Pagination>
              <Pagination.Prev onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1} />
              {[...Array(totalPages)].map((_, idx) => (
                <Pagination.Item key={idx + 1} active={idx + 1 === currentPage} onClick={() => setCurrentPage(idx + 1)}>{idx + 1}</Pagination.Item>
              ))}
              <Pagination.Next onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages} />
            </Pagination>
          </div>
        )}
      </Card.Body>
    </Card>
  );
};

export default RapportsTab;