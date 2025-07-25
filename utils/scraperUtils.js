// utils/scraperUtils.js

/**
 * Vérifie la disponibilité des billets sur la page actuelle.
 * @param {Page} page - L'objet Page de Puppeteer.
 * @returns {object} Un objet contenant l'état de disponibilité et les détails.
 */
export async function verifierDisponibiliteBillets(page) {
    const selecteurListeDisponibilite = '.session-price-list';
    const selecteurArticle = '.session-price-item';
    const selecteurStatut = '.session-price-cat-title-status';
    const selecteurNomCategorie = '.session-price-cat-title-txt';
    const selecteurPrixCategorie = '.session-price-cat-title-price';
    // Le bouton '+' est à l'intérieur de '.session-price-item-content'
    const selecteurBoutonPlusQuantite = '.session-price-item-content .event-ticket-qty-btn-plus';

    try {
        console.log(`Vérification de la liste des prix : "${selecteurListeDisponibilite}"...`);
        // Augmenté le timeout pour plus de robustesse, si la page met du temps à charger la liste
        await page.waitForSelector(selecteurListeDisponibilite, { visible: true, timeout: 10000 });
        console.log("Liste des prix présente. Analyse des catégories.");

        const resultats = await page.evaluate((selArticle, selStatut, selNomCat, selPrixCat, selBoutonPlus) => {
            const articles = Array.from(document.querySelectorAll(selArticle));
            const billetsDisponibles = [];
            const toutesCategories = [];

            articles.forEach(article => {
                const elementStatut = article.querySelector(selStatut);
                const elementNomCategorie = article.querySelector(selNomCat);
                const elementPrixCategorie = article.querySelector(selPrixCat);
                
                // IMPORTANT : Le bouton '+' n'existe que si la section '.session-price-item-content' est présente
                // Et ce sélecteur est bien conçu pour le trouver DANS la sous-structure.
                const boutonPlus = article.querySelector(selBoutonPlus); 
                
                // Correction ici : 'boutus' -> 'boutonPlus'
                const estBoutonPlusVisibleEtActif = boutonPlus && !boutonPlus.disabled && !boutonPlus.classList.contains('visibility-hidden');

                const texteStatut = elementStatut ? elementStatut.innerText.trim() : '';
                const nomCategorie = elementNomCategorie ? elementNomCategorie.innerText.trim() : 'Catégorie inconnue';
                // Utiliser textContent pour le prix pour éviter les entités HTML comme &nbsp;
                const prixCategorie = elementPrixCategorie ? elementPrixCategorie.textContent.trim() : 'N/A';

                toutesCategories.push({
                    categorie: nomCategorie,
                    statut: texteStatut,
                    prix: prixCategorie,
                    aBoutonPlus: estBoutonPlusVisibleEtActif
                });

                // LOGIQUE DE DÉTECTION DE DISPONIBILITÉ AMÉLIORÉE
                const estStatutNonEpuise = (!texteStatut.includes('Épuisé') && !texteStatut.includes('Indisponible') && texteStatut !== '');

                // Un billet est disponible si le statut n'indique pas "épuisé/indisponible" OU si un bouton '+' actif est présent.
                if (estStatutNonEpuise || estBoutonPlusVisibleEtActif) {
                    billetsDisponibles.push({
                        categorie: nomCategorie,
                        statut: texteStatut,
                        prix: prixCategorie,
                        aBoutonPlus: estBoutonPlusVisibleEtActif
                    });
                }
            });
            // S'assurer que les retours sont toujours structurés comme attendu
            return { billetsDisponibles, toutesCategories };
        }, selecteurArticle, selecteurStatut, selecteurNomCategorie, selecteurPrixCategorie, selecteurBoutonPlusQuantite); 

        // Reste du code, inchangé car il dépend de 'resultats' étant bien défini
        if (resultats.billetsDisponibles.length > 0) {
            console.log("--- BILLETS DISPONIBLES DÉTECTÉS ! ---");
            resultats.billetsDisponibles.forEach(billet => {
                console.log(`Catégorie : ${billet.categorie}, Statut : ${billet.statut}, Prix : ${billet.prix}, Bouton '+' présent : ${billet.aBoutonPlus ? 'Oui' : 'Non'}`);
            });
            return {
                estDisponible: true,
                details: resultats.billetsDisponibles,
                toutesCategories: resultats.toutesCategories
            };
        } else {
            console.log("Aucune place disponible détectée pour l'instant.");
            resultats.toutesCategories.forEach(cat => {
                console.log(`- ${cat.categorie}: ${cat.statut}, Prix : ${cat.prix}, (Bouton '+': ${cat.aBoutonPlus ? 'Oui' : 'Non'})`);
            });
            return {
                estDisponible: false,
                details: [],
                toutesCategories: resultats.toutesCategories
            };
        }

    } catch (erreur) { // Assurez-vous que la variable du catch est 'erreur'
        console.error(`Erreur lors de la vérification de la disponibilité des billets :`, erreur); // Utilisez 'erreur.message'
        return {
            estDisponible: false,
            details: [],
            // Correction ici : 'error' -> 'erreur'
            erreur: erreur.message
        };
    }
}