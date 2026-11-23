
/**
 * @file CaisseCentraleTab.js
 * @description
 * Onglet Caisse Centrale :
 * - Soldes des comptes de trésorerie
 * - Historique des mouvements financiers
 * - Couleurs synchronisées entre cartes et moyens de paiement
 */

import React from 'react';
import { Row, Col, Card, Table } from 'react-bootstrap';

import orangeLogo from '../../assets/orange-logo.png';
import mtnLogo from '../../assets/mtn-logo.png';
import caiseeLogo from '../../assets/caisse.png';

// ======================================================
// 1. FORMATAGE
// ======================================================

const safeNum = (value) => {
    if (value === null || value === undefined || value === '') {
        return 0;
    }

    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : 0;
};

const formatCurrency = (amount) => {
    const formatted = safeNum(amount).toLocaleString('fr-FR', {
        maximumFractionDigits: 2
    });

    return `${formatted.replace(/[\u00a0\u202f]/g, ' ')} GNF`;
};

const formatDate = (date) => {
    if (!date) return '—';

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
        return '—';
    }

    return parsedDate.toLocaleString('fr-FR');
};

// ======================================================
// 2. CONFIGURATION UNIQUE DES COMPTES
// ======================================================

const ACCOUNT_CONFIG = {
    CENTRAL_CASH: {
        title: 'Caisse Centrale (Espèces)',
        label: 'Espèces',
        image: caiseeLogo,
        icon: '💵',
        background: '#1769E8',
        color: '#FFFFFF'
    },

    ORANGE_MONEY: {
        title: 'Orange Money',
        label: 'Orange Money',
        image: orangeLogo,
        icon: '📱',
        background: '#F56608',
        color: '#FFFFFF'
    },

    MTN_MOMO: {
        title: 'MTN MoMo',
        label: 'MTN MoMo',
        image: mtnLogo,
        icon: '📱',
        background: '#FFCC00',
        color: '#242424'
    },

    BANK: {
        title: 'Compte Bancaire',
        label: 'Banque',
        image: null,
        icon: '🏦',
        background: '#DFF6FC',
        color: '#087990'
    }
};

// ======================================================
// 3. RÉCUPÉRATION DE LA CONFIGURATION
// ======================================================

const getAccountConfig = (typeCode) => {
    const code = String(typeCode || '').toUpperCase().trim();

    if (ACCOUNT_CONFIG[code]) {
        return ACCOUNT_CONFIG[code];
    }

    return {
        title: 'Autre Compte',
        label: 'Autre',
        image: null,
        icon: '💳',
        background: '#64748B',
        color: '#FFFFFF'
    };
};

// ======================================================
// 4. IDENTIFICATION DU MOYEN DE PAIEMENT
// ======================================================

const identifyPaymentMethod = (typeCode, description = '') => {

    const code = String(typeCode || '')
        .toUpperCase()
        .trim();

    const desc = String(description || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    // Priorité à la description lorsqu'elle identifie
    // explicitement un moyen de paiement.

    if (
        desc.includes('orange money') ||
        code.includes('ORANGE')
    ) {
        return 'ORANGE_MONEY';
    }

    if (
        desc.includes('mtn') ||
        desc.includes('mobicash') ||
        code.includes('MTN') ||
        code.includes('MOBICASH')
    ) {
        return 'MTN_MOMO';
    }

    if (
        desc.includes('banque') ||
        desc.includes('bancaire') ||
        code.includes('BANK') ||
        code.includes('BANQUE')
    ) {
        return 'BANK';
    }

    if (
        desc.includes('especes') ||
        desc.includes('cash') ||
        code.includes('CASH') ||
        code.includes('CENTRAL') ||
        code.includes('ESPECES')
    ) {
        return 'CENTRAL_CASH';
    }

    if (ACCOUNT_CONFIG[code]) {
        return code;
    }

    return code || 'UNKNOWN';
};

// ======================================================
// 5. DESCRIPTION DES MOUVEMENTS
// ======================================================

const formatDescription = (description) => {

    if (!description) {
        return 'Mouvement financier';
    }

    const value = String(description);
    const normalized = value.toLowerCase();

    if (normalized.includes('encaissement dette client')) {

        if (normalized.includes('orange money')) {
            return 'Paiement client via Orange Money';
        }

        if (
            normalized.includes('mobicash') ||
            normalized.includes('mtn')
        ) {
            return 'Paiement client via MTN MoMo';
        }

        if (
            normalized.includes('cash') ||
            normalized.includes('espèces') ||
            normalized.includes('especes')
        ) {
            return 'Paiement client en espèces';
        }

        return 'Paiement client';
    }

    if (
        normalized.includes('rapport de caisse') ||
        normalized.includes('rapport de Caisse')
    ) {
        return 'Clôture de caisse';
    }

    return value;
};

// ======================================================
// 6. DÉTERMINATION ENTRÉE / SORTIE
// ======================================================

const isIncomingMovement = (movement) => {

    const type = String(movement?.typeCode || '')
        .toUpperCase()
        .trim();

    if (['IN', 'ENTREE', 'ENTRÉE'].includes(type)) {
        return true;
    }

    if (['OUT', 'SORTIE'].includes(type)) {
        return false;
    }

    return safeNum(movement?.mAmount) >= 0;
};

// ======================================================
// 7. BADGE MOYEN DE PAIEMENT
// IMPORTANT : PAS DE REACT-BOOTSTRAP BADGE
// ======================================================

const AccountBadge = ({ typeCode, description }) => {

    const paymentCode = identifyPaymentMethod(
        typeCode,
        description
    );

    const config = getAccountConfig(paymentCode);

    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',

                minWidth: '115px',
                padding: '8px 14px',

                borderRadius: '50px',

                backgroundColor: config.background,
                color: config.color,

                fontSize: '13px',
                fontWeight: 700,
                lineHeight: 1.2,

                whiteSpace: 'nowrap',

                border: '1px solid rgba(0,0,0,0.06)',

                boxShadow: 'none',
                opacity: 1
            }}
        >
            {config.label}
        </span>
    );
};

// ======================================================
// 8. CARTE DE TRÉSORERIE
// ======================================================

const TreasuryAccountCard = ({ account }) => {

    const config = getAccountConfig(account.typeCode);

    return (
        <Col xs={12} sm={6} xl={3}>

            <Card
                className="border-0 shadow-sm h-100"
                style={{
                    backgroundColor: config.background,
                    color: config.color,
                    borderRadius: '16px',
                    minHeight: '174px'
                }}
            >

                <Card.Body
                    className="p-4 d-flex flex-column align-items-center justify-content-center text-center"
                >

                    {/* LOGO */}
                    <div
                        className="rounded-circle bg-white d-flex align-items-center justify-content-center mb-3 shadow-sm"
                        style={{
                            width: '52px',
                            height: '52px',
                            flexShrink: 0
                        }}
                    >

                        {config.image ? (

                            <>
                                <img
                                    src={config.image}
                                    alt={config.title}
                                    style={{
                                        width: '30px',
                                        height: '30px',
                                        objectFit: 'contain'
                                    }}
                                    onError={(event) => {
                                        event.currentTarget.style.display = 'none';

                                        const fallback =
                                            event.currentTarget.nextSibling;

                                        if (fallback) {
                                            fallback.style.display = 'flex';
                                        }
                                    }}
                                />

                                <span
                                    style={{
                                        display: 'none',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: '100%',
                                        height: '100%',
                                        fontSize: '23px'
                                    }}
                                >
                                    {config.icon}
                                </span>
                            </>

                        ) : (

                            <span style={{ fontSize: '24px' }}>
                                {config.icon}
                            </span>

                        )}

                    </div>

                    {/* NOM DU COMPTE */}
                    <h6
                        className="mb-2 text-uppercase fw-bold"
                        style={{
                            fontSize: '0.82rem',
                            opacity: 0.9,
                            letterSpacing: '0.4px'
                        }}
                    >
                        {config.title}
                    </h6>

                    {/* SOLDE */}
                    <h4
                        className="fw-bold mb-0"
                        style={{
                            fontSize: '1.55rem',
                            letterSpacing: '-0.5px',
                            overflowWrap: 'anywhere'
                        }}
                    >
                        {formatCurrency(account.mCurrentBalance)}
                    </h4>

                </Card.Body>

            </Card>

        </Col>
    );
};

// ======================================================
// 9. HISTORIQUE DES MOUVEMENTS
// ======================================================

const MovementHistory = ({ historique }) => {

    const movements = Array.isArray(historique)
        ? historique
        : [];

    return (

        <Card
            className="border-0 shadow-sm"
            style={{
                borderRadius: '16px',
                overflow: 'hidden'
            }}
        >

            {/* EN-TÊTE */}
            <Card.Header
                className="bg-white border-bottom py-3 px-4"
            >

                <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">

                    <div>

                        <h5 className="fw-bold mb-1">
                            Historique des derniers mouvements
                        </h5>

                        <small className="text-muted">
                            Suivi des entrées et sorties de trésorerie
                        </small>

                    </div>

                    <span
                        style={{
                            backgroundColor: '#F1F5F9',
                            color: '#334155',
                            padding: '8px 16px',
                            borderRadius: '50px',
                            fontSize: '13px',
                            fontWeight: 700
                        }}
                    >
                        {movements.length} mouvement(s)
                    </span>

                </div>

            </Card.Header>

            {/* TABLEAU */}
            <Card.Body className="p-0">

                <div className="table-responsive">

                    <Table
                        hover
                        className="align-middle mb-0"
                        style={{
                            minWidth: '650px'
                        }}
                    >

                        <thead>
                            <tr
                                style={{
                                    backgroundColor: '#F8FAFC'
                                }}
                            >

                                <th className="ps-4 py-3">
                                    Date
                                </th>

                                <th className="py-3">
                                    Moyen de paiement
                                </th>

                                <th className="py-3">
                                    Description
                                </th>

                                <th className="text-end pe-4 py-3">
                                    Montant
                                </th>

                            </tr>
                        </thead>

                        <tbody>

                            {movements.length > 0 ? (

                                movements.map((movement, index) => {

                                    const accountTypeCode =
                                        movement.accountTypeCode ||
                                        movement.vcCode;

                                    const isIncoming =
                                        isIncomingMovement(movement);

                                    const amount =
                                        safeNum(movement.mAmount);

                                    return (

                                        <tr
                                            key={
                                                movement.movementId ||
                                                movement.transactionId ||
                                                `${movement.dtCreatedAt}-${index}`
                                            }
                                        >

                                            {/* DATE */}
                                            <td className="ps-4 py-3 text-nowrap">

                                                <span
                                                    style={{
                                                        fontSize: '0.88rem',
                                                        color: '#334155'
                                                    }}
                                                >
                                                    {formatDate(
                                                        movement.dtCreatedAt
                                                    )}
                                                </span>

                                            </td>

                                            {/* MOYEN DE PAIEMENT */}
                                            <td className="py-3">

                                                <AccountBadge
                                                    typeCode={accountTypeCode}
                                                    description={movement.vcDescription}
                                                />

                                            </td>

                                            {/* DESCRIPTION */}
                                            <td className="py-3">

                                                <span
                                                    className="text-muted"
                                                    style={{
                                                        fontSize: '0.88rem'
                                                    }}
                                                >
                                                    {formatDescription(
                                                        movement.vcDescription
                                                    )}
                                                </span>

                                            </td>

                                            {/* MONTANT */}
                                            <td
                                                className={`text-end pe-4 py-3 fw-bold text-nowrap ${
                                                    isIncoming
                                                        ? 'text-success'
                                                        : 'text-danger'
                                                }`}
                                            >

                                                {isIncoming ? '+' : '-'}{' '}

                                                {formatCurrency(
                                                    Math.abs(amount)
                                                )}

                                            </td>

                                        </tr>

                                    );
                                })

                            ) : (

                                <tr>

                                    <td
                                        colSpan="4"
                                        className="text-center py-5"
                                    >

                                        <div className="mb-2">
                                            <span style={{ fontSize: '32px' }}>
                                                📊
                                            </span>
                                        </div>

                                        <h6 className="fw-bold text-secondary">
                                            Aucun mouvement disponible
                                        </h6>

                                        <small className="text-muted">
                                            Les opérations financières apparaîtront ici.
                                        </small>

                                    </td>

                                </tr>

                            )}

                        </tbody>

                    </Table>

                </div>

            </Card.Body>

        </Card>

    );
};

// ======================================================
// 10. COMPOSANT PRINCIPAL
// ======================================================

const CaisseCentraleTab = ({
    caisseAdmin,
    treasuryAccounts
}) => {

    const accounts = Array.isArray(treasuryAccounts)
        ? treasuryAccounts
        : [];

    return (

        <div className="caisse-centrale-tab">

            {/* CARTES DES SOLDES */}
            <Row className="g-4 mb-4">

                {accounts.length > 0 ? (

                    accounts.map((account, index) => (

                        <TreasuryAccountCard
                            key={
                                account.treasuryAccountId ||
                                `${account.typeCode}-${index}`
                            }
                            account={account}
                        />

                    ))

                ) : (

                    <Col xs={12}>

                        <Card className="border-0 shadow-sm rounded-3">

                            <Card.Body className="text-center py-4">

                                <span style={{ fontSize: '28px' }}>
                                    💰
                                </span>

                                <p className="text-muted mb-0 mt-2">
                                    Aucun compte de trésorerie disponible.
                                </p>

                            </Card.Body>

                        </Card>

                    </Col>

                )}

            </Row>

            {/* HISTORIQUE */}
            <MovementHistory
                historique={caisseAdmin?.historique}
            />

        </div>

    );
};

export default CaisseCentraleTab;
