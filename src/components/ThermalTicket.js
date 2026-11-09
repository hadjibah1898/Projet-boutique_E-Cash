/**
 * @file ThermalTicket.js
 * @description Composant de ticket thermique/imprimable pour les ventes.
 */

import React from 'react';

// Helper pour formater la devise de manière concise pour le ticket
const formatCurrency = (value) => {
    // Utilise un espace simple pour une meilleure compatibilité avec les polices mono-espacées
    return new Intl.NumberFormat('fr-FR').format(value) + ' FG';
};

const ThermalTicket = React.forwardRef(({ ticketData }, ref) => {
    if (!ticketData) {
        return <div ref={ref}>Aucune donnée de ticket.</div>;
    }

    const {
        shopName = 'BOUTIQUE KALOUM',
        address = 'KALOUM',
        phone = '620240948',
        email = 'roberthaba26@gmail.com',
        transactionId = 'N/A',
        date = new Date(),
        clientName = 'Client de passage',
        cashierName = 'N/A',
        items = [],
        subTotal = 0,
        discount = 0,
        pourboire = 0,
        totalNet = 0,
        amountPaid = 0,
        change = 0,
    } = { ...ticketData, discount: ticketData.discount || ticketData.itemLevelDiscount || 0 };

    return (
        <div ref={ref} className="bg-white text-black font-mono" style={{ width: '302px', padding: '10px' }}>
            {/* En-tête */}
            <div className="text-center mb-2">
                <div className="mx-auto bg-gray-200 rounded-full h-12 w-12 flex items-center justify-center text-xl font-bold mb-2">
                    JC
                </div> // Correction: Utiliser le logo de la boutique
                <h1 className="text-lg font-bold uppercase">{shopName}</h1>
                <p className="text-xs text-gray-600">{address}</p>
                <p className="text-xs text-gray-600">Tél: {phone} | Email: {email}</p>
            </div>

            <hr className="border-dashed border-black my-2" />

            {/* Informations de la transaction */}
            <div className="mb-2">
                <h2 className="text-center font-bold text-sm mb-1">TICKET DE VENTE</h2>
                <div className="text-xs">
                    <p className="m-0">Transaction #: {transactionId}</p>
                    <p className="m-0">Date: {new Date(date).toLocaleString('fr-FR')}</p>
                    <p className="m-0">Client: {clientName}</p>
                    <p className="m-0">Caissier: {cashierName}</p>
                </div>
            </div>

            <hr className="border-dashed border-black my-2" />

            {/* Tableau des articles */}
            <div>
                <table className="w-full text-xs">
                    <thead>
                        <tr className="border-b border-dashed border-black">
                            <th className="text-left pb-1 font-semibold">Article</th>
                            <th className="text-center pb-1 font-semibold">Qté</th>
                            <th className="text-right pb-1 font-semibold">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item, index) => (
                            <tr key={index} className="align-top">
                                <td className="pt-1 pr-1">
                                    {item.article.nom}
                                    <br />
                                    <span className="text-gray-600">{formatCurrency(item.prixUnitaire)}</span>
                                </td>
                                <td className="text-center pt-1">x{item.quantite}</td>
                                <td className="text-right pt-1">{formatCurrency(item.prixTotal)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <hr className="border-dashed border-black my-2" />

            {/* Totaux */}
            <div className="text-xs">
                <div className="flex justify-between"><span>Sous-total:</span><span>{formatCurrency(subTotal)}</span></div>
                <div className="flex justify-between"><span>Remise:</span><span>- {formatCurrency(discount)}</span></div>
                {pourboire > 0 && <div className="flex justify-between"><span>Pourboire Service (Service inclus):</span><span>+ {formatCurrency(pourboire)}</span></div>}
                <div className="flex justify-between font-bold text-sm my-1"><span>TOTAL NET:</span><span>{formatCurrency(totalNet)}</span></div>
                <div className="flex justify-between"><span>Montant Payé:</span><span>{formatCurrency(amountPaid)}</span></div>
                <div className="flex justify-between"><span>Reste à payer:</span><span>{formatCurrency(change)}</span></div>
            </div>

            <hr className="border-dashed border-black my-2" />

            {/* Pied de page */}
            <div className="text-center text-xs mt-2">
                <p className="font-bold">Merci pour votre confiance !</p>
                <p className="text-gray-600">{new Date().toISOString()}</p>
            </div>
        </div>
    );
});

export default ThermalTicket;