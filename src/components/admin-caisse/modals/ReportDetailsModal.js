
/**
 * @file ReportDetailsModal.js
 * @description Modale détaillée d'un rapport de caisse.
 * Affiche les véritables moyens de paiement depuis vente.payments.
 */

import React from 'react';
import {
  Modal,
  Tabs,
  Tab,
  Row,
  Col,
  Card,
  Table,
  Badge,
  Button,
  Alert
} from 'react-bootstrap';

// ======================================================
// NORMALISATION DES MOYENS DE PAIEMENT
// ======================================================

const getPaymentCode = (payment) => {
  if (!payment) return '';

  return String(
    payment.methodCode ||
    payment.typeCode ||
    payment.paymentMethodCode ||
    payment.vcCode ||
    payment.vcPaymentMethod ||
    payment.modePaiement ||
    payment.paymentMethod ||
    payment.method ||
    ''
  ).trim().toUpperCase().replace(/[\s-]+/g, '_');
};

const getPaymentLabel = (payment) => {
  const code = getPaymentCode(payment);
  const rawLabel = String(payment?.vcPaymentMethod || '').trim();

  switch (code) {
    case 'CASH':
    case 'ESPECES':
    case 'ESPECE':
    case 'CASH_PAYMENT':
      return 'Espèces';

    case 'ORANGE_MONEY':
    case 'ORANGE':
    case 'OM':
      return 'Orange Money';

    case 'MTN_MOMO':
    case 'MTN_MOBILE_MONEY':
    case 'MOMO':
    case 'MOBI':
      return 'MTN MoMo';

    case 'CARD':
    case 'CARTE':
    case 'BANK_CARD':
      return 'Carte bancaire';

    case 'BANK_TRANSFER':
    case 'TRANSFER':
    case 'VIREMENT':
      return 'Virement bancaire';

    default:
      return rawLabel || code || 'Mode inconnu';
  }
};

const getPaymentBadge = (code) => {
  switch (code) {
    case 'CASH':
    case 'ESPECES':
    case 'ESPECE':
    case 'CASH_PAYMENT':
      return {
        bg: 'success',
        text: 'white',
        icon: '💵'
      };

    case 'ORANGE_MONEY':
    case 'ORANGE':
    case 'OM':
      return {
        style: {
          backgroundColor: '#FF6600',
          color: '#FFFFFF'
        },
        icon: '🟠'
      };

    case 'MTN_MOMO':
    case 'MTN_MOBILE_MONEY':
    case 'MOMO':
    case 'MOBI':
      return {
        style: {
          backgroundColor: '#FFCC00',
          color: '#222222'
        },
        icon: '📱'
      };

    case 'CARD':
    case 'CARTE':
    case 'BANK_CARD':
      return {
        bg: 'info',
        text: 'white',
        icon: '💳'
      };

    case 'BANK_TRANSFER':
    case 'TRANSFER':
    case 'VIREMENT':
      return {
        bg: 'secondary',
        text: 'white',
        icon: '🏦'
      };

    default:
      return {
        bg: 'light',
        text: 'dark',
        icon: '💰'
      };
  }
};

// ======================================================
// RÉCUPÉRATION DES PAIEMENTS D'UNE VENTE
// ======================================================

const getSalePayments = (vente) => {
  if (
    Array.isArray(vente?.payments) &&
    vente.payments.length > 0
  ) {
    return vente.payments;
  }

  // Compatibilité avec les anciennes données.
  if (vente?.modePaiement || vente?.vcPaymentMethod) {
    return [{
      vcPaymentMethod:
        vente.modePaiement || vente.vcPaymentMethod,
      mAmount: null
    }];
  }

  return [];
};

// ======================================================
// AFFICHAGE DES BADGES ET MONTANTS DE PAIEMENT
// ======================================================

const PaymentBadges = ({ vente, formatCurrency }) => {
  const payments = getSalePayments(vente);

  if (payments.length === 0) {
    return (
      <Badge bg="light" text="dark" className="fw-normal">
        Paiement non disponible
      </Badge>
    );
  }

  return (
    <div className="d-flex flex-column align-items-start gap-1">
      {payments.map((payment, index) => {
        const code = getPaymentCode(payment);
        const label = getPaymentLabel(payment);
        const badge = getPaymentBadge(code);

        const amount =
          payment.mAmount ??
          payment.amount ??
          null;

        return (
          <div
            key={
              payment.salePaymentId ||
              payment.paymentId ||
              `${vente.saleId || 'sale'}-${index}`
            }
            className="d-flex align-items-center flex-wrap gap-1"
          >
            <Badge
              bg={badge.bg}
              text={badge.text}
              style={{
                ...badge.style,
                fontSize: '0.75rem',
                fontWeight: 'normal',
                padding: '6px 9px'
              }}
              className="border-0"
            >
              {badge.icon} {label}
            </Badge>

            {amount !== null && amount !== undefined && (
              <small className="text-muted">
                {typeof formatCurrency === 'function'
                  ? formatCurrency(amount)
                  : `${Number(amount).toLocaleString('fr-FR')} GNF`}
              </small>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ======================================================
// FILTRE DES VENTES FINTECH
// ======================================================

const isDigitalSale = (vente) => {
  const digitalCodes = [
    'ORANGE_MONEY',
    'ORANGE_MONEY_GN',
    'ORANGE',
    'OM',
    'MTN_MOMO',
    'MTN_MOBILE_MONEY',
    'MOMO',
    'MOBI',
    'CARD',
    'CARTE',
    'BANK_CARD',
    'BANK_TRANSFER',
    'TRANSFER',
    'VIREMENT'
  ];

  return getSalePayments(vente).some(payment =>
    digitalCodes.includes(getPaymentCode(payment))
  );
};

// ======================================================
// COMPOSANT PRINCIPAL
// ======================================================

const ReportDetailsModal = ({
  show,
  onHide,
  reportDetails,
  detailsLoading,
  filterSalesMode,
  setFilterSalesMode,
  formatCurrency,
  resolveGerantName,
  resolveBoutiqueName,
  onExportPDF
}) => {

  if (detailsLoading) {
    return (
      <Modal
        show={show}
        onHide={onHide}
        size="xl"
        centered
        animation={false}
      >
        <Modal.Header closeButton>
          <Modal.Title>Détails du Rapport</Modal.Title>
        </Modal.Header>

        <Modal.Body>
          <div className="text-center py-5">
            <span className="spinner-border" role="status" />
          </div>
        </Modal.Body>
      </Modal>
    );
  }

  if (!reportDetails || !reportDetails.rapport) {
    return (
      <Modal
        show={show}
        onHide={onHide}
        size="xl"
        centered
        animation={false}
      >
        <Modal.Header closeButton>
          <Modal.Title>Détails du Rapport</Modal.Title>
        </Modal.Header>

        <Modal.Body>
          <Alert variant="info">
            Aucun détail à afficher.
          </Alert>
        </Modal.Body>

        <Modal.Footer>
          <Button variant="secondary" onClick={onHide}>
            Fermer
          </Button>
        </Modal.Footer>
      </Modal>
    );
  }

  const r = reportDetails.rapport;
  const ventes = reportDetails.ventes || [];
  const depenses = reportDetails.depenses || [];

  const ventesFiltrees = ventes.filter(vente =>
    filterSalesMode === 'digital'
      ? isDigitalSale(vente)
      : true
  );

  return (
    <Modal
      show={show}
      onHide={onHide}
      size="xl"
      centered
      animation={false}
    >
      <Modal.Header closeButton>
        <Modal.Title>
          📄 Détails du Rapport
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>

        {/* INFORMATIONS DU RAPPORT */}

        <Row className="mb-4 g-3">

          <Col md={6}>
            <Card className="h-100">
              <Card.Body>
                <Card.Title as="h6" className="text-muted">
                  Gérant / Boutique
                </Card.Title>

                <Card.Text className="fw-bold fs-5">
                  {resolveGerantName(r)} / {resolveBoutiqueName(r)}
                </Card.Text>
              </Card.Body>
            </Card>
          </Col>

          <Col md={6}>
            <Card className="h-100">
              <Card.Body>
                <Card.Title as="h6" className="text-muted">
                  Date du Rapport
                </Card.Title>

                <Card.Text className="fw-bold fs-5">
                  {new Date(
                    r.dtCreatedAt || r.createdAt
                  ).toLocaleString('fr-FR')}
                </Card.Text>
              </Card.Body>
            </Card>
          </Col>

          <Col xs={6} md={4} lg>
            <Card bg="light" className="h-100 shadow-sm border-0">
              <Card.Body className="p-3">
                <Card.Title as="h6" className="text-muted text-uppercase mb-2">
                  Ventes (CA)
                </Card.Title>

                <Card.Text className="fw-bold mb-0">
                  {formatCurrency(
                    r.mTotalSales ?? r.totalVentes ?? 0
                  )}
                </Card.Text>
              </Card.Body>
            </Card>
          </Col>

          <Col
            xs={6}
            md={4}
            lg
            onClick={() =>
              setFilterSalesMode(
                filterSalesMode === 'digital' ? null : 'digital'
              )
            }
            style={{ cursor: 'pointer' }}
          >
            <Card
              className="h-100 shadow-sm border-0 border-start border-4"
              style={{
                backgroundColor: '#FFF5EB',
                borderColor: '#FF6600'
              }}
            >
              <Card.Body className="p-3">
                <Card.Title
                  as="h6"
                  className="text-uppercase mb-2"
                  style={{ color: '#FF6600' }}
                >
                  Fintech (OM/Mobi)
                </Card.Title>

                <Card.Text
                  className="fw-bold mb-0"
                  style={{ color: '#FF6600' }}
                >
                  {formatCurrency(
                    r.mTotalMobileMoney ??
                    r.totalMobileMoney ??
                    0
                  )}
                </Card.Text>
              </Card.Body>
            </Card>
          </Col>

          <Col xs={6} md={4} lg>
            <Card
              bg="warning-subtle"
              className="h-100 shadow-sm border-0"
            >
              <Card.Body className="p-3">
                <Card.Title
                  as="h6"
                  className="text-warning-emphasis text-uppercase mb-2"
                >
                  Dettes
                </Card.Title>

                <Card.Text className="fw-bold text-warning-emphasis mb-0">
                  {formatCurrency(
                    r.mTotalCredit ?? r.totalDettes ?? 0
                  )}
                </Card.Text>
              </Card.Body>
            </Card>
          </Col>

          <Col xs={6} md={6} lg>
            <Card
              bg="primary-subtle"
              className="h-100 shadow-sm border-0"
            >
              <Card.Body className="p-3">
                <Card.Title
                  as="h6"
                  className="text-primary-emphasis text-uppercase mb-2"
                >
                  Espèces Attendu
                </Card.Title>

                <Card.Text className="fw-bold text-primary mb-0">
                  {formatCurrency(
                    r.mTheoreticalBalance ??
                    r.soldeTheorique ??
                    0
                  )}
                </Card.Text>
              </Card.Body>
            </Card>
          </Col>

          <Col xs={12} md={6} lg>
            <Card
              bg="success-subtle"
              className="h-100 shadow-sm border-0"
            >
              <Card.Body className="p-3">
                <Card.Title
                  as="h6"
                  className="text-success-emphasis text-uppercase mb-2"
                >
                  Montant Reçu
                </Card.Title>

                <Card.Text className="fw-bold text-success mb-0">
                  {formatCurrency(
                    r.mClosingAmount ??
                    r.montantCloture ??
                    0
                  )}
                </Card.Text>
              </Card.Body>
            </Card>
          </Col>

        </Row>

        {/* ONGLETS */}

        <Tabs
          defaultActiveKey="ventes"
          id="report-details-tabs"
          className="nav-tabs-custom"
          onSelect={() => setFilterSalesMode(null)}
        >

          {/* VENTES */}

          <Tab
            eventKey="ventes"
            title={
              <span className="d-flex align-items-center">
                🛒 Ventes ({ventes.length})
              </span>
            }
          >

            <div className="d-flex justify-content-between align-items-center mt-3 mb-2">

              <div className="small text-muted">
                {ventesFiltrees.length} vente(s) affichée(s)
              </div>

              <Button
                size="sm"
                variant={
                  filterSalesMode === 'digital'
                    ? 'warning'
                    : 'outline-secondary'
                }
                onClick={() =>
                  setFilterSalesMode(
                    filterSalesMode === 'digital'
                      ? null
                      : 'digital'
                  )
                }
              >
                {filterSalesMode === 'digital'
                  ? 'Afficher toutes les ventes'
                  : 'Filtrer Fintech'}
              </Button>

            </div>

            <Table striped hover responsive size="sm">

              <thead>
                <tr>
                  <th>Heure</th>
                  <th>Article</th>
                  <th>Mode de paiement</th>
                  <th className="text-center">Qté</th>
                  <th className="text-end">Total</th>
                </tr>
              </thead>

              <tbody>

                {ventesFiltrees.map((vente, index) => (

                  <tr
                    key={
                      vente.saleDetailId ||
                      vente._id ||
                      `${vente.saleId}-${index}`
                    }
                  >

                    <td>
                      {new Date(
                        vente.dtSoldAt || vente.createdAt
                      ).toLocaleTimeString('fr-FR')}
                    </td>

                    <td>
                      {vente.article?.nom ||
                        vente.vcProductName ||
                        vente.articleNom ||
                        'Article supprimé'}
                    </td>

                    <td>
                      <PaymentBadges
                        vente={vente}
                        formatCurrency={formatCurrency}
                      />
                    </td>

                    <td className="text-center">
                      {vente.quantite ?? vente.dcQuantity ?? 0}
                    </td>

                    <td className="text-end fw-bold">
                      {formatCurrency(
                        vente.prixTotal ??
                        vente.mLineAmount ??
                        0
                      )}
                    </td>

                  </tr>

                ))}

                {ventesFiltrees.length === 0 && (
                  <tr>
                    <td
                      colSpan="5"
                      className="text-center text-muted py-3"
                    >
                      Aucune vente pour cette session.
                    </td>
                  </tr>
                )}

              </tbody>

            </Table>

          </Tab>

          {/* DEPENSES */}

          <Tab
            eventKey="depenses"
            title={
              <span className="d-flex align-items-center">
                💸 Dépenses ({depenses.length})
              </span>
            }
          >

            <Table
              striped
              hover
              responsive
              size="sm"
              className="mt-3"
            >

              <thead>
                <tr>
                  <th>Heure</th>
                  <th>Motif</th>
                  <th className="text-end">Montant</th>
                </tr>
              </thead>

              <tbody>

                {depenses.map(depense => (

                  <tr key={depense._id || depense.expenseId}>

                    <td>
                      {new Date(
                        depense.dtCreatedAt || depense.createdAt
                      ).toLocaleTimeString('fr-FR')}
                    </td>

                    <td>
                      {depense.motif || depense.vcReason}
                    </td>

                    <td className="text-end fw-bold text-danger">
                      {formatCurrency(
                        depense.montant ??
                        depense.mAmount ??
                        0
                      )}
                    </td>

                  </tr>

                ))}

                {depenses.length === 0 && (
                  <tr>
                    <td
                      colSpan="3"
                      className="text-center text-muted py-3"
                    >
                      Aucune dépense pour cette session.
                    </td>
                  </tr>
                )}

              </tbody>

            </Table>

          </Tab>

        </Tabs>

      </Modal.Body>

      <Modal.Footer className="d-flex justify-content-between">

        <Button
          variant="outline-danger"
          onClick={onExportPDF}
          disabled={
            detailsLoading ||
            !reportDetails?.rapport
          }
        >
          📄 Exporter PDF
        </Button>

        <Button variant="secondary" onClick={onHide}>
          Fermer
        </Button>

      </Modal.Footer>

    </Modal>
  );
};

export default ReportDetailsModal;
