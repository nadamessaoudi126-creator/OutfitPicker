"use strict";

// ==========================================
// CONFIGURATION AZURE
// ==========================================

const API_BASE = "https://func-outfitpicker-2026-fzh9g5aza5dmbja5.belgiumcentral-01.azurewebsites.net/api";

let gardeRobe = [];
let derniereTenue = null;

// ==========================================
// OUTILS
// ==========================================

function normaliserCategorie(categorie) {
    const valeur = String(categorie || "")
        .trim()
        .toLowerCase();

    const correspondances = {
        haut: "haut",
        bas: "bas",
        pantalon: "bas",
        chaussure: "chaussures",
        chaussures: "chaussures",
        veste: "veste"
    };

    return correspondances[valeur] || valeur;
}

function urlPhoto(filename) {
    return `${API_BASE}/photo/${encodeURIComponent(filename)}`;
}

async function appelerAPI(route, options = {}) {
    const reponse = await fetch(
        `${API_BASE}/${route}`,
        options
    );

    if (!reponse.ok) {
        const message = await reponse.text();

        throw new Error(
            message || `Erreur HTTP ${reponse.status}`
        );
    }

    const contenu = await reponse.text();

    return contenu ? JSON.parse(contenu) : null;
}

// ==========================================
// RECUPERER LA GARDE-ROBE AZURE
// ==========================================

async function obtenirVetements() {
    return appelerAPI("liste-vetements");
}

// ==========================================
// AFFICHER LES VETEMENTS
// ==========================================

async function afficherVetements() {
    const liste = document.getElementById("listeVetements");

    liste.textContent = "Chargement des vêtements...";

    try {
        gardeRobe = await obtenirVetements();

        liste.replaceChildren();

        if (gardeRobe.length === 0) {
            liste.textContent = "Votre garde-robe est vide.";
            return;
        }

        gardeRobe.forEach((vetement) => {
            const card = document.createElement("div");
            card.className = "vetement-card";

            const image = document.createElement("img");
            image.src = urlPhoto(vetement.photo);
            image.alt = vetement.nom;
            image.loading = "lazy";

            const titre = document.createElement("h3");
            titre.textContent = vetement.nom;

            const description = document.createElement("p");

            description.textContent =
                `${vetement.categorie} - ${vetement.couleur} - ${vetement.style}`;

            const bouton = document.createElement("button");

            bouton.type = "button";
            bouton.textContent = "Supprimer";

            bouton.addEventListener("click", async () => {
                const confirmation = confirm(
                    `Supprimer "${vetement.nom}" ?`
                );

                if (!confirmation) {
                    return;
                }

                bouton.disabled = true;

                try {
                    await appelerAPI(
                        `supprimer-vetement/${encodeURIComponent(vetement.id)}`,
                        {
                            method: "DELETE"
                        }
                    );

                    await afficherVetements();

                    reinitialiserTenue();

                } catch (error) {
                    console.error(error);

                    alert(
                        "Impossible de supprimer le vêtement."
                    );

                    bouton.disabled = false;
                }
            });

            card.append(
                image,
                titre,
                description,
                bouton
            );

            liste.appendChild(card);
        });

    } catch (error) {
        console.error(error);

        liste.textContent =
            "Impossible de charger la garde-robe depuis Azure.";
    }
}

// ==========================================
// AJOUTER UN VETEMENT DANS AZURE
// ==========================================

async function enregistrerVetement(event) {
    event.preventDefault();

    const formulaire = event.currentTarget;

    const fichier =
        document.getElementById("photo").files[0];

    if (!fichier) {
        alert("Veuillez sélectionner une photo.");
        return;
    }

    const formats = [
        "image/jpeg",
        "image/png",
        "image/webp"
    ];

    if (!formats.includes(fichier.type)) {
        alert("Format autorisé : JPG, PNG ou WEBP.");
        return;
    }

    const bouton = formulaire.querySelector(
        'button[type="submit"]'
    );

    bouton.disabled = true;
    bouton.textContent = "Enregistrement...";

    try {

        // 1. Envoyer la photo vers Azure Blob Storage

        const formData = new FormData();

        formData.append("photo", fichier);

        const upload = await appelerAPI(
            "upload-vetement",
            {
                method: "POST",
                body: formData
            }
        );

        if (!upload || !upload.filename) {
            throw new Error(
                "Le backend n'a pas retourné le nom de la photo."
            );
        }

        // 2. Préparer les informations du vêtement

        const vetement = {
            nom: document.getElementById("nom")
                .value.trim(),

            categorie: document.getElementById("categorie")
                .value,

            couleur: document.getElementById("couleur")
                .value,

            style: document.getElementById("style")
                .value,

            photo: upload.filename
        };

        // 3. Enregistrer dans Azure Table Storage

        await appelerAPI(
            "ajouter-vetement",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify(vetement)
            }
        );

        // 4. Actualiser la garde-robe

        formulaire.reset();

        await afficherVetements();

        reinitialiserTenue();

        alert("Vêtement enregistré dans Azure !");

    } catch (error) {
        console.error(
            "Erreur d'enregistrement :",
            error
        );

        alert(
            "Erreur d'enregistrement : " + error.message
        );

    } finally {
        bouton.disabled = false;
        bouton.textContent = "Ajouter le vêtement";
    }
}

// ==========================================
// GENERER UNE TENUE AVEC L'API PYTHON
// ==========================================

async function genererTenue() {

    const evenement =
        document.getElementById("evenement").value;

    const bouton =
        document.getElementById("genererTenue");

    const boutonAutre =
        document.getElementById("autreTenue");

    bouton.disabled = true;
    boutonAutre.disabled = true;

    bouton.textContent = "Génération en cours...";

    try {

        // Appeler la fonction Azure suggestion_tenue

        const resultat = await appelerAPI(
            `suggestion-tenue?evenement=${encodeURIComponent(evenement)}`
        );

        const tenue = resultat.tenue;

        if (
            !tenue ||
            !tenue.haut ||
            !tenue.bas ||
            !tenue.chaussures
        ) {
            throw new Error("Tenue incomplète");
        }

        // Convertir la réponse JSON en tableau

        const selection = [
            tenue.haut,
            tenue.bas,
            tenue.chaussures,
            tenue.veste
        ].filter(Boolean);

        derniereTenue = selection;

        // Afficher le collage

        afficherTenue(selection);

    } catch (error) {

        console.error(
            "Erreur de génération :",
            error
        );

        afficherErreur(
            "Impossible de générer une tenue complète. " +
            "Vérifiez que vous avez un haut, un bas et " +
            "des chaussures compatibles avec cet événement."
        );

    } finally {

        bouton.disabled = false;
        boutonAutre.disabled = false;

        bouton.textContent = "Générer ma tenue";
    }
}

// ==========================================
// COLLAGE PINTEREST CLIQUABLE
// ==========================================

function afficherTenue(selection) {

    const collage =
        document.getElementById("collageTenue");

    const details =
        document.getElementById("detailsVetement");

    const boutonAutre =
        document.getElementById("autreTenue");

    collage.replaceChildren();

    details.replaceChildren();
    details.hidden = true;

    selection.forEach((vetement) => {

        const categorie = normaliserCategorie(
            vetement.categorie
        );

        // Créer un vêtement cliquable

        const bouton = document.createElement("button");

        bouton.type = "button";

        bouton.className =
            `collage-item ${categorie}`;

        bouton.title = vetement.nom;

        bouton.setAttribute(
            "aria-label",
            `Voir les détails de ${vetement.nom}`
        );

        // Récupérer la photo depuis Azure Blob Storage

        const image = document.createElement("img");

        image.src = urlPhoto(vetement.photo);
        image.alt = vetement.nom;

        bouton.appendChild(image);

        // Afficher les détails au clic

        bouton.addEventListener("click", () => {

            afficherDetailsVetement(vetement);

        });

        collage.appendChild(bouton);

    });

    boutonAutre.hidden = false;
}

// ==========================================
// DETAILS DU VETEMENT SELECTIONNE
// ==========================================

function afficherDetailsVetement(vetement) {

    const details =
        document.getElementById("detailsVetement");

    details.replaceChildren();

    const titre = document.createElement("h3");

    titre.textContent = vetement.nom;

    const categorie = document.createElement("p");

    categorie.textContent =
        `Catégorie : ${vetement.categorie}`;

    const couleur = document.createElement("p");

    couleur.textContent =
        `Couleur : ${vetement.couleur}`;

    const style = document.createElement("p");

    style.textContent =
        `Style : ${vetement.style}`;

    details.append(
        titre,
        categorie,
        couleur,
        style
    );

    details.hidden = false;
}

// ==========================================
// AFFICHER UNE ERREUR
// ==========================================

function afficherErreur(message) {

    reinitialiserTenue();

    const collage =
        document.getElementById("collageTenue");

    const paragraphe =
        document.createElement("p");

    paragraphe.textContent = message;

    paragraphe.style.padding = "25px";

    paragraphe.style.textAlign = "center";

    collage.appendChild(paragraphe);
}

// ==========================================
// REINITIALISER LA TENUE
// ==========================================

function reinitialiserTenue() {

    document.getElementById("collageTenue")
        .replaceChildren();

    const details =
        document.getElementById("detailsVetement");

    details.replaceChildren();

    details.hidden = true;

    document.getElementById("autreTenue")
        .hidden = true;

    derniereTenue = null;
}

// ==========================================
// INITIALISATION DE L'APPLICATION
// ==========================================

async function initialiserApplication() {

    document.getElementById("clothingForm")
        .addEventListener(
            "submit",
            enregistrerVetement
        );

    document.getElementById("genererTenue")
        .addEventListener(
            "click",
            genererTenue
        );

    document.getElementById("autreTenue")
        .addEventListener(
            "click",
            genererTenue
        );

    document.getElementById("evenement")
        .addEventListener(
            "change",
            reinitialiserTenue
        );

    await afficherVetements();
}

// ==========================================
// DEMARRAGE
// ==========================================

document.addEventListener(
    "DOMContentLoaded",
    initialiserApplication
);