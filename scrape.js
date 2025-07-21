// Importer les dépendances nécessaires
const puppeteer = require('puppeteer');
const { getConnection } = require('./database');

async function scrape() {
    // Connexion à la base
    const connection = await getConnection();

    const [alerts] = await connection.execute(
        'SELECT * FROM alerts where is_closed = 0'
    );

    // Scraping
    const browser = await puppeteer.launch({ headless: false });

    for (const alert of alerts) {
        try {
            const page = await browser.newPage();
            await page.goto(alert.link);

            const data = await page.evaluate(() => ({
                title: document.title,
                content: document.querySelector('h1')?.textContent || '',
                url: window.location.href
            }));

            // await connection.execute(
            //     'INSERT IGNORE INTO scraped_data (title, content, url) VALUES (?, ?, ?)',
            //     [data.title, data.content, data.url]
            // );

            console.log(`✅ ${data.title}`);
            await page.close();

            // Pause entre les requêtes
            await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
            console.error(`❌ Erreur pour ${alert.link}:`, error.message);
        }
    }

    await browser.close();
    await connection.end();
}

scrape().catch(console.error);