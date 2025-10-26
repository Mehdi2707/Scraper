const SITE_CONFIGS = {
    'polyfab3d.fr': {
        selector: 'span#product-availability .text-success', 
        stockText: 'En stock',
    },
    'cultureindoor.com': {
        selector: 'button.add-to-cart[data-button-action="add-to-cart"]',
        stockText: 'Ajouter au panier', 
    },
    'irobot.fr': {
        selector: '.add-to-cart-form button', 
        stockText: 'Ajouter au panier', 
    }
};

/**
 * Scrape un site e-commerce pour la disponibilité d'un produit.
 * @param {Page} page - L'objet Page de Puppeteer.
 * @param {Object} alertData - Les données de l'alerte (link, email, id, html).
 * @returns {Promise<Object>} Les résultats du scraping (evenementDetecte, titreMail, texteMail).
 */
export async function stockScraper(page, alertData) {
    const { link: urlCible } = alertData;

    const hostname = new URL(urlCible).hostname;
    let configKey = Object.keys(SITE_CONFIGS).find(key => hostname.includes(key));

    if (!configKey) {
        console.error(`Configuration de scraping non trouvée pour l'hôte : ${hostname}`);
        return { evenementDetecte: false }; 
    }

    const config = SITE_CONFIGS[configKey];
    
    try {
        await page.goto(urlCible, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForSelector(config.selector, { timeout: 5000 }).catch(() => {});

        const estDisponible = await page.evaluate((selector, expectedText) => {
            const element = document.querySelector(selector);
            
            if (!element) return false;

            const text = element.textContent.trim().toLowerCase();

            // Logique Polyfab3D
            if (selector.includes('text-success')) {
                return text.includes(expectedText.toLowerCase());
            }

            // Logique Culture Indoor / iRobot
            if (selector.includes('add-to-cart') || selector.includes('button')) {
                const isDisabled = element.disabled || element.getAttribute('disabled') !== null;
                return !isDisabled && !text.includes('rupture') && text.includes(expectedText.toLowerCase());
            }
            
            return false;
        }, config.selector, config.stockText);


        if (estDisponible) {
            const titreMail = `${configKey} Alerte : Produit de nouveau en stock !`;
            const texteMail = `Le produit est de nouveau disponible : ${urlCible}`;

            return {
                url: urlCible,
                evenementDetecte: true,
                titreMail: titreMail, 
                texteMail: texteMail  
            };

        } else {
            return {
                url: urlCible,
                evenementDetecte: false
            };
        }

    } catch (erreur) {
        console.error(`Erreur lors du scraping de ${urlCible} :`, erreur);
        return { evenementDetecte: false }; 
    }
}