/**
 * Parse les arguments de la ligne de commande.
 * @param {Array<string>} args - Les arguments bruts de process.argv.
 * @returns {object} Un objet contenant urlCible, emailNotification, et texteDeclencheurEvenement.
 */
export function parseArguments(args) {
    const argumentsLigneCommande = args.slice(2);
    const indexUrl = argumentsLigneCommande.indexOf('--url');
    const indexEmail = argumentsLigneCommande.indexOf('--notification-email');

    let urlCible = '';
    let emailNotification = '';
    let texteDeclencheurEvenement = ''; // Garde cette variable même si non fournie

    if (indexUrl !== -1 && argumentsLigneCommande[indexUrl + 1]) {
        urlCible = argumentsLigneCommande[indexUrl + 1];
    }

    if (indexEmail !== -1 && argumentsLigneCommande[indexEmail + 1]) {
        emailNotification = argumentsLigneCommande[indexEmail + 1];
    }

    return { urlCible, emailNotification, texteDeclencheurEvenement };
}