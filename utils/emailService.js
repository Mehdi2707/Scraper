import dotenv from 'dotenv';
dotenv.config();

import nodemailer from 'nodemailer';

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
export async function envoyerNotificationEmail(emailDestinataire, urlPage, texteEvenement, titreMail) {
    const sujet = titreMail; 
    
    const contenuHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
                .header { background-color: #f4f4f4; padding: 10px; text-align: center; border-radius: 6px 6px 0 0; }
                .alert { color: #d9534f; font-weight: bold; font-size: 1.1em; margin-bottom: 15px; }
                .details { background-color: #e6f7ff; padding: 15px; border-left: 5px solid #007bff; margin-bottom: 20px; }
                .cta { text-align: center; margin-top: 25px; }
                .cta a {
                    display: inline-block;
                    padding: 10px 20px;
                    background-color: #5cb85c; 
                    color: white !important; 
                    text-decoration: none;
                    border-radius: 5px;
                    font-weight: bold;
                    font-size: 1.1em;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h2>Alerte Billetterie Ticketmaster</h2>
                </div>
                
                <p>Bonjour,</p>
                
                <p class="alert">
                    ${texteEvenement}
                </p>
                
                <div class="details">
                    <p>
                        Une place est **disponible** et correspond à vos critères de recherche.
                        <br>
                        Elle peut disparaître rapidement. Agissez vite !
                    </p>
                </div>

                <div class="cta">
                    <a href="${urlPage}" target="_blank" style="color: white;">
                        👉 Finaliser la commande maintenant 
                    </a>
                </div>
                
                <p style="margin-top: 25px; font-size: 0.9em;">
                    Lien direct vers la page : ${urlPage}
                </p>
                
                <p>Cordialement,<br>Votre Scraper Bot</p>
            </div>
        </body>
        </html>
    `;

    const optionsMail = {
        from: configEmail.auth.user,
        to: emailDestinataire,
        subject: sujet,
        html: contenuHTML
    };

    try {
        console.log(`Envoi de la notification à ${emailDestinataire} (Sujet: ${sujet})...`);
        await transporteur.sendMail(optionsMail);
        console.log('Notification envoyée avec succès !');
    } catch (erreur) {
        console.error(`Erreur lors de l'envoi de la notification à ${emailDestinataire} :`, erreur);
        console.error('Veuillez vérifier votre configuration Nodemailer (configEmail) et vos identifiants.');
    }
}