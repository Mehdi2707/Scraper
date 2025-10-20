# 🤖 Scraper d'Alertes Multi-Sites (Ticketmaster & LevelsAuto)

Ce projet est une solution de surveillance automatisée conçue pour scruter plusieurs sites web à la recherche de changements (nouvelles places, nouveaux véhicules, etc.) et envoyer des notifications par e-mail lorsqu'une alerte enregistrée en base de données est déclenchée. Il est construit sur une architecture modulaire, ce qui facilite l'ajout de nouveaux sites de scraping.

## 🚀 Fonctionnalités Clés

* **Scraping Multi-Site :** Prise en charge initiale de **Ticketmaster** (surveillance de billets/catégories) et **LevelsAuto** (surveillance de nouveaux véhicules).
* **Architecture Modulaire :** Les logiques de scraping sont isolées dans des fichiers dédiés (`utils/levelsAuto`, `utils/ticketMaster`), permettant une extensibilité facile.
* **Surveillance Permanente :** Le programme tourne en boucle, exécutant les alertes de la base de données à intervalles réguliers (20 secondes par défaut).
* **Détection Intelligente :**
    * **Ticketmaster :** Détection de la disponibilité d'une catégorie spécifique ou générique.
    * **LevelsAuto :** Détection de **nouveaux produits** par comparaison de contenu HTML stocké en DB, garantissant que seules les annonces réellement nouvelles déclenchent une notification.
* **Système d'Alertes Centralisé :** Les alertes sont gérées via une base de données (accès via `database.js`).
* **Notifications par E-mail :** Envoi d'e-mails pour chaque événement détecté.
* **Anti-Détection (Stealth) :** Utilisation de `puppeteer-extra` et du plugin `puppeteer-extra-plugin-stealth` pour minimiser le risque de blocage.

---

## 🛠️ Installation

### Prérequis

* **Node.js** (v18+)
* **Une base de données** (MySQL, MariaDB, etc.)
* **Un compte e-mail** et ses identifiants SMTP (pour l'envoi des notifications).

### Étapes

1.  **Cloner le dépôt** :
    ```bash
    git clone [URL_DE_VOTRE_DEPOT]
    cd [NOM_DU_DOSSIER]
    ```

2.  **Installer les dépendances** :
    ```bash
    npm install
    # Installation de JSDOM est nécessaire pour l'analyse HTML du scraper LevelsAuto
    npm install jsdom
    ```

3.  **Configuration de l'environnement (`.env`)** :
    Créez un fichier `.env` à la racine du projet et configurez les accès à la DB et au service d'e-mail.

    ```env
    # --- Configuration Base de Données ---
    DB_HOST=localhost
    DB_USER=root
    DB_PASSWORD=votre_mot_de_passe
    DB_NAME=votre_base_de_donnees

    # --- Configuration E-mail (SMTP) ---
    MAIL_SERVICE=gmail # ou outlook, sendgrid, etc.
    MAIL_ADDRESS=votre_email@example.com
    MAIL_PASSWORD=votre_mot_de_passe_ou_cle_api
    ```

4.  **Configuration de la Base de Données** :

    Assurez-vous que votre table `alerts` contient au moins les colonnes suivantes :

    | Colonne | Type | Rôle |
    | :--- | :--- | :--- |
    | **`id`** | INT (PK) | Identifiant de l'alerte. |
    | **`link`** | VARCHAR | URL cible du scraping. |
    | **`email`** | VARCHAR | E-mail du destinataire. |
    | **`categorie`** | VARCHAR | Catégorie/mot-clé spécifique. |
    | **`is_closed`** | BOOLEAN | `1` si l'alerte est fermée. |
    | **`is_accessible`**| BOOLEAN | **Discriminateur de Scraper :** `0` pour Ticketmaster, `1` pour LevelsAuto. |
    | **`html`** | LONGTEXT | Stocke le HTML pour comparaison (utilisé par LevelsAuto). |
    | **`close_alert`** | BOOLEAN | Indique si l'alerte doit être fermée après la première notification. |

---

## ⚙️ Utilisation

Pour lancer le service de scraping en boucle :

```bash
node start-scrap.js