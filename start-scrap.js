import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { getAlerts } from './utils/getAlerts.js';
import { handleLogin } from './utils/handleLogin.js'; // fonctionnalité future
import { setTimeout } from "node:timers/promises";
import { scrapeSingleUrl } from './scraper.js';

import getConnection from './database.js';

puppeteer.use(StealthPlugin());

// 20 secondes entre chaque cycle de scraping (temps de traitement inclus)
const DELAI_ENTRE_CYCLES = 20000;
const DELAI_ENTRE_CYCLES_SECONDS = DELAI_ENTRE_CYCLES / 1000;

async function main() {
    let navigateur;
    try {
        let alerts = await getAlerts();

        // TODO: Attention surveillance permanente interrompue si pas d'alertes en DB
        if (alerts.length === 0) {
            console.log("Aucune alerte à scraper dans la base de données. Fin du processus.");
            return;
        }

        console.log(`Lancement du navigateur pour ${alerts.length} alerte(s).`);
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

        while (true) {
            const tempsDebut = Date.now();
            alerts = await getAlerts();
            
            if (alerts.length === 0) {
                 console.log("Aucune alerte à scraper dans la base de données. Pause.");
                 await setTimeout(DELAI_ENTRE_CYCLES);
                 continue;
            }

            for (const alert of alerts) {
                console.log(`\n--- Début du traitement pour l'alerte ID: ${alert.id || 'N/A'} (URL: ${alert.link}, Catégorie: ${alert.categorie}) ---`);
                
                if (alert.is_closed) { 
                     console.log(`Alerte ${alert.id} ignorée : déjà marquée comme traitée (is_closed = 1).`);
                     continue;
                }

                const page = await navigateur.newPage(); 
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36');
                
                const alertData = {
                    link: alert.link,
                    email: alert.email, 
                    trigger_text: alert.trigger_text, 
                    categorie: alert.categorie, 
                    id: alert.id 
                };

                const result = await scrapeSingleUrl(page, alertData);
                
                if (alert.close_alert) {
                    if (result.notificationEnvoyee && alert.id) {
                        console.log(`Notification envoyée pour l'alerte ${alert.id}. Marquage de l'alerte comme 'is_closed = 1' en DB.`);
                        let connection;
                        try {
                            connection = await getConnection(); 
                            await connection.execute('UPDATE alerts SET is_closed = 1 WHERE id = ?', [alert.id]);
                            console.log(`Alerte ${alert.id} mise à jour en DB.`);
                        } catch (dbError) {
                            console.error(`Erreur lors de la mise à jour de la DB pour l'alerte ${alert.id}:`, dbError.message);
                        } finally {
                            if (connection) await connection.end();
                        }
                    }
                }

                await page.close();
            }

            const tempsFin = Date.now();
            const tempsEcoule = tempsFin - tempsDebut;
            const tempsRestant = DELAI_ENTRE_CYCLES - tempsEcoule;

            if (tempsRestant > 0) {
                console.log(`Cycle terminé en ${tempsEcoule / 1000}s. Mise en pause pendant ${tempsRestant / 1000}s...`);
                await setTimeout(tempsRestant);
            } else {
                console.warn(`Le cycle de scraping a pris trop de temps (${tempsEcoule / 1000}s) et a dépassé l'intervalle de ${DELAI_ENTRE_CYCLES_SECONDS} secondes!`);            }
        }
    } catch (error) {
        console.error('Erreur inattendue lors de l\'exécution du scraper :', error);

        if (navigateur) {
            try {
                await navigateur.close();
                navigateur = null;
            } catch (e) {
                console.error("Erreur lors de la fermeture du navigateur après l'échec initial:", e.message);
            }
        }

        await setTimeout(30000);
        main();
    } finally {
        if (navigateur) {
            await navigateur.close();
            console.log('Navigateur fermé.');
        }
    }
}

main().catch(console.error);