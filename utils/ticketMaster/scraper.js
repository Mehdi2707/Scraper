import dotenv from 'dotenv';
dotenv.config();

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

import { envoyerNotificationEmail } from '../emailService.js';
import { verifierDisponibiliteBillets } from './checkDisponibility.js';

puppeteer.use(StealthPlugin());

/**
 * Scrape TicketMaster pour la disponibilité des billets.
 * @param {Page} page - L'objet Page de Puppeteer déjà ouvert.
 * @param {string} urlCible - L'URL à scraper.
 * @param {string} [emailNotification=''] - L'adresse e-mail pour la notification.
 * @param {string} [CATEGORIE_CIBLE=''] - La catégorie spécifique à surveiller (vide pour toutes).
 * @returns {Promise} Les résultats du scraping pour cette URL.
 */
export async function ticketMasterScraper(page, alertData) {
    const { link: urlCible, email: emailNotification = '', categorie: CATEGORIE_CIBLE } = alertData;

    const isGenericMode = !CATEGORIE_CIBLE || CATEGORIE_CIBLE.trim() === '';

    try {
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
        } catch (e) {
            sessions = [{ value: null, text: 'Date par défaut', index: 0 }];
        }

        let evenementDetecte = false;
        let notificationEnvoyee = false;
        let statutBillets = null;

        for (const session of sessions) {

            if (session.value !== null && session.index > 0) {
                try {
                    await page.select(selecteurSessions, session.value);

                    // Attendre le rechargement partiel ou complet de la page
                    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 3000 })
                        .catch(err => {
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
                    await page.waitForSelector(selecteurBoutonChoixRapide, { visible: true, timeout: 5000 });

                    texteBoutonChoixRapide = await page.evaluate(sel => {
                        const element = document.querySelector(sel);
                        const elementSpan = element ? element.querySelector('span') : null;
                        return elementSpan ? elementSpan.innerText : '';
                    }, selecteurBoutonChoixRapide);

                    if (texteBoutonChoixRapide.includes("Choix rapide par tarif")) {
                        await page.click(selecteurBoutonChoixRapide);
                        await page.waitForSelector(selecteurListePrix, { visible: true, timeout: 5000 });
                    } else {
                        console.warn(`Le bouton "${selecteurBoutonChoixRapide}" n'a pas le texte attendu. Saut du clic.`);
                    }

                } catch (erreurBouton) {
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
                    const texteFinalEvenement = `🚨 PLACE DISPONIBLE pour ${session.text}: ${detailPlaceReservee}. ACTION REQUISE.`;
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

