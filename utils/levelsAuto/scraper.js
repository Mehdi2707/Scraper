import { JSDOM } from 'jsdom';
import getConnection from '../../database.js';

const SELECTEUR_CONTENEUR_VEHICULES = '.neocatalog-products.clearfix.grid';
const SELECTEUR_VEHICULE = '.column';

/**
 * Extrait les liens uniques et les titres des véhicules à partir du HTML.
 * @param {string} htmlContent - Le contenu HTML brut du conteneur de véhicules.
 * @returns {Set<string>} Un Set de chaînes de caractères représentant chaque véhicule (lien unique).
 */
function extraireVehicules(htmlContent) {
    if (!htmlContent) return new Set();

    try {
        const dom = new JSDOM(htmlContent);
        const productElements = dom.window.document.querySelectorAll(SELECTEUR_VEHICULE);
        const vehiculesSet = new Set();
        const baseUrl = 'https://www.levelsautomobile.fr';

        productElements.forEach(column => {
            const product = column.querySelector('.product');
            if (product) {
                const linkElement = product.querySelector('.details h2 a');
                const priceElement = product.querySelector('.price');

                // Ignorer les produits marqués comme "Vendu"
                if (priceElement && priceElement.querySelector('.patch-soldout')) {
                    return; 
                }

                if (linkElement) {
                    const href = linkElement.getAttribute('href');
                    const title = linkElement.getAttribute('title') || 'Véhicule sans titre';
                    
                    if (href) {
                        vehiculesSet.add(`${baseUrl}${href}|${title}`);
                    }
                }
            }
        });
        return vehiculesSet;
    } catch (e) {
        console.error("Erreur lors de l'extraction des véhicules:", e.message);
        return new Set();
    }
}


/**
 * Scrape LevelsAutomobile pour de nouveaux véhicules.
 * @param {Page} page - L'objet Page de Puppeteer déjà ouvert.
 * @param {Object} alertData - Les données de l'alerte.
 * @returns {Promise<Object>} Les résultats du scraping.
 */
export async function levelsAutoScraper(page, alertData) {
    const { link: urlCible, id: alertId, html: htmlAncien } = alertData;

    let connection;
    
    try {
        await page.goto(urlCible, { waitUntil: 'domcontentloaded', timeout: 60000 }); 

        await page.waitForSelector(SELECTEUR_CONTENEUR_VEHICULES, { timeout: 10000 });

        const htmlNouveau = await page.evaluate((sel) => {
            const element = document.querySelector(sel);
            return element ? element.innerHTML : '';
        }, SELECTEUR_CONTENEUR_VEHICULES);

        if (!htmlAncien) {            
            connection = await getConnection();
            await connection.execute('UPDATE alerts SET html = ? WHERE id = ?', [htmlNouveau, alertId]);

            return {
                url: urlCible,
                evenementDetecte: false
            };

        } else if (htmlAncien.trim() !== htmlNouveau.trim()) {
            const vehiculesAnciens = extraireVehicules(htmlAncien);
            const vehiculesNouveaux = extraireVehicules(htmlNouveau);

            const nouveauxVehicules = [...vehiculesNouveaux].filter(vehicule => !vehiculesAnciens.has(vehicule));

            if (nouveauxVehicules.length > 0) {
                notificationEnvoyee = true;

                const [urlRelative, titre] = nouveauxVehicules[0].split('|');
                const urlComplete = urlRelative;
                
                const titreMail = `LevelsAuto Alerte : Nouveau véhicule - ${titre}`;
                const texteMail = `Un nouveau véhicule a été détecté :\n\n- ${titre}\n\nLien de l'annonce: ${urlComplete}\n\nConsultez le site pour plus de détails.`;
                
                connection = await getConnection();
                await connection.execute('UPDATE alerts SET html = ? WHERE id = ?', [htmlNouveau, alertId]);

                return {
                    url: urlCible,
                    evenementDetecte: true,
                    titreMail: titreMail,
                    texteMail: texteMail
                };

            } else {                
                connection = await getConnection();
                await connection.execute('UPDATE alerts SET html = ? WHERE id = ?', [htmlNouveau, alertId]);
            }
        }

        return {
            url: urlCible,
            evenementDetecte: false
        };

    } catch (erreur) {
        console.error(`Erreur lors du scraping de ${urlCible} :`, erreur);
        throw erreur;
    } finally {
        if (connection) await connection.end();
    }
}