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
    const selecteurBoutonPlusQuantite = '.event-ticket-qty-btn-plus';

    try {
        console.log(`Vérification de la liste des prix : "${selecteurListeDisponibilite}"...`);
        await page.waitForSelector(selecteurListeDisponibilite, { visible: true, timeout: 5000 });
        console.log("Liste des prix présente. Analyse des catégories.");

        const resultats = await page.evaluate((selArticle, selStatut, selNomCat, selBoutonPlus) => {
            const articles = Array.from(document.querySelectorAll(selArticle));
            const billetsDisponibles = [];
            const toutesCategories = [];

            articles.forEach(article => {
                const elementStatut = article.querySelector(selStatut);
                const elementNomCategorie = article.querySelector(selNomCat);
                const boutonPlus = article.querySelector(selBoutonPlus);
                const estBoutonPlusVisibleEtActif = boutonPlus && !boutonPlus.disabled && !boutonPlus.classList.contains('visibility-hidden');

                const texteStatut = elementStatut ? elementStatut.innerText.trim() : 'N/A';
                const nomCategorie = elementNomCategorie ? elementNomCategorie.innerText.trim() : 'Catégorie inconnue';

                toutesCategories.push({
                    categorie: nomCategorie,
                    statut: texteStatut,
                    aBoutonPlus: estBoutonPlusVisibleEtActif
                });

                if ((!texteStatut.includes('Épuisé') && !texteStatut.includes('Indisponible') && texteStatut !== 'N/A') || estBoutonPlusVisibleEtActif) {
                    billetsDisponibles.push({
                        categorie: nomCategorie,
                        statut: texteStatut,
                        aBoutonPlus: estBoutonPlusVisibleEtActif
                    });
                }
            });
            return { billetsDisponibles, toutesCategories };
        }, selecteurArticle, selecteurStatut, selecteurNomCategorie, selecteurBoutonPlusQuantite);

        if (resultats.billetsDisponibles.length > 0) {
            console.log("--- BILLETS DISPONIBLES DÉTECTÉS ! ---");
            resultats.billetsDisponibles.forEach(billet => {
                console.log(`Catégorie : ${billet.categorie}, Statut : ${billet.statut}, Bouton '+' présent : ${billet.aBoutonPlus ? 'Oui' : 'Non'}`);
            });
            return {
                estDisponible: true,
                details: resultats.billetsDisponibles,
                toutesCategories: resultats.toutesCategories
            };
        } else {
            console.log("Aucune place disponible détectée pour l'instant.");
            resultats.toutesCategories.forEach(cat => {
                console.log(`- ${cat.categorie}: ${cat.statut} (Bouton '+': ${cat.aBoutonPlus ? 'Oui' : 'Non'})`);
            });
            return {
                estDisponible: false,
                details: [],
                toutesCategories: resultats.toutesCategories
            };
        }

    } catch (erreur) {
        console.error(`Erreur lors de la vérification de la disponibilité des billets :`, erreur);
        return {
            estDisponible: false,
            details: [],
            erreur: erreur.message
        };
    }
}