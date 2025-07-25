// 1. Importez et configurez dotenv en premier
import dotenv from 'dotenv';
dotenv.config(); // Charge les variables d'environnement de votre fichier .env

// 2. Ensuite, importez les autres modules
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import { setTimeout } from "node:timers/promises"; // Pour la fonction sommeil (sleep)

// Importez vos fonctions depuis les fichiers utilitaires
import { envoyerNotificationEmail } from './utils/emailService.js';
import { verifierDisponibiliteBillets } from './utils/scraperUtils.js';
import { parseArguments } from './utils/argsParser.js';
import { getAlerts } from './utils/getAlerts.js';

// 3. Activez le plugin Stealth pour Puppeteer-Extra
puppeteer.use(StealthPlugin());

/**
 * Scrape une seule URL et gère la logique de détection/notification.
 * Cette fonction ne gère PAS le lancement/fermeture du navigateur ou de la page.
 * @param {Page} page - L'objet Page de Puppeteer déjà ouvert.
 * @param {string} urlCible - L'URL à scraper.
 * @param {string} [emailNotification=''] - L'adresse e-mail pour la notification.
 * @param {string} [texteDeclencheurEvenement=''] - Le texte de l'événement déclencheur.
 * @returns {Promise<object>} Les résultats du scraping pour cette URL.
 */
async function scrapeSingleUrl(page, urlCible, emailNotification = '', texteDeclencheurEvenement = '') {
    try {
        console.log(`Navigation vers : ${urlCible}`);
        await page.goto(urlCible, { waitUntil: 'networkidle2', timeout: 80000 });
        //await setTimeout(20000); // Attendre un peu après le chargement initial

        const selecteurBoutonChoixRapide = '.event-choice-map-fast-btn';
        const selecteurListePrix = '.session-price-list';

        let listeEstDejaVisible = false;
        try {
            console.log(`Vérification si la liste des prix est déjà visible : "${selecteurListePrix}"...`);
            await page.waitForSelector(selecteurListePrix, { visible: true, timeout: 5000 });
            console.log("La liste des prix est déjà visible. Pas besoin de cliquer sur le bouton.");
            listeEstDejaVisible = true;
        } catch (erreur) {
            console.log("La liste des prix n'est pas directement visible. Tentative de clic sur le bouton 'Choix rapide par tarif'.");
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
        }

        console.log("\nDébut de la vérification de la disponibilité des places...");
        const statutBillets = await verifierDisponibiliteBillets(page);
        let evenementDetecte = statutBillets.estDisponible;

        if (evenementDetecte && emailNotification) {
            let detailsNotification = statutBillets.details.map(t => `${t.categorie} (${t.statut || 'Disponible'}) ${t.prix}`).join(', ');
            const texteFinalEvenement = texteDeclencheurEvenement || `Places disponibles : ${detailsNotification}`;
            await envoyerNotificationEmail(emailNotification, urlCible, texteFinalEvenement);
        }

        const dossierCaptures = './screenshots';
        if (!fs.existsSync(dossierCaptures)) {
            fs.mkdirSync(dossierCaptures);
        }
        const cheminCapture = path.join(dossierCaptures, `${new URL(urlCible).hostname.replace(/[^a-z0-9]/gi, '_')}-${Date.now()}.png`);
        await page.screenshot({ path: cheminCapture, fullPage: true });
        console.log(`Capture d'écran sauvegardée ici : ${cheminCapture}`);

        console.log('\n--- Résultats du Scraping ---');
        console.log(`URL Scrape : ${urlCible}`);
        console.log(`Événement détecté (places disponibles) : ${evenementDetecte ? 'Oui' : 'Non'}`);
        if (statutBillets.toutesCategories) {
            console.log('Statuts de toutes les catégories :');
            statutBillets.toutesCategories.forEach(cat => console.log(`- ${cat.categorie}: ${cat.statut} (Bouton '+': ${cat.aBoutonPlus ? 'Oui' : 'Non'})`));
        }

        return {
            url: urlCible,
            evenementDetecte: evenementDetecte,
            billetsDisponibles: statutBillets.details,
            captureEcran: cheminCapture
        };

    } catch (erreur) {
        console.error(`Erreur lors du scraping de ${urlCible} :`, erreur);
        return {
            url: urlCible,
            erreur: erreur.message
        };
    }
}

// --- Fonction principale d'exécution ---
async function main() {
    let navigateur;
    try {
        // 1. Parse les arguments de la ligne de commande
        const { urlCible: cmdLineUrl, emailNotification: cmdLineEmail, texteDeclencheurEvenement: cmdLineTriggerText } = parseArguments(process.argv);

        // 2. Récupère les alertes depuis la base de données
        let alerts = await getAlerts();

        // 3. Gère l'URL de la ligne de commande : l'ajoute si fournie et non déjà dans la DB
        if (cmdLineUrl) {
            const isUrlAlreadyInDb = alerts.some(alert => alert.link === cmdLineUrl);
            if (!isUrlAlreadyInDb) {
                console.log(`Ajout de l'URL de la ligne de commande (${cmdLineUrl}) à la liste des alertes à scraper.`);
                // Crée un objet alerte temporaire pour l'URL de la ligne de commande
                alerts.push({ 
                    id: 'cmd-line-override', 
                    link: cmdLineUrl, 
                    email: cmdLineEmail, 
                    trigger_text: cmdLineTriggerText 
                });
            } else {
                console.log(`L'URL de la ligne de commande (${cmdLineUrl}) est déjà présente dans la base de données. Elle sera traitée comme une alerte DB.`);
            }
        }

        if (alerts.length === 0) {
            console.log("Aucune alerte à scraper (ni via base de données, ni via ligne de commande).");
            return; // Quitte si rien à scraper
        }

        console.log(`Lancement du navigateur pour ${alerts.length} alerte(s).`);
        navigateur = await puppeteer.launch({ headless: false }); // Lance le navigateur une seule fois

        // 4. Boucle sur toutes les alertes (DB + ligne de commande si ajoutée)
        for (const alert of alerts) {
            console.log(`\n--- Début du traitement pour l'alerte ID: ${alert.id || 'N/A'} (URL: ${alert.link}) ---`);
            const page = await navigateur.newPage(); // Ouvre une nouvelle page pour chaque alerte
            
            // Utilise les informations spécifiques à l'alerte, ou les valeurs de la ligne de commande si non définies dans l'alerte
            const currentEmail = alert.email || cmdLineEmail;
            const currentTriggerText = alert.trigger_text || cmdLineTriggerText;

            const result = await scrapeSingleUrl(page, alert.link, currentEmail, currentTriggerText);
            
            // Ici, vous pouvez ajouter une logique pour mettre à jour la base de données
            // par exemple, marquer l'alerte comme 'accessible' ou 'fermée' si un événement est détecté
            // ou si une erreur persistante se produit.
            // if (result.evenementDetecte && alert.id !== 'cmd-line-override') {
            //     // Exemple: Mettre à jour l'alerte dans la base de données
            //     // const connection = await getConnection(); // Obtenir une nouvelle connexion
            //     // await connection.execute('UPDATE alerts SET is_accessible = 1 WHERE id = ?', [alert.id]);
            //     // await connection.end();
            //     // console.log(`Alerte ${alert.id} mise à jour dans la DB: événement détecté.`);
            // }

            await page.close(); // Ferme la page après le scraping
            await setTimeout(5000); // Pause entre chaque alerte pour éviter d'être bloqué
        }

    } catch (error) {
        console.error('Erreur inattendue lors de l\'exécution du scraper :', error);
    } finally {
        if (navigateur) {
            await navigateur.close();
            console.log('Navigateur fermé.');
        }
    }
}

// Lance la fonction principale
main().catch(console.error);