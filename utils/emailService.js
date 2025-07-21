import dotenv from 'dotenv';
dotenv.config();

import nodemailer from 'nodemailer';

// Configuration de l'e-mail (récupérée des variables d'environnement)
const configEmail = {
    service: process.env.MAIL_SERVICE,
    auth: {
        user: process.env.MAIL_ADDRESS,
        pass: process.env.MAIL_PASSWORD
    }
};

const transporteur = nodemailer.createTransport(configEmail);

/**
 * Envoie une notification par e-mail.
 * @param {string} emailDestinataire - L'adresse e-mail à laquelle envoyer la notification.
 * @param {string} urlPage - L'URL de la page scrappée.
 * @param {string} texteEvenement - Le texte à inclure dans la notification (par ex. places disponibles).
 */
export async function envoyerNotificationEmail(emailDestinataire, urlPage, texteEvenement) {
    const optionsMail = {
        from: configEmail.auth.user,
        to: emailDestinataire,
        subject: `[Scraper Notifier] Événement détecté sur ${new URL(urlPage).hostname}`,
        html: `
            <p>Bonjour,</p>
            <p>Un événement a été détecté sur le site : <a href="${urlPage}">${urlPage}</a></p>
            <p>Le texte déclencheur suivant a été trouvé : <strong>"${texteEvenement}"</strong></p>
            <p>Veuillez vérifier le site pour plus de détails.</p>
            <p>Cordialement,</p>
            <p>Votre Scraper Notifier</p>
        `
    };

    try {
        console.log(`Envoi de la notification à ${emailDestinataire}...`);
        await transporteur.sendMail(optionsMail);
        console.log('Notification envoyée avec succès !');
    } catch (erreur) {
        console.error(`Erreur lors de l'envoi de la notification à ${emailDestinataire} :`, erreur);
        console.error('Veuillez vérifier votre configuration Nodemailer (configEmail) et vos identifiants.');
    }
}