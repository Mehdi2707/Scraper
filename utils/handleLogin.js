import dotenv from 'dotenv';
dotenv.config();

/**
 * Gère le processus de connexion à Ticketmaster si l'utilisateur n'est pas connecté.
 * @param {Page} page - L'objet Page de Puppeteer.
 * @returns {Promise} Vrai si la connexion a été tentée, faux sinon.
 */
export async function handleLogin(page) {
    const email = process.env.TM_EMAIL;
    const password = process.env.TM_PASSWORD;

    try {
        const selecteurBoutonConnexion = '.header-my-account-link';
        const selecteurChampEmail = '#login-email';
        const selecteurBoutonSoumettre = '.btn-special.btn-wide.btn-large';

        // 1. Clic sur le bouton de connexion
        console.log("Tentative de clic sur le bouton 'Se connecter'...");
        await page.waitForSelector(selecteurBoutonConnexion, { visible: true, timeout: 10000 });
        await page.click(selecteurBoutonConnexion);
        console.log("Clic effectué. Attente du formulaire de connexion...");

        // 2. Attente et saisie des identifiants
        await page.waitForSelector(selecteurChampEmail, { visible: true, timeout: 15000 });
        console.log("Formulaire de connexion chargé. Saisie des identifiants.");

        await page.type(selecteurChampEmail, email, { delay: 100 });
        await page.type('#login-password', password, { delay: 100 });

        // 3. Clic sur le bouton de soumission
        console.log("Tentative de connexion...");
        await page.click(selecteurBoutonSoumettre);
        
        // Attendre que la navigation soit terminée (peut être une redirection ou un rechargement)
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }); 
        
        // Vérification simple post-login : si l'URL est toujours la page de login, la connexion a échoué.
        const currentUrl = page.url();
        if (currentUrl.includes('/login')) {
             console.warn("ATTENTION : La connexion semble avoir échoué. Vérifiez vos identifiants ou le blocage anti-bot.");
             return false;
        }

        console.log("Connexion réussie !");
        return true;

    } catch (error) {
        console.error("Erreur lors de la tentative de connexion :", error.message);
        return false;
    }
}