// scraper.js

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

// 3. Activez le plugin Stealth pour Puppeteer-Extra
puppeteer.use(StealthPlugin());

async function executerScrapingSite(urlCible, emailNotification = '', texteDeclencheurEvenement = '') {
    let navigateur;
    try {
        console.log(`Lancement du navigateur pour : ${urlCible}`);
        navigateur = await puppeteer.launch({ headless: false });
        const page = await navigateur.newPage();
        
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        console.log(`Navigation vers : ${urlCible}`);
        await page.goto(urlCible, { waitUntil: 'networkidle2', timeout: 80000 });
        await setTimeout(20000);
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
            let detailsNotification = statutBillets.details.map(t => `${t.categorie} (${t.statut || 'Disponible'}) ${t.aBoutonPlus ? '(Bouton +)' : ''}`).join(', ');
            const texteFinalEvenement = texteDeclencheurEvenement || `Places disponibles : ${detailsNotification}`; // Optionnel: Inclure les détails dans le texte par défaut
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
    } finally {
        if (navigateur) {
            await navigateur.close();
            console.log(`Mapsur fermé pour : ${urlCible}`);
        }
    }
}

// --- Exécution de l'application ---
const { urlCible, emailNotification, texteDeclencheurEvenement } = parseArguments(process.argv);

// Lance l'exécution du scraping
executerScrapingSite(urlCible, emailNotification, texteDeclencheurEvenement)
    .then(resultats => {
        console.log('\nOpération terminée.');
    })
    .catch(erreur => {
        console.error('Erreur inattendue lors de l\'exécution du scraper :', erreur);
    });