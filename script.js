"use strict";

// ==========================================
// CONFIGURATION AZURE
// ==========================================

const API_BASE = "https://func-outfitpicker-2026-fzh9g5aza5dmbja5.belgiumcentral-01.azurewebsites.net/api";

let gardeRobe = [];
let derniereTenue = null;

// Autres tenues validées renvoyées par Gemini (affichées par « Autre tenue »)
let alternativesRestantes = [];
let modeleDerniereTenue = null;
let urlApercu = null;

// Résultat de la pré-analyse Gemini de la photo choisie (réutilisé à l'ajout)
let preAnalyse = null;
let compteurPreAnalyse = 0;

// Description visuelle des événements (les valeurs viennent du <select id="evenement">)
const DESCRIPTIONS_EVENEMENTS = {
    universite: { symbole: "U", styles: "Casual · Sportif" },
    mariage: { symbole: "M", styles: "Chic" },
    entretien: { symbole: "E", styles: "Professionnel · Chic" },
    sport: { symbole: "S", styles: "Sportif" },
    sortie: { symbole: "A", styles: "Casual · Chic" }
};

// Teintes utilisées pour les pastilles de couleur
const TEINTES = {
    blanc: "#ffffff",
    noir: "#1f1b18",
    gris: "#9a948e",
    beige: "#e6d5bd",
    marron: "#6b4a34",
    bleu: "#3b6ea8",
    "bleu-marine": "#1f2d4d",
    vert: "#4f7a52",
    kaki: "#7a7550",
    rouge: "#a8352a",
    bordeaux: "#6d1f2b",
    rose: "#e3a1b0",
    jaune: "#e5c24a",
    orange: "#e07b39",
    violet: "#6f4e8c",
    multicolore: "conic-gradient(#e5c24a, #e07b39, #a8352a, #6f4e8c, #3b6ea8, #4f7a52, #e5c24a)",
    autre: "repeating-linear-gradient(45deg, #d9d1c7 0 2px, #f6f0e8 2px 4px)",
    "non-precisee": "repeating-linear-gradient(45deg, #d9d1c7 0 2px, #f6f0e8 2px 4px)"
};

// Libellés affichés pour les couleurs (valeurs stockées sans accents)
const LIBELLES_COULEURS = {
    "bleu-marine": "Bleu marine",
    multicolore: "Multicolore / imprimé",
    "non-precisee": "Non précisée"
};

function libelleCouleur(couleur) {
    const valeur = normaliserCouleur(couleur);

    if (LIBELLES_COULEURS[valeur]) {
        return LIBELLES_COULEURS[valeur];
    }

    return valeur
        ? valeur.charAt(0).toUpperCase() + valeur.slice(1)
        : "Non précisée";
}

function normaliserCouleur(couleur) {
    return String(couleur || "").trim().toLowerCase() || "non-precisee";
}

const LIBELLES_CATEGORIES = {
    haut: "Haut",
    bas: "Bas",
    chaussures: "Chaussures",
    veste: "Veste"
};

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

function normaliser(valeur) {
    return String(valeur || "").trim().toLowerCase();
}

function urlPhoto(filename) {
    return `${API_BASE}/photo/${encodeURIComponent(filename)}`;
}

// Version détourée (fond transparent) si elle existe, sinon l'originale
function urlPhotoVetement(vetement) {
    return urlPhoto(vetement.photo_detouree || vetement.photo);
}

async function appelerAPI(route, options = {}) {
    const reponse = await fetch(
        `${API_BASE}/${route}`,
        options
    );

    if (!reponse.ok) {
        const message = await reponse.text();

        const erreur = new Error(
            `Erreur ${reponse.status} : ${message || reponse.statusText || "réponse vide"}`
        );

        // Garder le statut et le corps pour des messages plus précis
        erreur.status = reponse.status;
        erreur.corps = message;

        throw erreur;
    }

    const contenu = await reponse.text();

    return contenu ? JSON.parse(contenu) : null;
}

function creerElement(balise, classe, texte) {
    const element = document.createElement(balise);

    if (classe) {
        element.className = classe;
    }

    if (texte !== undefined) {
        element.textContent = texte;
    }

    return element;
}

function creerEtiquette(texte, couleur) {
    const etiquette = creerElement("span", "etiquette");

    if (couleur) {
        const pastille = creerElement("span", "pastille-couleur");
        pastille.style.setProperty(
            "--couleur",
            TEINTES[normaliserCouleur(couleur)] || "#ccc"
        );
        etiquette.appendChild(pastille);
    }

    etiquette.appendChild(document.createTextNode(texte));

    return etiquette;
}

// ==========================================
// NOTIFICATIONS (TOASTS)
// ==========================================

function afficherToast(message, type = "succes") {
    const conteneur = document.getElementById("toasts");

    const toast = creerElement("div", `toast ${type}`);
    toast.setAttribute("role", type === "erreur" ? "alert" : "status");

    const icone = creerElement(
        "span",
        "toast-icone",
        type === "erreur" ? "!" : "✓"
    );
    icone.setAttribute("aria-hidden", "true");

    const texte = creerElement("span", "toast-message", message);

    const fermer = creerElement("button", "toast-fermer", "×");
    fermer.type = "button";
    fermer.setAttribute("aria-label", "Fermer la notification");

    const retirer = () => {
        if (!toast.isConnected) {
            return;
        }
        toast.classList.add("sortie");
        setTimeout(() => toast.remove(), 250);
    };

    fermer.addEventListener("click", retirer);

    toast.append(icone, texte, fermer);
    conteneur.appendChild(toast);

    setTimeout(retirer, type === "erreur" ? 7000 : 4000);
}

// ==========================================
// CONFIRMATION (MODALE)
// ==========================================

function demanderConfirmation(message) {
    const modale = document.getElementById("modaleConfirmation");

    // Navigateur sans <dialog> : repli sur confirm()
    if (!modale || typeof modale.showModal !== "function") {
        return Promise.resolve(confirm(message));
    }

    document.getElementById("modaleMessage").textContent = message;
    modale.returnValue = "";

    return new Promise((resolve) => {
        modale.addEventListener(
            "close",
            () => resolve(modale.returnValue === "confirmer"),
            { once: true }
        );

        modale.showModal();
    });
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

function afficherSquelettes(liste) {
    liste.replaceChildren();

    for (let i = 0; i < 4; i++) {
        const squelette = creerElement("div", "carte-squelette");
        squelette.setAttribute("aria-hidden", "true");
        liste.appendChild(squelette);
    }
}

async function afficherVetements() {
    const liste = document.getElementById("listeVetements");
    const compteur = document.getElementById("compteurVetements");

    liste.setAttribute("aria-busy", "true");
    compteur.textContent = "Chargement des vêtements…";
    afficherSquelettes(liste);

    try {
        const resultat = await obtenirVetements();

        gardeRobe = Array.isArray(resultat) ? resultat : [];

        document.getElementById("heroCompteur").textContent =
            String(gardeRobe.length);

        rendreGardeRobe();

    } catch (error) {
        console.error(error);

        liste.replaceChildren();

        const vide = creerElement("div", "liste-vide");
        vide.append(
            creerElement("strong", "", "Connexion impossible"),
            document.createTextNode(
                "Impossible de charger la garde-robe depuis Azure."
            )
        );
        liste.appendChild(vide);

        compteur.textContent = "Garde-robe indisponible";

    } finally {
        liste.removeAttribute("aria-busy");
    }
}

// Applique les filtres côté client et dessine les cartes
function rendreGardeRobe() {
    const liste = document.getElementById("listeVetements");
    const compteur = document.getElementById("compteurVetements");
    const boutonFiltres = document.getElementById("reinitialiserFiltres");

    const filtreCategorie = document.getElementById("filtreCategorie").value;
    const filtreCouleur = document.getElementById("filtreCouleur").value;
    const filtreStyle = document.getElementById("filtreStyle").value;

    const filtresActifs = Boolean(
        filtreCategorie || filtreCouleur || filtreStyle
    );

    boutonFiltres.hidden = !filtresActifs;

    const visibles = gardeRobe.filter((vetement) =>
        (!filtreCategorie || normaliserCategorie(vetement.categorie) === filtreCategorie) &&
        (!filtreCouleur || normaliserCouleur(vetement.couleur) === filtreCouleur) &&
        (!filtreStyle || normaliser(vetement.style) === filtreStyle)
    );

    // Compteur
    compteur.replaceChildren();

    const total = gardeRobe.length;
    const pluriel = (n) => (n > 1 ? "s" : "");

    if (filtresActifs) {
        compteur.append(
            creerElement("strong", "", String(visibles.length)),
            document.createTextNode(
                ` sur ${total} vêtement${pluriel(total)}`
            )
        );
    } else {
        compteur.append(
            creerElement("strong", "", String(total)),
            document.createTextNode(
                ` vêtement${pluriel(total)} dans votre garde-robe`
            )
        );
    }

    liste.replaceChildren();

    if (total === 0) {
        const vide = creerElement("div", "liste-vide");
        vide.append(
            creerElement("strong", "", "Votre garde-robe est vide."),
            document.createTextNode(
                "Ajoutez votre première pièce avec le formulaire."
            )
        );
        liste.appendChild(vide);
        return;
    }

    if (visibles.length === 0) {
        const vide = creerElement("div", "liste-vide");
        vide.append(
            creerElement("strong", "", "Aucun résultat"),
            document.createTextNode(
                "Aucun vêtement ne correspond à ces filtres."
            )
        );
        liste.appendChild(vide);
        return;
    }

    visibles.forEach((vetement, index) => {
        liste.appendChild(creerCarteVetement(vetement, index));
    });
}

function creerCarteVetement(vetement, index) {
    const card = creerElement("article", "vetement-card");
    card.style.setProperty("--i", String(index));

    const cadre = creerElement("div", "vetement-photo");

    const image = document.createElement("img");
    image.src = urlPhotoVetement(vetement);
    image.alt = vetement.nom;
    image.loading = "lazy";
    cadre.appendChild(image);

    const infos = creerElement("div", "vetement-infos");

    const titre = creerElement("h3", "", vetement.nom);

    // Ce que Gemini a reconnu sur la photo
    const vuParGemini = [];

    if (vetement.analyse && vetement.analyse.type_precis) {
        const vu = creerElement(
            "p",
            "vu-par-gemini",
            `✦ ${vetement.analyse.type_precis}`
        );
        vu.title = "Reconnu par Gemini sur la photo";
        vuParGemini.push(vu);
    }

    const etiquettes = creerElement("div", "etiquettes");
    const categorie = normaliserCategorie(vetement.categorie);
    etiquettes.append(
        creerEtiquette(LIBELLES_CATEGORIES[categorie] || vetement.categorie),
        creerEtiquette(libelleCouleur(vetement.couleur), vetement.couleur),
        creerEtiquette(libelleStyle(vetement.style))
    );

    const bouton = creerElement("button", "bouton-supprimer", "Supprimer");
    bouton.type = "button";
    bouton.setAttribute("aria-label", `Supprimer ${vetement.nom}`);

    bouton.addEventListener("click", async () => {
        const confirmation = await demanderConfirmation(
            `« ${vetement.nom} » sera retiré de votre garde-robe Azure, avec sa photo.`
        );

        if (!confirmation) {
            return;
        }

        bouton.disabled = true;
        bouton.textContent = "Suppression…";

        try {
            await appelerAPI(
                `supprimer-vetement/${encodeURIComponent(vetement.id)}`,
                {
                    method: "DELETE"
                }
            );

            await afficherVetements();

            reinitialiserTenue();

            afficherToast(`« ${vetement.nom} » a été supprimé.`);

        } catch (error) {
            console.error(error);

            afficherToast(
                "Impossible de supprimer le vêtement. " + error.message,
                "erreur"
            );

            bouton.disabled = false;
            bouton.textContent = "Supprimer";
        }
    });

    infos.append(titre, ...vuParGemini, etiquettes, bouton);
    card.append(cadre, infos);

    return card;
}

function reinitialiserFiltres() {
    document.getElementById("filtreCategorie").value = "";
    document.getElementById("filtreCouleur").value = "";
    document.getElementById("filtreStyle").value = "";
    rendreGardeRobe();
}

// ==========================================
// APERCU DE LA PHOTO
// ==========================================

function mettreAJourApercu() {
    const fichier = document.getElementById("photo").files[0];
    const apercu = document.getElementById("apercuPhoto");
    const zone = document.querySelector(".zone-photo");
    const texte = document.getElementById("zonePhotoTexte");

    if (urlApercu) {
        URL.revokeObjectURL(urlApercu);
        urlApercu = null;
    }

    zone.classList.remove("invalide");

    if (!fichier) {
        apercu.hidden = true;
        apercu.removeAttribute("src");
        zone.classList.remove("a-photo");
        texte.lastElementChild.previousElementSibling.textContent = "Photo du vêtement";
        return;
    }

    urlApercu = URL.createObjectURL(fichier);
    apercu.src = urlApercu;
    apercu.hidden = false;
    zone.classList.add("a-photo");
    texte.lastElementChild.previousElementSibling.textContent = "Changer la photo";
}

// ==========================================
// PRE-ANALYSE DE LA PHOTO PAR GEMINI
// ==========================================

function libelleStyle(style) {
    const valeur = normaliser(style);

    if (!valeur || valeur === "auto") {
        return "À déterminer";
    }

    return valeur;
}

function afficherStatutAnalyse(message, type) {
    const statut = document.getElementById("statutAnalyse");

    statut.replaceChildren();
    statut.className = `statut-analyse ${type || ""}`;

    if (type === "en-cours") {
        const chargeur = creerElement("span", "chargeur-sombre");
        chargeur.setAttribute("aria-hidden", "true");
        statut.appendChild(chargeur);
    }

    statut.appendChild(document.createTextNode(message));
    statut.hidden = !message;
}

// Remplit un champ seulement s'il est vide ou déjà suggéré par Gemini
function suggererValeur(id, valeur, valeurVide) {
    const element = document.getElementById(id);

    if (!valeur) {
        return false;
    }

    const libre = element.value === valeurVide || element.dataset.suggere === "1";

    if (!libre) {
        return false;
    }

    // Pour un <select>, vérifier que la valeur existe
    if (element.tagName === "SELECT" &&
        !Array.from(element.options).some((option) => option.value === valeur)) {
        return false;
    }

    element.value = valeur;
    element.dataset.suggere = "1";
    element.closest(".champ").classList.add("suggere");
    element.closest(".champ").classList.remove("invalide");

    return true;
}

function effacerSuggestions() {
    ["nom", "categorie", "couleur", "style"].forEach((id) => {
        const element = document.getElementById(id);
        delete element.dataset.suggere;
        element.closest(".champ").classList.remove("suggere");
    });
}

async function preAnalyserPhoto() {
    const fichier = document.getElementById("photo").files[0];

    preAnalyse = null;
    compteurPreAnalyse += 1;
    const numero = compteurPreAnalyse;

    if (!fichier) {
        afficherStatutAnalyse("", "");
        return;
    }

    const extensions = [".jpg", ".jpeg", ".png", ".webp"];
    const nom = fichier.name.toLowerCase();

    if (!extensions.some((ext) => nom.endsWith(ext)) ||
        fichier.size > 5 * 1024 * 1024) {
        afficherStatutAnalyse(
            "Photo non analysée (JPG, PNG ou WEBP de 5 Mo maximum).",
            "erreur"
        );
        return;
    }

    afficherStatutAnalyse("Gemini analyse la photo…", "en-cours");

    try {
        const formData = new FormData();
        formData.append("photo", fichier);

        const resultat = await appelerAPI("analyser-photo", {
            method: "POST",
            body: formData
        });

        // Une autre photo a été choisie entre-temps : ignorer ce résultat
        if (numero !== compteurPreAnalyse) {
            return;
        }

        preAnalyse = {
            fichier,
            analyse: resultat.analyse,
            modele: resultat.modele,
            signature: resultat.signature
        };

        const s = resultat.suggestions || {};

        suggererValeur("nom", s.nom, "");
        suggererValeur("categorie", s.categorie, "");
        suggererValeur("couleur", s.couleur, "");
        suggererValeur("style", s.style, "auto");

        afficherStatutAnalyse(
            `✦ Gemini a reconnu : ${resultat.analyse.type_precis}. ` +
            "Champs suggérés par Gemini — modifiables.",
            "succes"
        );

    } catch (error) {
        if (numero !== compteurPreAnalyse) {
            return;
        }

        console.warn("Pré-analyse impossible :", error);

        afficherStatutAnalyse(
            error && error.status === 422
                ? "Gemini ne reconnaît pas de vêtement sur cette photo. " +
                  "Vous pouvez remplir les champs vous-même."
                : "Analyse indisponible pour le moment : remplissez les " +
                  "champs vous-même, ou laissez Gemini décider du style.",
            "erreur"
        );
    }
}

// ==========================================
// AJOUTER UN VETEMENT DANS AZURE
// ==========================================

function verifierFormulaire() {
    const champs = ["nom", "categorie", "couleur"];
    const manquants = [];

    champs.forEach((id) => {
        const element = document.getElementById(id);
        const vide = !element.value.trim();

        element.closest(".champ").classList.toggle("invalide", vide);

        if (vide) {
            manquants.push(element);
        }
    });

    const zone = document.querySelector(".zone-photo");
    const sansPhoto = !document.getElementById("photo").files[0];
    zone.classList.toggle("invalide", sansPhoto);

    if (sansPhoto) {
        return { valide: false, message: "Veuillez sélectionner une photo." };
    }

    if (manquants.length > 0) {
        manquants[0].focus();
        return {
            valide: false,
            message: "Veuillez remplir le nom, la catégorie et la couleur."
        };
    }

    return { valide: true };
}

async function enregistrerVetement(event) {
    event.preventDefault();

    const formulaire = event.currentTarget;

    const verification = verifierFormulaire();

    if (!verification.valide) {
        afficherToast(verification.message, "erreur");
        return;
    }

    const fichier =
        document.getElementById("photo").files[0];

    const formats = [
        "image/jpeg",
        "image/png",
        "image/webp"
    ];

    const extensions = [".jpg", ".jpeg", ".png", ".webp"];

    const nomFichier = fichier.name.toLowerCase();

    const formatValide = fichier.type
        ? formats.includes(fichier.type)
        : extensions.some((ext) => nomFichier.endsWith(ext));

    if (!formatValide) {
        afficherToast(
            `Format non pris en charge (${fichier.type || fichier.name}). ` +
            "Formats acceptés : JPG, PNG ou WEBP. " +
            "Les photos HEIC (iPhone) doivent être converties en JPG.",
            "erreur"
        );
        return;
    }

    const bouton = formulaire.querySelector(
        'button[type="submit"]'
    );
    const libelle = bouton.querySelector(".bouton-libelle");

    bouton.disabled = true;
    bouton.classList.add("en-cours");
    libelle.textContent = "Envoi de la photo…";

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

        libelle.textContent = "Enregistrement…";

        const vetement = {
            nom: document.getElementById("nom")
                .value.trim(),

            categorie: document.getElementById("categorie")
                .value,

            couleur: document.getElementById("couleur")
                .value,

            style: document.getElementById("style")
                .value || "auto",

            photo: upload.filename
        };

        // 3. Enregistrer dans Azure Table Storage

        // Pré-analyse signée par le serveur : évite de rappeler Gemini
        if (preAnalyse && preAnalyse.fichier === fichier) {
            vetement.analyse = preAnalyse.analyse;
            vetement.modele_analyse = preAnalyse.modele;
            vetement.signature_analyse = preAnalyse.signature;
        }

        const ajout = await appelerAPI(
            "ajouter-vetement",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify(vetement)
            }
        );

        // 4. Gemini analyse la photo (une seule fois).
        //    Un échec ne bloque pas l'ajout : le vêtement est déjà enregistré.

        if (ajout && ajout.id && !ajout.analyse_enregistree) {
            libelle.textContent = "Gemini analyse la photo…";

            try {
                await appelerAPI(
                    `analyser-vetement/${encodeURIComponent(ajout.id)}`,
                    { method: "POST" }
                );
            } catch (erreurAnalyse) {
                console.warn("Analyse de la photo impossible :", erreurAnalyse);

                afficherToast(
                    "Vêtement ajouté, mais Gemini n'a pas pu analyser la photo " +
                    "pour le moment. Il se basera sur vos informations.",
                    "erreur"
                );
            }
        }

        // 5. Actualiser la garde-robe

        formulaire.reset();
        mettreAJourApercu();
        preAnalyse = null;
        effacerSuggestions();
        afficherStatutAnalyse("", "");

        await afficherVetements();

        reinitialiserTenue();

        afficherToast(`« ${vetement.nom} » a été ajouté à votre garde-robe.`);

    } catch (error) {
        console.error(
            "Erreur d'enregistrement :",
            error
        );

        afficherToast(
            "Erreur d'enregistrement : " + error.message,
            "erreur"
        );

    } finally {
        bouton.disabled = false;
        bouton.classList.remove("en-cours");
        libelle.textContent = "Ajouter le vêtement";
    }
}

// ==========================================
// PUCES D'EVENEMENTS (synchronisées avec le <select>)
// ==========================================

function creerPucesEvenements() {
    const select = document.getElementById("evenement");
    const conteneur = document.getElementById("pucesEvenements");

    conteneur.replaceChildren();

    Array.from(select.options).forEach((option) => {
        const description = DESCRIPTIONS_EVENEMENTS[option.value] || {
            symbole: option.textContent.trim().charAt(0),
            styles: ""
        };

        const puce = creerElement("button", "puce-evenement");
        puce.type = "button";
        puce.dataset.valeur = option.value;
        puce.setAttribute("role", "radio");

        const symbole = creerElement("span", "puce-symbole", description.symbole);
        symbole.setAttribute("aria-hidden", "true");

        puce.append(
            symbole,
            creerElement("span", "puce-titre", option.textContent.trim()),
            creerElement("span", "puce-styles", description.styles)
        );

        puce.addEventListener("click", () => choisirEvenement(option.value));

        conteneur.appendChild(puce);
    });

    // Navigation clavier façon groupe radio
    conteneur.addEventListener("keydown", (event) => {
        const touches = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];

        if (!touches.includes(event.key)) {
            return;
        }

        event.preventDefault();

        const puces = Array.from(conteneur.children);
        const actuelle = puces.findIndex(
            (puce) => puce.dataset.valeur === select.value
        );
        const pas = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
        const suivante = puces[(actuelle + pas + puces.length) % puces.length];

        choisirEvenement(suivante.dataset.valeur);
        suivante.focus();
    });

    synchroniserPuces();
}

function choisirEvenement(valeur) {
    const select = document.getElementById("evenement");

    if (select.value === valeur) {
        return;
    }

    select.value = valeur;

    // Déclenche les écouteurs existants (reinitialiserTenue)
    select.dispatchEvent(new Event("change"));
}

function synchroniserPuces() {
    const valeur = document.getElementById("evenement").value;

    document.querySelectorAll(".puce-evenement").forEach((puce) => {
        const active = puce.dataset.valeur === valeur;
        puce.setAttribute("aria-checked", String(active));
        puce.tabIndex = active ? 0 : -1;
    });
}

// ==========================================
// GENERER UNE TENUE AVEC L'API PYTHON
// ==========================================

async function genererTenue(event) {

    const evenement =
        document.getElementById("evenement").value;

    const bouton =
        document.getElementById("genererTenue");

    const boutonAutre =
        document.getElementById("autreTenue");

    // « Générer une autre tenue » : transmettre la tenue actuelle
    // pour obtenir une combinaison différente
    const demandeAutre =
        Boolean(event) && event.currentTarget === boutonAutre;

    const precedents = demandeAutre && derniereTenue
        ? derniereTenue.map((vetement) => vetement.id)
        : [];

    // Gemini a déjà proposé d'autres tenues validées : on les affiche
    // sans nouvel appel (plus rapide et sans consommer de tokens).
    if (demandeAutre && alternativesRestantes.length > 0) {
        const suivante = alternativesRestantes.shift();
        const selection = [
            suivante.tenue.haut,
            suivante.tenue.bas,
            suivante.tenue.chaussures,
            suivante.tenue.veste
        ].filter(Boolean);

        afficherTenue(selection);
        derniereTenue = selection;

        afficherInfosTenue({
            source: "gemini",
            modele: modeleDerniereTenue,
            explication: suivante.explication,
            note_style: suivante.note_style
        });
        return;
    }

    bouton.disabled = true;
    boutonAutre.disabled = true;

    bouton.textContent = "Génération en cours…";
    afficherStatutGeneration("Gemini analyse votre garde-robe…");

    try {

        // Appeler la fonction Azure suggestion_tenue

        let route =
            `suggestion-tenue?evenement=${encodeURIComponent(evenement)}`;

        if (precedents.length > 0) {
            route += `&precedent=${encodeURIComponent(precedents.join(","))}`;
        }

        const resultat = await appelerAPI(route);

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

        afficherInfosTenue(resultat);

        alternativesRestantes = Array.isArray(resultat.alternatives)
            ? resultat.alternatives.filter(
                (alt) => alt && alt.tenue && alt.tenue.haut &&
                    alt.tenue.bas && alt.tenue.chaussures
            )
            : [];
        modeleDerniereTenue = resultat.modele || null;

    } catch (error) {

        console.error(
            "Erreur de génération :",
            error
        );

        afficherErreur(messageErreurGeneration(error));

    } finally {

        masquerStatutGeneration();

        bouton.disabled = false;
        boutonAutre.disabled = false;

        bouton.textContent = "Générer ma tenue";
    }
}

// Message compréhensible selon la réponse du backend
function messageErreurGeneration(error) {

    if (error && error.status === 422) {
        try {
            const corps = JSON.parse(error.corps || "{}");
            const details = corps.explication || corps.message;

            if (details && corps.manque) {
                return `${details} Il faudrait ajouter : ${corps.manque}.`;
            }

            if (details) {
                return details +
                    " Ajoutez des pièces adaptées à cet événement " +
                    "ou choisissez une autre occasion.";
            }
        } catch (ignore) {
            // Corps non JSON : message générique ci-dessous
        }

        return "Impossible de générer une tenue complète. " +
            "Vérifiez que vous avez un haut, un bas et " +
            "des chaussures compatibles avec cet événement.";
    }

    if (error && error.status >= 500) {
        return "Le service de génération rencontre un problème " +
            `(erreur ${error.status}). Réessayez dans un instant.`;
    }

    if (error && error.status) {
        return `La génération a échoué (erreur ${error.status}).`;
    }

    return "Impossible de contacter le service de génération. " +
        "Vérifiez votre connexion internet puis réessayez.";
}

// ==========================================
// STATUT, BADGE ET EXPLICATION DE LA TENUE
// ==========================================

function afficherStatutGeneration(message) {
    const statut = document.getElementById("statutGeneration");

    statut.querySelector(".statut-texte").textContent = message;
    statut.hidden = false;
}

function masquerStatutGeneration() {
    document.getElementById("statutGeneration").hidden = true;
}

function afficherInfosTenue(resultat) {
    const infos = document.getElementById("infosTenue");

    infos.replaceChildren();

    const parGemini = resultat.source === "gemini";

    const badge = creerElement(
        "span",
        `badge-source ${parGemini ? "badge-gemini" : "badge-secours"}`,
        parGemini ? "✦ Généré par Gemini" : "Algorithme de secours"
    );

    if (parGemini && resultat.modele) {
        badge.title = `Modèle : ${resultat.modele}`;
    }

    infos.appendChild(badge);

    if (parGemini && resultat.note_style) {
        infos.appendChild(
            creerElement(
                "span",
                "note-style",
                `Note de style : ${resultat.note_style}/10`
            )
        );
    }

    if (resultat.explication) {
        infos.appendChild(
            creerElement("p", "explication-tenue", resultat.explication)
        );
    }

    if (!parGemini && resultat.raison_secours) {
        infos.appendChild(
            creerElement(
                "p",
                "raison-secours",
                `Gemini indisponible : ${resultat.raison_secours}`
            )
        );
    }

    infos.hidden = false;
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
    collage.classList.remove("collage-message");

    const avecVeste = selection.some(
        (vetement) => normaliserCategorie(vetement.categorie) === "veste"
    );

    collage.classList.toggle("avec-veste", avecVeste);
    collage.classList.toggle("sans-veste", !avecVeste);

    // Ordre d'apparition : veste, haut, bas, chaussures
    const ordre = ["veste", "haut", "bas", "chaussures"];

    const tries = [...selection].sort(
        (a, b) =>
            ordre.indexOf(normaliserCategorie(a.categorie)) -
            ordre.indexOf(normaliserCategorie(b.categorie))
    );

    tries.forEach((vetement, index) => {

        const categorie = normaliserCategorie(
            vetement.categorie
        );

        // Créer un vêtement cliquable

        const bouton = document.createElement("button");

        bouton.type = "button";

        bouton.className =
            `collage-item ${categorie}` +
            (vetement.photo_detouree ? " detoure" : "");

        bouton.style.setProperty("--i", String(index));

        bouton.title = vetement.nom;

        bouton.setAttribute(
            "aria-label",
            `Voir les détails de ${vetement.nom}`
        );

        bouton.setAttribute("aria-pressed", "false");

        // Récupérer la photo depuis Azure Blob Storage

        const image = document.createElement("img");

        image.src = urlPhotoVetement(vetement);
        image.alt = vetement.nom;

        const nom = creerElement("span", "collage-nom", vetement.nom);
        nom.setAttribute("aria-hidden", "true");

        bouton.append(image, nom);

        // Afficher les détails au clic

        bouton.addEventListener("click", () => {

            collage.querySelectorAll(".collage-item").forEach((item) => {
                item.classList.remove("selectionne");
                item.setAttribute("aria-pressed", "false");
            });

            bouton.classList.add("selectionne");
            bouton.setAttribute("aria-pressed", "true");

            afficherDetailsVetement(vetement);

        });

        collage.appendChild(bouton);

    });

    // Invitation à cliquer sur une pièce
    details.replaceChildren();

    const indice = creerElement(
        "p",
        "details-indice",
        "Touchez une pièce du collage pour voir ses détails."
    );

    details.classList.add("details-vide");
    details.appendChild(indice);
    details.hidden = false;

    boutonAutre.hidden = false;
}

// ==========================================
// DETAILS DU VETEMENT SELECTIONNE
// ==========================================

function afficherDetailsVetement(vetement) {

    const details =
        document.getElementById("detailsVetement");

    details.replaceChildren();
    details.classList.remove("details-vide");

    // Relancer l'animation d'apparition
    details.style.animation = "none";
    void details.offsetWidth;
    details.style.animation = "";

    const cadre = creerElement("div", "details-photo");
    const image = document.createElement("img");
    image.src = urlPhotoVetement(vetement);
    image.alt = "";
    cadre.appendChild(image);

    const texte = creerElement("div", "details-texte");

    const categorieNormalisee = normaliserCategorie(vetement.categorie);

    const surtitre = creerElement(
        "p",
        "surtitre",
        LIBELLES_CATEGORIES[categorieNormalisee] || vetement.categorie
    );

    const titre = creerElement("h3", "", vetement.nom);

    const liste = creerElement("ul", "details-liste");

    const lignes = [
        ["Catégorie", vetement.categorie],
        ["Couleur", vetement.couleur],
        ["Style", libelleStyle(vetement.style)]
    ];

    lignes.forEach(([libelle, valeur]) => {
        const ligne = document.createElement("li");
        const valeurElement = creerElement("span", "");

        if (libelle === "Couleur") {
            const pastille = creerElement("span", "pastille-couleur");
            pastille.style.setProperty(
                "--couleur",
                TEINTES[normaliserCouleur(valeur)] || "#ccc"
            );
            valeurElement.appendChild(pastille);
        }

        valeurElement.appendChild(document.createTextNode(
            libelle === "Couleur" ? libelleCouleur(valeur) : valeur
        ));

        ligne.append(
            creerElement("span", "", libelle),
            valeurElement
        );

        liste.appendChild(ligne);
    });

    texte.append(surtitre, titre, liste);

    // Fiche visuelle établie par Gemini à partir de la photo
    const analyse = vetement.analyse;

    if (analyse && (analyse.type_precis || analyse.description_courte)) {
        const bloc = creerElement("div", "details-vu-gemini");

        bloc.appendChild(
            creerElement("span", "details-vu-titre", "✦ Vu par Gemini")
        );

        if (analyse.type_precis) {
            bloc.appendChild(
                creerElement("strong", "", analyse.type_precis)
            );
        }

        if (analyse.description_courte) {
            bloc.appendChild(
                creerElement("p", "", analyse.description_courte)
            );
        }

        if (analyse.formalite) {
            bloc.appendChild(
                creerElement(
                    "p",
                    "details-formalite",
                    `Élégance : ${"●".repeat(analyse.formalite)}${"○".repeat(5 - analyse.formalite)}`
                )
            );
        }

        texte.appendChild(bloc);
    }
    details.append(cadre, texte);

    details.hidden = false;
}

// ==========================================
// AFFICHER UNE ERREUR
// ==========================================

function afficherErreur(message) {

    reinitialiserTenue();

    const collage =
        document.getElementById("collageTenue");

    collage.classList.add("collage-message");

    const bloc = creerElement("div", "collage-erreur");

    bloc.append(
        creerElement("strong", "", "Tenue incomplète"),
        document.createTextNode(message)
    );

    collage.appendChild(bloc);
}

// ==========================================
// REINITIALISER LA TENUE
// ==========================================

function reinitialiserTenue() {

    const collage = document.getElementById("collageTenue");

    collage.replaceChildren();
    collage.classList.remove("collage-message", "avec-veste", "sans-veste");

    alternativesRestantes = [];
    modeleDerniereTenue = null;

    const details =
        document.getElementById("detailsVetement");

    details.replaceChildren();

    details.hidden = true;

    const infos = document.getElementById("infosTenue");
    infos.replaceChildren();
    infos.hidden = true;

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
            () => {
                synchroniserPuces();
                reinitialiserTenue();
            }
        );

    // Aperçu de la photo
    const champPhoto = document.getElementById("photo");
    const zonePhoto = document.querySelector(".zone-photo");

    champPhoto.addEventListener("change", () => {
        mettreAJourApercu();
        preAnalyserPhoto();
    });
    champPhoto.addEventListener("focus", () => zonePhoto.classList.add("focus"));
    champPhoto.addEventListener("blur", () => zonePhoto.classList.remove("focus"));

    // Glisser-déposer d'une photo
    ["dragenter", "dragover"].forEach((type) => {
        zonePhoto.addEventListener(type, (event) => {
            event.preventDefault();
            zonePhoto.classList.add("survol");
        });
    });

    ["dragleave", "drop"].forEach((type) => {
        zonePhoto.addEventListener(type, () => zonePhoto.classList.remove("survol"));
    });

    zonePhoto.addEventListener("drop", (event) => {
        event.preventDefault();

        if (event.dataTransfer && event.dataTransfer.files.length > 0) {
            champPhoto.files = event.dataTransfer.files;
            mettreAJourApercu();
        }
    });

    // Retirer l'état d'erreur quand l'utilisateur corrige un champ
    ["nom", "categorie", "couleur", "style"].forEach((id) => {
        const element = document.getElementById(id);
        element.addEventListener("input", () => {
            delete element.dataset.suggere;
            element.closest(".champ").classList.remove("suggere");
        });
        element.addEventListener("change", () => {
            delete element.dataset.suggere;
            element.closest(".champ").classList.remove("suggere");
        });
    });

    ["nom", "categorie", "couleur", "style"].forEach((id) => {
        const element = document.getElementById(id);
        const effacer = () => element.closest(".champ").classList.remove("invalide");
        element.addEventListener("input", effacer);
        element.addEventListener("change", effacer);
    });

    document.getElementById("clothingForm")
        .addEventListener("reset", () => {
            document.querySelectorAll(".champ.invalide")
                .forEach((champ) => champ.classList.remove("invalide"));
        });

    // Filtres de la garde-robe
    ["filtreCategorie", "filtreCouleur", "filtreStyle"].forEach((id) => {
        document.getElementById(id)
            .addEventListener("change", rendreGardeRobe);
    });

    document.getElementById("reinitialiserFiltres")
        .addEventListener("click", reinitialiserFiltres);

    // Ombre de la navigation au défilement
    const entete = document.querySelector(".entete");
    const majEntete = () => entete.classList.toggle("defile", window.scrollY > 8);
    window.addEventListener("scroll", majEntete, { passive: true });
    majEntete();

    creerPucesEvenements();

    await afficherVetements();
}

// ==========================================
// DEMARRAGE
// ==========================================

document.addEventListener(
    "DOMContentLoaded",
    initialiserApplication
);
