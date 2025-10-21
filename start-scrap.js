import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { getAlerts } from './utils/getAlerts.js';
import { handleLogin } from './utils/handleLogin.js'; // fonctionnalité future
import { setTimeout } from "node:timers/promises";
import { ticketMasterScraper } from './utils/ticketMaster/scraper.js';
import { levelsAutoScraper } from './utils/levelsAuto/scraper.js';

import getConnection from './database.js';

puppeteer.use(StealthPlugin());

async function main() {
    let navigateur;
    let alerts = [];
    let shouldPause = false;

    try {
        alerts = await getAlerts();

        if (alerts.length === 0) {
            console.log("Aucune alerte à scraper dans la base de données. Pause de 20sec.");
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
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');

            const alertData = {
                link: alert.link,
                email: alert.email,
                categorie: alert.categorie,
                id: alert.id,
                html: alert.html
            };

            let result;
            
            if (!alert.is_accessible) {
                result = await ticketMasterScraper(page, alertData);
            } else {
                result = await levelsAutoScraper(page, alertData);
            }

            if (alert.close_alert) {
                if (result.notificationEnvoyee && alert.id) {
                    console.log(`Notification envoyée pour l'alerte ${alert.id}. Marquage de l'alerte comme clôturée`);
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