import getConnection from '../database.js';

/**
 * @returns {Promise<Array>} - Une promesse qui contient un tableau d'alertes.
 * Chaque alerte est un objet contenant les détails de l'alerte.
 */
export async function getAlerts() {
    let connection;
    try {
        connection = await getConnection();

        const [alerts] = await connection.execute(
            `SELECT * FROM alerts
            WHERE is_closed = 0
            AND is_accessible = 0`
        );

        return alerts;
    } catch (error) {
        console.error('Erreur lors de la récupération des alertes :', error);
        return [];
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}