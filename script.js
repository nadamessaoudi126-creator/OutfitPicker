
const DB_NAME = "OutfitPickerDB";
const STORE_NAME = "vetements";
let database;

// 1. Initialiser IndexedDB
function ouvrirDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, {
                    keyPath: "id",
                    autoIncrement: true
                });
            }
        };

        request.onsuccess = () => {
            database = request.result;
            resolve(database);
        };

        request.onerror = () => reject(request.error);
    });
}

// 2. Récupérer tous les vêtements
function obtenirVetements() {
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(
            STORE_NAME, "readonly"
        );

        const request = transaction
            .objectStore(STORE_NAME)
            .getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// 3. Ajouter un vêtement
function ajouterVetement(vetement) {
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(
            STORE_NAME, "readwrite"
        );

        const request = transaction
            .objectStore(STORE_NAME)
            .add(vetement);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// 4. Supprimer un vêtement
function supprimerVetement(id) {
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(
            STORE_NAME, "readwrite"
        );

        const request = transaction
            .objectStore(STORE_NAME)
            .delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// 5. Afficher la garde-robe
async function afficherVetements() {
    const vetements = await obtenirVetements();
    const liste = document.getElementById("listeVetements");

    liste.innerHTML = "";

    if (vetements.length === 0) {
        liste.textContent = "Votre garde-robe est vide.";
        return;
    }

    vetements.forEach((vetement) => {
        const card = document.createElement("div");
        card.className = "vetement-card";

        const image = document.createElement("img");
        image.src = URL.createObjectURL(vetement.photo);
        image.alt = vetement.nom;
        image.onload = () => URL.revokeObjectURL(image.src);

        const titre = document.createElement("h3");
        titre.textContent = vetement.nom;

        const description = document.createElement("p");
        description.textContent =
            `${vetement.categorie} - ${vetement.couleur} - ${vetement.style}`;

        const bouton = document.createElement("button");
        bouton.textContent = "Supprimer";

        bouton.addEventListener("click", async () => {
            await supprimerVetement(vetement.id);
            await afficherVetements();
        });

        card.append(image, titre, description, bouton);
        liste.appendChild(card);
    });
}

// 6. Enregistrer le formulaire
document.getElementById("clothingForm")
    .addEventListener("submit", async (event) => {
        event.preventDefault();

        const fichier = document.getElementById("photo").files[0];

        if (!fichier || !fichier.type.startsWith("image/")) {
            alert("Veuillez sélectionner une image valide.");
            return;
        }

        const vetement = {
            nom: document.getElementById("nom").value.trim(),
            categorie: document.getElementById("categorie").value,
            couleur: document.getElementById("couleur").value,
            style: document.getElementById("style").value,
            photo: fichier
        };

        try {
            await ajouterVetement(vetement);
            event.target.reset();
            await afficherVetements();
            alert("Vêtement ajouté avec succès !");
        } catch (error) {
            console.error(error);
            alert("Erreur lors de l'enregistrement du vêtement.");
        }
    });

// 7. Styles selon les événements
const stylesEvenements = {
    universite: ["casual"],
    mariage: ["chic"],
    entretien: ["professionnel", "chic"],
    sport: ["sportif"],
    sortie: ["casual", "chic"]
};

// 8. Générer une tenue
async function genererTenue() {
    const evenement = document.getElementById("evenement").value;
    const styles = stylesEvenements[evenement];

    const vetements = await obtenirVetements();

    const compatibles = vetements.filter(
        (vetement) => styles.includes(vetement.style)
    );

    const categories = ["haut", "bas", "chaussures"];
    const selection = [];

    for (const categorie of categories) {
        const options = compatibles.filter(
            (vetement) => vetement.categorie === categorie
        );

        if (options.length === 0) {
            afficherErreur(
                `Il manque un vêtement de catégorie "${categorie}" pour cet événement.`
            );
            return;
        }

        const choix = options[
            Math.floor(Math.random() * options.length)
        ];

        selection.push(choix);
    }

    afficherTenue(selection);
}

// 9. Afficher la tenue générée
function afficherTenue(selection) {
    const resultat = document.getElementById("resultatTenue");
    resultat.innerHTML = "";

    const titre = document.createElement("h3");
    titre.textContent = "Voici votre tenue recommandée !";
    resultat.appendChild(titre);

    selection.forEach((vetement) => {
        const card = document.createElement("div");
        card.className = "vetement-card";

        const image = document.createElement("img");
        image.src = URL.createObjectURL(vetement.photo);
        image.alt = vetement.nom;
        image.onload = () => URL.revokeObjectURL(image.src);

        const nom = document.createElement("h3");
        nom.textContent = vetement.nom;

        const details = document.createElement("p");
        details.textContent =
            `${vetement.couleur} - ${vetement.style}`;

        card.append(image, nom, details);
        resultat.appendChild(card);
    });

    const bouton = document.createElement("button");
    bouton.textContent = "Générer une autre tenue";
    bouton.addEventListener("click", genererTenue);

    resultat.appendChild(bouton);
}

// 10. Afficher une erreur
function afficherErreur(message) {
    const resultat = document.getElementById("resultatTenue");
    resultat.innerHTML = "";

    const paragraphe = document.createElement("p");
    paragraphe.textContent = message;

    resultat.appendChild(paragraphe);
}

// 11. Initialiser l'application
async function initialiserApplication() {
    try {
        await ouvrirDatabase();
        await afficherVetements();

        document.getElementById("genererTenue")
            .addEventListener("click", genererTenue);

    } catch (error) {
        console.error(error);
        alert("Impossible d'initialiser la base de données locale.");
    }
}

initialiserApplication();
