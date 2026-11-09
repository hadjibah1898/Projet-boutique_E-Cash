import { useCallback } from 'react';

/**
 * Hook personnalisé pour encapsuler la logique de calcul du prix effectif d'un article.
 * Prend en compte les remises temporaires, les promotions et les remises permanentes.
 */
export const useVenteLogic = () => {

  const getEffectivePrice = useCallback((article, remiseTemp = null, remiseType = 'montant') => {
    let price = article.prixVente;

    // 1. Remise temporaire (panier) - PRIORITÉ ABSOLUE car saisie manuellement par le gérant
    if (remiseTemp !== null && !isNaN(remiseTemp) && remiseTemp > 0) {
      return remiseType === 'pourcentage' ? Math.max(0, price * (1 - remiseTemp / 100)) : Math.max(0, price - remiseTemp);
    }

    // 2. Promo
    if (article.promoActive && article.promo > 0) {
        const now = new Date();
        const start = article.dateDebutPromo ? new Date(article.dateDebutPromo) : null;
        const end = article.dateFinPromo ? new Date(article.dateFinPromo) : null;
        if ((!start || now >= start) && (!end || now <= end)) {
            return price * (1 - article.promo / 100);
        }
    }
    // 3. Remise article (définitive)
    if (article.remise > 0) {
        return price * (1 - article.remise / 100);
    }
    return price;
  }, []); // Aucune dépendance externe, donc tableau vide

  return { getEffectivePrice };
};