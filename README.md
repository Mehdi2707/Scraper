# 🤖 Scraper Multi-Sites

Ce projet est une solution de surveillance automatisée conçue pour scruter plusieurs sites web à la recherche de changements et envoyer des notifications par e-mail lorsqu'une alerte enregistrée en base de données est déclenchée. Il est construit sur une architecture modulaire, ce qui facilite l'ajout de nouveaux sites de scraping.

## 🚀 Fonctionnalités Clés

* **Scraping Multi-Site :** Prise en charge initiale de **Ticketmaster** (surveillance de billets/catégories), **LevelsAuto** (surveillance de nouveaux véhicules) et de **Site e-commerce** (surveillance de la disponibilité).
* **Architecture Modulaire :** Les logiques de scraping sont isolées dans des fichiers dédiés (`utils/'specificScraper'`), permettant une extensibilité facile.
* **Surveillance Permanente :** Le programme tourne en boucle, exécutant les alertes de la base de données en continue.
* **Détection Intelligente :**
    * **Ticketmaster :** Détection de la disponibilité d'une catégorie spécifique ou générique (toutes catégories).
    * **LevelsAuto :** Détection de **nouveaux produits** par comparaison de contenu HTML stocké en DB, garantissant que seules les annonces réellement nouvelles déclenchent une notification.
    * **Site e-commerce :** Détection de la disponibilité d'un produit.
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
    git clone https://github.com/Mehdi2707/Scraper.git
    cd Scraper
    ```

2.  **Installer les dépendances** :
    ```bash
    npm install
    ```

3.  **Configuration de l'environnement (`.env`)** :

    Renommer le fichier `.env.example` en `.env` et configurez les accès à la DB et au service d'e-mail.

4.  **Configuration de la Base de Données** :

    Assurez-vous que votre table `alerts` contient au moins les colonnes suivantes :

    | Colonne | Type | Rôle |
    | :--- | :--- | :--- |
    | **`id`** | INT (PK) | Identifiant de l'alerte. |
    | **`link`** | VARCHAR | URL cible du scraping. |
    | **`email`** | VARCHAR | E-mail du destinataire. |
    | **`categorie`** | VARCHAR | Catégorie/mot-clé spécifique. |
    | **`is_closed`** | TINYINT | `1` si l'alerte est fermée. |
    | **`is_accessible`**| TINYINT | **Discriminateur de Scraper :** `0` pour Ticketmaster, `1` pour LevelsAuto. |
    | **`html`** | LONGTEXT | Stocke le HTML pour comparaison (utilisé par LevelsAuto). |
    | **`close_alert`** | TINYINT | Indique si l'alerte doit être fermée après la première notification. |

---

## ⚙️ Utilisation

Pour lancer le service de scraping en boucle :

```bash
node start-scrap.js
```

Vous pouvez également lancer le service en arrière plan (fichier de log à la racine du projet):

```bash
node start-scrap.js >> scraper.log 2>&1 &
```

Puis l'arrêter avec le numéro du processus :

```bash
kill -9 `[N° Process]`
```