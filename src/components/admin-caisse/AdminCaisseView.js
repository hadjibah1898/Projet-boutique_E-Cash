/**
 * @file AdminCaisseView.js
 * @description Composant parent orchestrant la vue "Finances & Caisse" pour un Administrateur.
 */

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, Tab, Alert } from 'react-bootstrap';
import { useCaisse } from '../../hooks/useCaisse';
import { formatCurrency } from '../../utils/formatUtils';
import { TABS } from '../../constants/caisseConstants';
import {
  exportFintechPDF,
  exportFintechExcel,
  exportCaissePDF,
  exportCaisseExcel,
  exportReportDetailsPDF
} from '../../utils/caisseExportUtils';

import KPIsRow from './KPIsRow';
import RapportsTab from './RapportsTab';
import CaisseCentraleTab from './CaisseCentraleTab';
import FintechTab from './FintechTab';
import ValidateReportModal from './modals/ValidateReportModal';
import RejectReportModal from './modals/RejectReportModal';
import ReportDetailsModal from './modals/ReportDetailsModal';

const AdminCaisseView = () => {
  const [searchParams] = useSearchParams();
  const [key, setKey] = useState(searchParams.get('tab') || TABS.RAPPORTS);

  const {
    managers, rapports, boutiques, caisseAdmin, treasuryAccounts, stats,
    fintechSales, reportDetails, filteredHistory, currentRapports, totalPages,
    loading, error, success, fintechLoading, detailsLoading, isValidating,
    dateFilter, filterGerant, fintechSearchTerm, filterSalesMode,
    showValidateReportModal, showRejectReportModal, showDetailsModal, selectedReport,
    currentPage, itemsPerPage,
    setDateFilter, setFilterGerant, setFintechSearchTerm, setFilterSalesMode, setCurrentPage,
    fetchData, fetchFintechSales,
    handleValidateReportClick, confirmValidateReport,
    handleRejectReportModal, confirmRejectReport,
    handleShowDetails, handleCloseDetailsModal,
    setShowDetailsModal, setShowValidateReportModal, setShowRejectReportModal,
    adminComment, setAdminComment, setError, setSuccess,
    safeNum, resolveGerantName, resolveBoutiqueName, getStatusText, CASH_REPORT_STATUS
  } = useCaisse();

  useEffect(() => {
    if (key === TABS.FINTECH) {
      fetchFintechSales();
    }
  }, [key, fetchFintechSales]);

  const handleExportFintechPDF = () => {
    exportFintechPDF(fintechSales, dateFilter, filterGerant, managers, resolveBoutiqueName, resolveGerantName);
  };

  const handleExportFintechExcel = () => {
    exportFintechExcel(fintechSales, dateFilter, filterGerant, managers, resolveBoutiqueName, resolveGerantName);
  };

  const handleExportPDF = () => {
    exportCaissePDF(rapports, caisseAdmin, dateFilter, filterGerant, key, managers, formatCurrency, resolveBoutiqueName, resolveGerantName);
  };

  const handleExportExcel = () => {
    exportCaisseExcel(rapports, caisseAdmin, dateFilter, filterGerant, key, managers, formatCurrency, resolveBoutiqueName, resolveGerantName, stats);
  };

  const handleExportReportDetailsPDF = () => {
    exportReportDetailsPDF(reportDetails, formatCurrency, resolveGerantName, resolveBoutiqueName);
  };

  const formatCurrencyWrapper = (amount) => formatCurrency(amount);

  return (
    <div className="p-4">
      <style>{`
        .clickable-row { cursor: pointer; }
      `}</style>

      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
        <h3 className="fw-bold mb-0">Finances & Caisse</h3>
        <div className="d-flex gap-2 align-items-center flex-wrap">
          <select className="form-select form-select-sm" value={filterGerant} onChange={e => setFilterGerant(e.target.value)} style={{ minWidth: '150px' }}>
            <option value="">Tous les gérants</option>
            {managers.map(m => <option key={m._id || m.userId} value={m._id || m.userId}>{m.vcFirstName || m.nom} {m.vcLastName || ''}</option>)}
          </select>
          <div className="d-flex gap-2 align-items-center">
            <input type="date" className="form-control form-control-sm" value={dateFilter.startDate} onChange={e => setDateFilter({ ...dateFilter, startDate: e.target.value })} title="Date début" />
            <span className="text-muted">-</span>
            <input type="date" className="form-control form-control-sm" value={dateFilter.endDate} onChange={e => setDateFilter({ ...dateFilter, endDate: e.target.value })} title="Date fin" />
          </div>
          <div className="d-flex gap-2">
            <button className="btn btn-outline-success btn-sm rounded-pill shadow-sm" onClick={handleExportExcel}>
              <span className="me-2">📊</span> Excel
            </button>
            <button className="btn btn-outline-secondary btn-sm rounded-pill shadow-sm" onClick={handleExportPDF}>
              <span className="me-2">📄</span> PDF
            </button>
          </div>
          <button className="btn btn-outline-primary btn-sm rounded-pill shadow-sm ms-2" onClick={fetchData}>
            <span className="me-2">🔄</span> Actualiser
          </button>
        </div>
      </div>

      <KPIsRow
        stats={stats}
        formatCurrency={formatCurrencyWrapper}
        onGoToFintech={() => setKey(TABS.FINTECH)}
      />

      {success && <Alert variant="success" onClose={() => setSuccess('')} dismissible>{success}</Alert>}
      {error && <Alert variant="danger" onClose={() => setError('')} dismissible>{error}</Alert>}

      <Tabs id="admin-caisse-tabs" activeKey={key} onSelect={(k) => setKey(k)} className="mb-4 nav-tabs-custom">

        <Tab eventKey={TABS.RAPPORTS} title={<span>Rapports de Caisse</span>}>
          <RapportsTab
            rapports={currentRapports}
            managers={managers}
            boutiques={boutiques}
            loading={loading}
            currentPage={currentPage}
            totalPages={totalPages}
            itemsPerPage={itemsPerPage}
            setCurrentPage={setCurrentPage}
            handleValidateReportClick={handleValidateReportClick}
            handleRejectReportClick={handleRejectReportModal}
            handleShowDetails={handleShowDetails}
            resolveGerantName={resolveGerantName}
            resolveBoutiqueName={resolveBoutiqueName}
            formatCurrency={formatCurrencyWrapper}
            getStatusText={getStatusText}
            CASH_REPORT_STATUS={CASH_REPORT_STATUS}
          />
        </Tab>

        <Tab eventKey={TABS.CAISSE_CENTRALE} title={<span>Caisse Centrale</span>}>
          <CaisseCentraleTab
            caisseAdmin={caisseAdmin}
            treasuryAccounts={treasuryAccounts}
            filteredHistory={filteredHistory}
            managers={managers}
            formatCurrency={formatCurrencyWrapper}
            dateFilter={dateFilter}
            filterGerant={filterGerant}
          />
        </Tab>

        <Tab eventKey={TABS.FINTECH} title={<span>Transactions Fintech</span>}>
          <FintechTab
            fintechSales={fintechSales}
            fintechLoading={fintechLoading}
            fintechSearchTerm={fintechSearchTerm}
            setFintechSearchTerm={setFintechSearchTerm}
            dateFilter={dateFilter}
            filterGerant={filterGerant}
            managers={managers}
            formatCurrency={formatCurrencyWrapper}
            resolveBoutiqueName={resolveBoutiqueName}
            resolveGerantName={resolveGerantName}
            onExportPDF={handleExportFintechPDF}
            onExportExcel={handleExportFintechExcel}
          />
        </Tab>
      </Tabs>

      <ValidateReportModal
        show={showValidateReportModal}
        onHide={() => setShowValidateReportModal(false)}
        selectedReport={selectedReport}
        adminComment={adminComment}
        setAdminComment={setAdminComment}
        isValidating={isValidating}
        onConfirm={confirmValidateReport}
        formatCurrency={formatCurrencyWrapper}
        resolveGerantName={resolveGerantName}
      />

      <ReportDetailsModal
        show={showDetailsModal}
        onHide={handleCloseDetailsModal}
        reportDetails={reportDetails}
        detailsLoading={detailsLoading}
        filterSalesMode={filterSalesMode}
        setFilterSalesMode={setFilterSalesMode}
        formatCurrency={formatCurrencyWrapper}
        resolveGerantName={resolveGerantName}
        resolveBoutiqueName={resolveBoutiqueName}
        onExportPDF={handleExportReportDetailsPDF}
      />

      <RejectReportModal
        show={showRejectReportModal}
        onHide={() => setShowRejectReportModal(false)}
        selectedReport={selectedReport}
        adminComment={adminComment}
        setAdminComment={setAdminComment}
        isValidating={isValidating}
        onConfirm={confirmRejectReport}
        formatCurrency={formatCurrencyWrapper}
        resolveGerantName={resolveGerantName}
      />
    </div>
  );
};

export default AdminCaisseView;

