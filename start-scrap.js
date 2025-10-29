import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { getAlerts } from './utils/getAlerts.js';
import { envoyerNotificationEmail } from './utils/emailService.js';
import { handleLogin } from './utils/handleLogin.js'; // fonctionnalité future
import { setTimeout } from "node:timers/promises";
import { ticketMasterScraper } from './utils/ticketMaster/scraper.js';
import { levelsAutoScraper } from './utils/levelsAuto/scraper.js';
import { stockScraper } from './utils/stock/stockScraper.js';

import getConnection from './database.js';

puppeteer.use(StealthPlugin());

async function main() {
    let navigateur;
    let alerts = [];
    let shouldPause = false;

    try {
        alerts = await getAlerts();

        if (alerts.length === 0) {
            shouldPause = true;
            return;
        }

        navigateur = await puppeteer.launch({ headless: true });

        // GESTION DE LA CONNEXION - FUTUR USAGE
        // const pageConnexion = await navigateur.newPage();
        // await pageConnexion.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36');

        // if (alerts.length > 0) {
        //     console.log(`Navigation vers la première alerte (${alerts[0].link}) pour initier la connexion.`);
        //     await pageConnexion.goto(alerts[0].link, { waitUntil: 'domcontentloaded', timeout: 60000 });
        //     await handleLogin(pageConnexion); // La fonction est maintenant exportée par défaut
        // }
        // await pageConnexion.close(); // Fermer la page de connexion après usage

        for (const alert of alerts) {

            if (alert.is_closed) {
                continue;
            }

            const page = await navigateur.newPage();
            await page.setViewport({ width: 1920, height: 1080 });
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');

            const alertData = {
                link: alert.link,
                email: alert.email,
                categorie: alert.categorie,
                nb_place: alert.nb_place,
                id: alert.id,
                html: alert.html
            };

            let result = { evenementDetecte: false, notificationEnvoyee: false };
            const link = alert.link.toLowerCase();

            if (link.includes('ticketmaster.fr')) {
                result = await ticketMasterScraper(page, alertData);
            } else if (link.includes('levelsautomobile.fr')) {
                result = await levelsAutoScraper(page, alertData);
            } else if (link.includes('cultureindoor.com') || link.includes('irobot.fr') || link.includes('polyfab3d.fr')) {
                result = await stockScraper(page, alertData);
            } else if (!alert.is_accessible) {
                result = await ticketMasterScraper(page, alertData);
            } else {
                result = await levelsAutoScraper(page, alertData);
            }

            if (result.evenementDetecte && alertData.email) {
                const titre = result.titreMail || 'Alerte Scraper : Événement détecté';
                const texte = result.texteMail || `Un événement a été détecté sur la page surveillée : ${alertData.link}`;

                try {
                    await envoyerNotificationEmail(alertData.email, result.url || alertData.link, texte, titre);
                    result.notificationEnvoyee = true;
                    console.log(`✅ Notification de DISPONIBILITÉ envoyée pour l'alerte: ${alert.id}.`);
                } catch (mailError) {
                    console.error(`Erreur lors de l'envoi de mail centralisé pour l'alerte ${alert.id}:`, mailError.message);
                }
            }

            if (alert.close_alert) {
                if (result.notificationEnvoyee && alert.id) {
                    let connection;
                    try {
                        connection = await getConnection();
                        await connection.execute('UPDATE alerts SET is_closed = 1 WHERE id = ?', [alert.id]);
                    } catch (dbError) {
                        console.error(`Erreur lors de la mise à jour de la DB pour l'alerte ${alert.id}:`, dbError.message);
                    } finally {
                        if (connection) await connection.end();
                    }
                }
            }

            await page.close();
        }

    } catch (error) {
        console.error('Erreur inattendue lors de l\'exécution du scraper :', error);
    } finally {
        if (navigateur) {
            await navigateur.close();
        }

        if (shouldPause) {
            await setTimeout(20000);
        }
    }
}

async function startMonitoring() {
    while (true) {
        await main(); 
    }
}

startMonitoring().catch(err => {
    console.error("Erreur fatale de l'application (hors cycle) :", err);
    process.exit(1);
});