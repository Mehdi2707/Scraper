/**
 * Vérifie la disponibilité des billets sur la page actuelle.
 * @param {Page} page - L'objet Page de Puppeteer.
 * @param {string} categorieSpecifique - Catégorie à tester (optionnel)
 * @param {number} nbPlacesRequises - Nombre de places requis (optionnel)
 * @returns {object} Un objet contenant l'état de disponibilité et les détails.
 */
export async function verifierDisponibiliteBillets(page, categorieSpecifique = null, nbPlacesRequises = null) {
    const selecteurListeDisponibilite = '.session-price-list';
    const selecteurArticle = '.session-price-item';
    const selecteurStatut = '.session-price-cat-title-status';
    const selecteurNomCategorie = '.session-price-cat-title-txt';
    const selecteurPrixCategorie = '.session-price-cat-title-price';
    const selecteurBoutonPlusQuantite = '.session-price-item-content .event-ticket-qty-btn-plus';
    const selecteurBoutonMoinsQuantite = '.session-price-item-content .event-ticket-qty-btn-minus';
    const selecteurQuantiteAffichee = '.event-ticket-qty-num';

    try {
        await page.waitForSelector(selecteurListeDisponibilite, { visible: true, timeout: 10000 });

        const toutesCategories = await page.evaluate((selArticle, selStatut, selNomCat, selPrixCat, selBoutonPlus) => {
            const articles = Array.from(document.querySelectorAll(selArticle));
            const categories = [];

            articles.forEach(article => {
                const elementStatut = article.querySelector(selStatut);
                const elementNomCategorie = article.querySelector(selNomCat);
                const elementPrixCategorie = article.querySelector(selPrixCat);
                const boutonPlus = article.querySelector(selBoutonPlus);
                
                const estBoutonPlusVisibleEtActif = boutonPlus && !boutonPlus.disabled && !boutonPlus.classList.contains('visibility-hidden');

                const texteStatut = elementStatut ? elementStatut.innerText.trim() : '';
                const nomCategorie = elementNomCategorie ? elementNomCategorie.innerText.trim() : 'Catégorie inconnue';
                const prixCategorie = elementPrixCategorie ? elementPrixCategorie.textContent.trim() : 'N/A';

                categories.push({
                    categorie: nomCategorie,
                    statut: texteStatut,
                    prix: prixCategorie,
                    aBoutonPlus: estBoutonPlusVisibleEtActif,
                    nbPlacesDisponibles: 0
                });
            });

            return categories;
        }, selecteurArticle, selecteurStatut, selecteurNomCategorie, selecteurPrixCategorie, selecteurBoutonPlusQuantite);

        if (categorieSpecifique && nbPlacesRequises && nbPlacesRequises > 1) {
            const categorieIndex = toutesCategories.findIndex(cat => cat.categorie === categorieSpecifique);
            
            if (categorieIndex !== -1 && toutesCategories[categorieIndex].aBoutonPlus) {
                const nbPlaces = await testerNombrePlacesDisponibles(
                    page, 
                    categorieIndex, 
                    nbPlacesRequises,
                    selecteurArticle,
                    selecteurBoutonPlusQuantite,
                    selecteurBoutonMoinsQuantite,
                    selecteurQuantiteAffichee
                );
                toutesCategories[categorieIndex].nbPlacesDisponibles = nbPlaces;
            }
        } else if (!categorieSpecifique && nbPlacesRequises && nbPlacesRequises > 1) {
            // Mode générique : tester toutes les catégories jusqu'à trouver celle qui a assez de places
            for (let i = 0; i < toutesCategories.length; i++) {
                if (toutesCategories[i].aBoutonPlus) {
                    const nbPlaces = await testerNombrePlacesDisponibles(
                        page, 
                        i, 
                        nbPlacesRequises,
                        selecteurArticle,
                        selecteurBoutonPlusQuantite,
                        selecteurBoutonMoinsQuantite,
                        selecteurQuantiteAffichee
                    );
                    toutesCategories[i].nbPlacesDisponibles = nbPlaces;
                    
                    // Si on a trouvé assez de places, on peut s'arrêter en mode générique
                    if (nbPlaces >= nbPlacesRequises) {
                        break;
                    }
                }
            }
        } else {
            // Pas besoin de tester, juste vérifier si le bouton + est présent (= au moins 1 place)
            toutesCategories.forEach(cat => {
                if (cat.aBoutonPlus) {
                    cat.nbPlacesDisponibles = 1;
                }
            });
        }

        const billetsDisponibles = toutesCategories.filter(cat => {
            const estStatutNonEpuise = (!cat.statut.includes('Épuisé') && !cat.statut.includes('Indisponible') && cat.statut !== '');
            return (estStatutNonEpuise || cat.aBoutonPlus);
        });

        if (billetsDisponibles.length > 0) {
            return {
                estDisponible: true,
                details: billetsDisponibles,
                toutesCategories: toutesCategories
            };
        } else {
            return {
                estDisponible: false,
                details: [],
                toutesCategories: toutesCategories
            };
        }

    } catch (erreur) {
        console.error(`Erreur lors de la vérification de la disponibilité des billets :`, erreur.message);
        return {
            estDisponible: false,
            details: [],
            erreur: erreur.message
        };
    }
}

/**
 * Crée un délai asynchrone. Remplace page.waitForTimeout(ms).
 * @param {number} ms - Le temps d'attente en millisecondes.
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Teste le nombre de places disponibles en cliquant progressivement sur le bouton +
 * @param {Page} page - L'objet Page de Puppeteer
 * @param {number} categorieIndex - Index de la catégorie à tester
 * @param {number} nbMax - Nombre maximum à tester
 * @param {string} selecteurArticle - Sélecteur des articles
 * @param {string} selecteurBoutonPlus - Sélecteur du bouton +
 * @param {string} selecteurBoutonMoins - Sélecteur du bouton -
 * @param {string} selecteurQuantite - Sélecteur de la quantité affichée
 * @returns {Promise<number>} Le nombre de places disponibles
 */
async function testerNombrePlacesDisponibles(page, categorieIndex, nbMax, selecteurArticle, selecteurBoutonPlus, selecteurBoutonMoins, selecteurQuantite) {
    // 1. Trouver le sélecteur spécifique de l'article pour cibler les boutons
    const articleHandle = (await page.$$(selecteurArticle))[categorieIndex];
    if (!articleHandle) {
        console.error(`❌ Article de catégorie non trouvé pour l'index ${categorieIndex}`);
        return 0;
    }
    
    // Obtenir le sélecteur unique pour les boutons de cet article
    const articleSelector = await page.evaluate(el => {
        // Crée un sélecteur CSS unique basé sur les attributs de l'article
        const dataRef = el.querySelector('[data-ref]')?.getAttribute('data-ref');
        return dataRef ? `[data-ref="${dataRef}"]` : null;
    }, articleHandle);
    
    if (!articleSelector) {
        console.error("❌ Impossible de construire un sélecteur d'article unique (data-ref manquant).");
        return 0;
    }

    const selecteurPlusSpecifique = `${articleSelector} .event-ticket-qty-btn-plus`;
    const selecteurMoinsSpecifique = `${articleSelector} .event-ticket-qty-btn-minus`;

    let compteur = 0;
    let clicsEffectues = 0;
    
    try {
        // Boucler jusqu'à la quantité max demandée (nbMax)
        while (clicsEffectues < nbMax) {
            
            // 2. Vérifier si le bouton + est actif avant de cliquer (dans le contexte du navigateur)
            const estBoutonPlusActif = await page.evaluate(sel => {
                const btn = document.querySelector(sel);
                return btn && !btn.disabled && !btn.classList.contains('visibility-hidden');
            }, selecteurPlusSpecifique);

            if (!estBoutonPlusActif) {
                // Le bouton est désactivé/caché. On a atteint le maximum.
                break;
            }

            // 3. Cliquer dans le contexte de Puppeteer (le plus fiable)
            await page.click(selecteurPlusSpecifique);
            clicsEffectues++;

            // 4. Délai ou attente pour que le site réagisse après le clic
            // 💡 Le délai de 200ms est critique ici. Il peut être ajusté.
            await delay(500);
        }

        // 5. Lire le nombre final de places sélectionnées (qui représente la disponibilité)
        compteur = await page.evaluate((selArticle, catIndex, selQuantite) => {
            const articles = document.querySelectorAll(selArticle);
            if (catIndex >= articles.length) return 0;

            const article = articles[catIndex];
            const elementQuantite = article.querySelector(selQuantite);
            const quantiteTexte = elementQuantite ? elementQuantite.textContent.trim() : '0';
            return parseInt(quantiteTexte, 10) || 0;
        }, selecteurArticle, categorieIndex, selecteurQuantite);

        // 6. Remettre le compteur à 0 avec la nouvelle fonction corrigée
        if (compteur > 0) {
            await remettreCompteurAZero(page, selecteurMoinsSpecifique, compteur);
        }

        return compteur;

    } catch (erreur) {
        console.error(`❌ Erreur lors du test du nombre de places :`, erreur.message);
        // Assurez-vous de remettre à zéro même en cas d'erreur de clic
        if (clicsEffectues > 0) {
            await remettreCompteurAZero(page, selecteurMoinsSpecifique, clicsEffectues);
        }
        return 0;
    }
}

/**
 * Remet le compteur de billets à zéro en fonction du nombre de clics effectués.
 * @param {Page} page - L'objet Page de Puppeteer
 * @param {string} selecteurBoutonMoinsSpecifique - Sélecteur du bouton - spécifique à l'article
 * @param {number} clicsAnnuler - Nombre de clics à effectuer sur le bouton moins.
 */
async function remettreCompteurAZero(page, selecteurBoutonMoinsSpecifique, clicsAnnuler) {
    try {
        for (let i = 0; i < clicsAnnuler; i++) {
            await page.click(selecteurBoutonMoinsSpecifique).catch(() => { /* Ignorer si le bouton devient désactivé (quantité = 0) */ });
            await delay(500);
        }
    } catch (erreur) {
        console.error(`Erreur lors de la remise à zéro du compteur :`, erreur.message);
    }
}