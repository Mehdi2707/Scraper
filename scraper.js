import dotenv from 'dotenv';
dotenv.config();

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

import { envoyerNotificationEmail } from './utils/emailService.js';
import { verifierDisponibiliteBillets } from './utils/checkDisponibility.js';

puppeteer.use(StealthPlugin());

/**
 * Scrape une seule URL et gère la logique de détection/notification.
 * Cette fonction ne gère PAS le lancement/fermeture du navigateur ou de la page.
 * @param {Page} page - L'objet Page de Puppeteer déjà ouvert.
 * @param {string} urlCible - L'URL à scraper.
 * @param {string} [emailNotification=''] - L'adresse e-mail pour la notification.
 * @param {string} [texteDeclencheurEvenement=''] - Le texte de l'événement déclencheur.
 * @param {string} [CATEGORIE_CIBLE=''] - La catégorie spécifique à surveiller (vide pour toutes).
 * @returns {Promise} Les résultats du scraping pour cette URL.
 */
export async function scrapeSingleUrl(page, alertData) {
    const { link: urlCible, email: emailNotification = '', trigger_text: texteDeclencheurEvenement = '', categorie: CATEGORIE_CIBLE } = alertData;
    
    const isGenericMode = !CATEGORIE_CIBLE || CATEGORIE_CIBLE.trim() === '';

    try {
        if (isGenericMode) {
            console.log(`Alerte ${alertData.id}: La colonne 'categorie' est vide. Passage en mode de détection générique (toutes catégories).`);
        } else {
            console.log(`Alerte ${alertData.id}: Recherche ciblée de la catégorie : ${CATEGORIE_CIBLE}`);
        }

        console.log(`Navigation vers : ${urlCible}`);
        await page.goto(urlCible, { waitUntil: 'networkidle2', timeout: 80000 });

        const selecteurSessions = '#sessionsSelect';
        
        // Si on a plusieurs dates vérifier pour chaque date
        let sessions = [];
        try {
            await page.waitForSelector(selecteurSessions, { timeout: 5000 });
            sessions = await page.evaluate((sel) => {
                const selectElement = document.querySelector(sel);
                if (!selectElement) return [];
                
                return Array.from(selectElement.options).map((option, index) => ({
                    value: option.value,
                    text: option.textContent.trim().replace(/\s{2,}/g, ' '),
                    index: index
                }));
            }, selecteurSessions);
            console.log(`Sélectionneur de session trouvé. ${sessions.length} sessions disponibles.`);
        } catch (e) {
            console.log("Aucun sélecteur de session (#sessionsSelect) trouvé ou chargé. Poursuite avec l'URL initiale.");
            sessions = [{ value: null, text: 'Date par défaut', index: 0 }];
        }
        
        let evenementDetecte = false;
        let notificationEnvoyee = false;
        let statutBillets = null;

        for (const session of sessions) {
            
            console.log(`\n--- VÉRIFICATION DE LA SESSION : ${session.text} ---`);

            if (session.value !== null && session.index > 0) {
                try {
                    console.log(`Changement de session vers l'index ${session.index}...`);
                    await page.select(selecteurSessions, session.value);
                    
                    // Attendre le rechargement partiel ou complet de la page
                    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 3000 })
                        .catch(err => {
                            console.log("Navigation possiblement partielle après le changement de session ou timeout :", err.message);
                            // On continue même en cas de timeout pour tenter le scraping
                        });
                    
                } catch (err) {
                    console.error(`Erreur lors du changement vers la session ${session.text}:`, err.message);
                    continue;
                }
            }
            
            const selecteurBoutonChoixRapide = '.event-choice-map-fast-btn';
            const selecteurListePrix = '.session-price-list';

            let listeEstDejaVisible = false;
            try {
                 await page.waitForSelector(selecteurListePrix, { visible: true, timeout: 5000 });
                 listeEstDejaVisible = true;
            } catch (erreur) {
                 listeEstDejaVisible = false;
            }

            if (!listeEstDejaVisible) {
                let texteBoutonChoixRapide = '';
                try {
                    console.log(`Attente du bouton "Choix rapide par tarif" : "${selecteurBoutonChoixRapide}"...`);
                    await page.waitForSelector(selecteurBoutonChoixRapide, { visible: true, timeout: 5000 });
                    console.log("Bouton 'Choix rapide par tarif' détecté.");

                    texteBoutonChoixRapide = await page.evaluate(sel => {
                        const element = document.querySelector(sel);
                        const elementSpan = element ? element.querySelector('span') : null;
                        return elementSpan ? elementSpan.innerText : '';
                    }, selecteurBoutonChoixRapide);
                    
                    console.log(`Texte trouvé dans le bouton : "${texteBoutonChoixRapide}"`);

                    if (texteBoutonChoixRapide.includes("Choix rapide par tarif")) { 
                        console.log(`Tentative de clic sur le bouton : "${selecteurBoutonChoixRapide}"...`);
                        await page.click(selecteurBoutonChoixRapide);
                        console.log("Clic effectué sur 'Choix rapide par tarif'. Attente de la liste des prix...");
                        await page.waitForSelector(selecteurListePrix, { visible: true, timeout: 5000 });
                        console.log("Liste des prix apparue après le clic.");
                    } else {
                        console.warn(`Le bouton "${selecteurBoutonChoixRapide}" n'a pas le texte attendu. Saut du clic.`);
                    }

                } catch (erreurBouton) {
                    console.error(`Erreur critique : Le bouton "${selecteurBoutonChoixRapide}" n'a pas été trouvé ou cliqué. Impossible de continuer. Erreur: ${erreurBouton.message}`);
                    throw new Error(`Impossible d'afficher la liste des prix : ${erreurBouton.message}`);
                }

                try {
                    await page.waitForSelector(selecteurBoutonChoixRapide, { visible: true, timeout: 5000 });
                    const texteBoutonChoixRapide = await page.evaluate(sel => {
                        const element = document.querySelector(sel);
                        const elementSpan = element ? element.querySelector('span') : null;
                        return elementSpan ? elementSpan.innerText : '';
                    }, selecteurBoutonChoixRapide);
                    
                    if (texteBoutonChoixRapide.includes("Choix rapide par tarif")) { 
                        await page.click(selecteurBoutonChoixRapide);
                        await page.waitForSelector(selecteurListePrix, { visible: true, timeout: 5000 });
                    }
                } catch (erreurBouton) {
                    console.warn(`Liste des prix non accessible pour la session ${session.text}. (Erreur: ${erreurBouton.message})`);
                    continue;
                }
            }

            statutBillets = await verifierDisponibiliteBillets(page); 
            
            let placeDisponible = false;
            let categorieDetectee = null;
            
            if (isGenericMode) {
                const premierBilletDisponible = statutBillets.details.find(cat => cat.aBoutonPlus);
                if (premierBilletDisponible) {
                    placeDisponible = true;
                    categorieDetectee = premierBilletDisponible;
                }
            } else {
                const categorieCibleTrouvee = statutBillets.details.find(cat => cat.categorie === CATEGORIE_CIBLE);
                if (categorieCibleTrouvee && categorieCibleTrouvee.aBoutonPlus) {
                    placeDisponible = true;
                    categorieDetectee = categorieCibleTrouvee;
                }
            }
            
            if (placeDisponible) {
                evenementDetecte = true;

                if (emailNotification) {
                    const detailPlaceReservee = categorieDetectee ? 
                        `${categorieDetectee.categorie} (${categorieDetectee.statut}) ${categorieDetectee.prix || 'Prix non affiché'}` : 
                        'Place disponible détectée !';
                        
                    const titreCat = isGenericMode ? 'Catégorie Générique' : CATEGORIE_CIBLE;
                    const texteFinalEvenement = texteDeclencheurEvenement || `🚨 PLACE DISPONIBLE pour ${session.text}: ${detailPlaceReservee}. ACTION REQUISE.`;
                    const titreMail = `Ticketmaster Alerte : Place Disponible pour ${titreCat} (${session.text})`;

                    await envoyerNotificationEmail(emailNotification, page.url(), texteFinalEvenement, titreMail);
                    console.log(`✅ Notification de DISPONIBILITÉ envoyée pour la session: ${session.text}.`);
                    notificationEnvoyee = true;

                    return {
                        url: urlCible,
                        evenementDetecte: true,
                        notificationEnvoyee: true,
                        categorieCible: isGenericMode ? categorieDetectee.categorie : CATEGORIE_CIBLE,
                        sessionTrouvee: session.text
                    };
                }
            } else {
                const categorieLog = isGenericMode ? 'Générique' : CATEGORIE_CIBLE;
                console.log(`Surveillance : Aucune place disponible pour la recherche ${categorieLog} sur la session ${session.text}.`);
            }
            
        }

        return {
            url: urlCible,
            evenementDetecte: evenementDetecte,
            notificationEnvoyee: notificationEnvoyee,
            billetsDisponibles: statutBillets ? statutBillets.details : []
        };

    } catch (erreur) {
        console.error(`Erreur lors du scraping de ${urlCible} :`, erreur);
        return {
            url: urlCible,
            erreur: erreur.message
        };
    }
}

