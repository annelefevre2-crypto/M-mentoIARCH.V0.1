// ======================================================
// Mémento opérationnel IA – RCH
// app.js
// ------------------------------------------------------
// Logique principale de l'application :
//  - gestion des onglets (scan / création)
//  - scan QR (caméra + image) via html5-qrcode
//  - parsing JSON et génération dynamique du formulaire
//  - construction du prompt final
//  - gestion des boutons IA et ouverture vers les sites
//  - création de fiche + génération du QR code
// ------------------------------------------------------

// =============================
// Variables globales
// =============================

// Référence vers l'instance html5-qrcode (caméra)
let html5QrCode = null;

// Indique si le scan caméra est actif
let isCameraRunning = false;

// Fiche courante (objet JSON issu du QR)
let currentFiche = null;

// Valeurs courantes saisies pour les variables
let currentVariablesValues = {};

// Référence au QRCode généré (pour la partie création)
let generatedQrInstance = null;

// =============================
// Initialisation au chargement
// =============================

document.addEventListener("DOMContentLoaded", () => {
  // Gestion des onglets
  initTabs();

  // Gestion des boutons de la vue "scan"
  initScanView();

  // Gestion de la vue "création de fiche"
  initCreateView();
});

// =============================
// Gestion des onglets
// =============================

function initTabs() {
  const tabButtons = document.querySelectorAll(".tab-button");
  const tabPanels = document.querySelectorAll(".tab-panel");

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-tab");

      // Active le bouton cliqué
      tabButtons.forEach((b) => b.classList.remove("tab-button--active"));
      btn.classList.add("tab-button--active");

      // Affiche le panel correspondant
      tabPanels.forEach((panel) => {
        if (panel.id === `tab-${target}`) {
          panel.classList.add("tab-panel--active");
        } else {
          panel.classList.remove("tab-panel--active");
        }
      });
    });
  });
}

// =============================
// Vue Scan / Lecture fiche
// =============================

function initScanView() {
  const cameraBtn = document.getElementById("cameraBtn");
  const scanBtn = document.getElementById("scanBtn");
  const resetBtn = document.getElementById("resetBtn");
  const qrFileInput = document.getElementById("qrFile");
  const generatePromptBtn = document.getElementById("generatePromptBtn");
  const infosComplementaires = document.getElementById("infosComplementaires");

  const btnChatgpt = document.getElementById("btnChatgpt");
  const btnPerplexity = document.getElementById("btnPerplexity");
  const btnMistral = document.getElementById("btnMistral");

  // Bouton "Activer la caméra" : démarre la capture vidéo
  cameraBtn.addEventListener("click", () => {
    startCameraScan();
  });

  // Bouton "Scanner QR Code" : si la caméra tourne déjà, ne fait rien de plus
  // (on garde ce bouton pour coller à la maquette, il pourra servir à forcer un re-start si besoin)
  scanBtn.addEventListener("click", () => {
    if (!isCameraRunning) {
      startCameraScan();
    }
  });

  // Réinitialisation complète
  resetBtn.addEventListener("click", () => {
    resetScanView();
  });

  // Import d'une image de QR
  qrFileInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (file) {
      scanQrFromFile(file);
    }
  });

  // Remise à jour du prompt et des boutons IA quand les infos complémentaires changent
  infosComplementaires.addEventListener("input", () => {
    updatePromptPreview();
  });

  // Bouton "Générer le prompt"
  generatePromptBtn.addEventListener("click", () => {
    updatePromptPreview(true);
  });

  // Clic sur les boutons IA
  btnChatgpt.addEventListener("click", () => openIa("chatgpt"));
  btnPerplexity.addEventListener("click", () => openIa("perplexity"));
  btnMistral.addEventListener("click", () => openIa("mistral"));

  // Initialisation des boutons IA en état désactivé
  setIaButtonsState(null);
}

// ------------------------------------------------------
// Lancement du scan caméra avec html5-qrcode
// ------------------------------------------------------

function startCameraScan() {
  const cameraError = document.getElementById("cameraError");
  const videoBox = document.getElementById("videoBox");
  const cameraElementId = "camera";

  cameraError.hidden = true;

  // Si déjà en cours, ne pas recréer
  if (isCameraRunning) return;

  // Affiche la zone vidéo
  videoBox.hidden = false;

  // Crée une instance si besoin
  if (!html5QrCode) {
    html5QrCode = new Html5Qrcode(cameraElementId);
  }

  // Essaye de récupérer les caméras disponibles
  Html5Qrcode.getCameras()
    .then((devices) => {
      if (!devices || devices.length === 0) {
        throw new Error("Aucune caméra disponible.");
      }

      // Choix : caméra arrière si possible
      const backCamera = devices.find((d) =>
        d.label.toLowerCase().includes("back")
      );
      const cameraId = backCamera ? backCamera.id : devices[0].id;

      // Démarre le scan
      return html5QrCode.start(
        cameraId,
        {
          fps: 10,
          qrbox: 250
        },
        // Callback de succès : on arrête le scan après le premier QR validé
        (decodedText) => {
          handleQrDecoded(decodedText);
          stopCameraScan();
        },
        // Callback d'erreur sur une frame (non bloquant)
        (errorMessage) => {
          // On ignore les erreurs ponctuelles de lecture pour ne pas spammer l'UI
          console.debug("Erreur scan frame:", errorMessage);
        }
      );
    })
    .then(() => {
      isCameraRunning = true;
    })
    .catch((err) => {
      cameraError.textContent =
        "Impossible d'activer la caméra : " + (err?.message || err);
      cameraError.hidden = false;
      videoBox.hidden = true;
    });
}

// Arrêt du scan caméra
function stopCameraScan() {
  if (html5QrCode && isCameraRunning) {
    html5QrCode
      .stop()
      .then(() => {
        isCameraRunning = false;
      })
      .catch((err) => {
        console.warn("Erreur à l'arrêt de la caméra:", err);
      });
  }

  const videoBox = document.getElementById("videoBox");
  videoBox.hidden = true;
}

// ------------------------------------------------------
// Scan d'un QR à partir d'un fichier image
// ------------------------------------------------------

function scanQrFromFile(file) {
  const cameraError = document.getElementById("cameraError");
  cameraError.hidden = true;

  // Crée une instance temporaire pour lire le fichier
  const tempScanner = new Html5Qrcode("camera");
  tempScanner
    .scanFile(file, false)
    .then((decodedText) => {
      handleQrDecoded(decodedText);
      tempScanner.clear();
    })
    .catch((err) => {
      cameraError.textContent =
        "Impossible de lire le QR depuis le fichier : " + (err?.message || err);
      cameraError.hidden = false;
      tempScanner.clear();
    });
}

// ------------------------------------------------------
// Traitement du texte décodé depuis le QR
// ------------------------------------------------------

function handleQrDecoded(decodedText) {
  let json;
  try {
    json = JSON.parse(decodedText);
  } catch (e) {
    alert(
      "Le QR code ne contient pas un JSON valide.\nDétail : " + e.message
    );
    return;
  }

  // On stocke la fiche courante
  currentFiche = json;

  // On réinitialise les valeurs des variables
  currentVariablesValues = {};

  // Met à jour l'interface (fiche + variables + prompt + IA)
  renderFicheMeta();
  renderVariablesForm();
  updatePromptPreview();
  setIaButtonsState(currentFiche.indices_confiance || null);
}

// ------------------------------------------------------
// Affichage du résumé de la fiche (titre, objectif...)
// ------------------------------------------------------

function renderFicheMeta() {
  const ficheMeta = document.getElementById("ficheMeta");

  if (!currentFiche) {
    ficheMeta.textContent = "Aucune fiche scannée";
    ficheMeta.classList.add("fiche-meta--empty");
    return;
  }

  const {
    categorie,
    titre,
    objectif,
    concepteur,
    date_maj,
    version
  } = currentFiche;

  // Construction d'un petit résumé lisible
  const lines = [];
  if (categorie) lines.push(`<strong>${escapeHtml(categorie)}</strong>`);
  if (titre) lines.push(`<span>${escapeHtml(titre)}</span>`);
  if (objectif) lines.push(`<br><em>${escapeHtml(objectif)}</em>`);
  if (version || date_maj || concepteur) {
    const metaParts = [];
    if (version) metaParts.push(`Version ${escapeHtml(version)}`);
    if (date_maj) metaParts.push(`MAJ : ${escapeHtml(date_maj)}`);
    if (concepteur) metaParts.push(`Concepteur : ${escapeHtml(concepteur)}`);
    lines.push(`<br><span>${metaParts.join(" — ")}</span>`);
  }

  ficheMeta.innerHTML = lines.join(" ");
  ficheMeta.classList.remove("fiche-meta--empty");
}

// ------------------------------------------------------
// Génération dynamique du formulaire de variables
// ------------------------------------------------------

function renderVariablesForm() {
  const container = document.getElementById("variablesContainer");
  container.innerHTML = "";

  // Pas de fiche → rien à générer
  if (!currentFiche || !Array.isArray(currentFiche.variables)) {
    return;
  }

  currentFiche.variables.slice(0, 10).forEach((variable) => {
    const {
      id,
      label,
      type = "text",
      obligatoire = false,
      placeholder = ""
    } = variable;

    if (!id) return; // on ignore les variables sans identifiant

    // Container global
    const fieldDiv = document.createElement("div");
    fieldDiv.className = "variable-field";

    // Label
    const labelEl = document.createElement("label");
    labelEl.className = "variable-label";
    labelEl.setAttribute("for", `var-${id}`);
    labelEl.textContent = label || id;

    if (obligatoire) {
      const star = document.createElement("span");
      star.className = "obligatoire";
      star.textContent = "*";
      labelEl.appendChild(star);
    }

    // Input adapté au type
    let inputEl;
    if (type === "number") {
      inputEl = document.createElement("input");
      inputEl.type = "number";
    } else if (type === "file") {
      inputEl = document.createElement("input");
      inputEl.type = "file";
    } else {
      // text, geoloc, etc. → input texte simple
      inputEl = document.createElement("input");
      inputEl.type = "text";
    }

    inputEl.id = `var-${id}`;
    inputEl.dataset.varId = id;
    inputEl.dataset.varObligatoire = String(obligatoire);
    inputEl.placeholder = placeholder || "";

    // Mise à jour du modèle et du prompt à chaque modification
    inputEl.addEventListener("input", () => {
      currentVariablesValues[id] =
        inputEl.type === "file"
          ? inputEl.files?.[0]?.name || ""
          : inputEl.value;
      updatePromptPreview();
    });

    // Ajout dans le DOM
    fieldDiv.appendChild(labelEl);
    fieldDiv.appendChild(inputEl);
    container.appendChild(fieldDiv);
  });
}

// ------------------------------------------------------
// Construction du prompt final
// ------------------------------------------------------

function buildPrompt() {
  if (!currentFiche || !currentFiche.prompt) {
    return "";
  }

  let prompt = currentFiche.prompt;

  // Pour chaque variable, on remplace {{id}} dans le texte
  if (Array.isArray(currentFiche.variables)) {
    currentFiche.variables.forEach((v) => {
      if (!v.id) return;
      const value = currentVariablesValues[v.id] || "";
      const placeholder = new RegExp(`{{\\s*${escapeRegex(v.id)}\\s*}}`, "g");
      prompt = prompt.replace(placeholder, value);
    });
  }

  // Ajout des infos complémentaires si non vides
  const infosComplementaires = document.getElementById("infosComplementaires");
  const extra = infosComplementaires.value.trim();
  if (extra) {
    prompt += `\n\nInformations complémentaires : ${extra}`;
  }

  return prompt;
}

// Met à jour la zone de texte du prompt et l'état des boutons IA
function updatePromptPreview(scrollToPrompt = false) {
  const compiledPrompt = document.getElementById("compiledPrompt");
  const promptFinal = buildPrompt();
  compiledPrompt.value = promptFinal || "";

  // Mise à jour de l'état des boutons IA selon les champs obligatoires
  const allRequiredFilled = checkAllRequiredVariablesFilled();
  if (!allRequiredFilled) {
    // Désactive tout si les variables obligatoires ne sont pas remplies
    setIaButtonsDisableAll(
      "Veuillez remplir tous les champs obligatoires avant d'utiliser les IA."
    );
  } else {
    // Active/désactive selon les indices de confiance
    const indices = currentFiche?.indices_confiance || null;
    setIaButtonsState(indices);
  }

  if (scrollToPrompt) {
    compiledPrompt.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

// Vérifie si toutes les variables obligatoires ont une valeur
function checkAllRequiredVariablesFilled() {
  if (!currentFiche || !Array.isArray(currentFiche.variables)) return false;

  return currentFiche.variables.every((v) => {
    if (!v.obligatoire) return true;
    const value = currentVariablesValues[v.id];
    return value !== undefined && String(value).trim() !== "";
  });
}

// ------------------------------------------------------
// Gestion des boutons IA
// ------------------------------------------------------

// Désactive tous les boutons IA avec un message en console
function setIaButtonsDisableAll(reason) {
  const btnChatgpt = document.getElementById("btnChatgpt");
  const btnPerplexity = document.getElementById("btnPerplexity");
  const btnMistral = document.getElementById("btnMistral");

  [btnChatgpt, btnPerplexity, btnMistral].forEach((btn) => {
    btn.disabled = true;
    btn.classList.remove("btn-ia--level3", "btn-ia--level2");
    btn.classList.add("btn-ia--disabled");
  });

  if (reason) {
    console.info("IA désactivées :", reason);
  }
}

// Met à jour l'état des boutons IA selon les indices de confiance
function setIaButtonsState(indices) {
  const btnChatgpt = document.getElementById("btnChatgpt");
  const btnPerplexity = document.getElementById("btnPerplexity");
  const btnMistral = document.getElementById("btnMistral");

  // Aucune fiche → tout désactiver
  if (!currentFiche || !indices) {
    setIaButtonsDisableAll();
    return;
  }

  // Fonction utilitaire interne pour configurer chaque bouton
  const applyState = (btn, level) => {
    btn.classList.remove("btn-ia--level3", "btn-ia--level2", "btn-ia--disabled");

    if (level === 3) {
      btn.disabled = false;
      btn.classList.add("btn-ia--level3");
    } else if (level === 2) {
      btn.disabled = false;
      btn.classList.add("btn-ia--level2");
    } else {
      // Niveau 1 ou valeur invalide → désactivé
      btn.disabled = true;
      btn.classList.add("btn-ia--disabled");
    }
  };

  const levelChatgpt = normalizeIndice(indices.chatgpt);
  const levelPerplexity = normalizeIndice(indices.perplexity);
  const levelMistral = normalizeIndice(indices.mistral);

  applyState(btnChatgpt, levelChatgpt);
  applyState(btnPerplexity, levelPerplexity);
  applyState(btnMistral, levelMistral);
}

// Indice → 1/2/3
function normalizeIndice(value) {
  const n = Number(value);
  if (n === 3 || n === 2 || n === 1) return n;
  return 1;
}

// Ouverture de l'IA sélectionnée avec le prompt pré-rempli (si possible)
function openIa(iaKey) {
  if (!currentFiche) return;

  const promptFinal = buildPrompt();
  if (!promptFinal) {
    alert("Le prompt est vide. Veuillez remplir les champs de la fiche.");
    return;
  }

  const encoded = encodeURIComponent(promptFinal);
  let url = "";

  switch (iaKey) {
    case "chatgpt":
      url = `https://chatgpt.com/?q=${encoded}`;
      break;
    case "perplexity":
      url = `https://www.perplexity.ai/search?q=${encoded}`;
      break;
    case "mistral":
      url = `https://chat.mistral.ai/chat?q=${encoded}`;
      break;
    default:
      console.warn("IA inconnue :", iaKey);
      return;
  }

  window.open(url, "_blank", "noopener");
}

// ------------------------------------------------------
// Réinitialisation de la vue Scan
// ------------------------------------------------------

function resetScanView() {
  // Arrêt de la caméra
  stopCameraScan();

  // Reset modèle
  currentFiche = null;
  currentVariablesValues = {};

  // Reset UI
  document.getElementById("ficheMeta").textContent = "Aucune fiche scannée";
  document.getElementById("ficheMeta").classList.add("fiche-meta--empty");
  document.getElementById("variablesContainer").innerHTML = "";
  document.getElementById("infosComplementaires").value = "";
  document.getElementById("compiledPrompt").value = "";

  const cameraError = document.getElementById("cameraError");
  cameraError.hidden = true;
  cameraError.textContent = "";

  const qrFileInput = document.getElementById("qrFile");
  qrFileInput.value = "";

  setIaButtonsState(null);
}

// =============================
// Vue Création de fiche / QR
// =============================

function initCreateView() {
  const addVariableBtn = document.getElementById("addVariableBtn");
  const generateQrBtn = document.getElementById("generateQrBtn");
  const downloadQrBtn = document.getElementById("downloadQrBtn");

  // Ajout d'une première ligne de variable par défaut
  addVariableRow();

  addVariableBtn.addEventListener("click", () => {
    addVariableRow();
  });

  generateQrBtn.addEventListener("click", () => {
    generateJsonAndQr();
  });

  downloadQrBtn.addEventListener("click", () => {
    downloadGeneratedQr();
  });
}

// Ajoute une ligne de variable dans le builder (max 10)
function addVariableRow() {
  const builder = document.getElementById("variablesBuilder");
  const currentRows = builder.querySelectorAll(".variable-row");

  if (currentRows.length >= 10) {
    alert("Vous avez atteint le nombre maximal de 10 variables.");
    return;
  }

  const row = document.createElement("div");
  row.className = "variable-row";

  // Input : label (nom affiché)
  const inputLabel = document.createElement("input");
  inputLabel.type = "text";
  inputLabel.placeholder = "Label (ex : Code ONU)";

  // Input : id (utilisé dans le JSON et le prompt)
  const inputId = document.createElement("input");
  inputId.type = "text";
  inputId.placeholder = "Identifiant (ex : code_onu)";

  // Select : type
  const selectType = document.createElement("select");
  ["text", "number", "geoloc", "file"].forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    selectType.appendChild(opt);
  });

  // Champ "obligatoire" (checkbox)
  const requiredContainer = document.createElement("div");
  requiredContainer.className = "var-required";

  const checkboxRequired = document.createElement("input");
  checkboxRequired.type = "checkbox";

  const labelRequired = document.createElement("label");
  labelRequired.textContent = "Obligatoire";

  requiredContainer.appendChild(checkboxRequired);
  requiredContainer.appendChild(labelRequired);

  // Bouton suppression
  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "btn btn-secondary";
  deleteBtn.textContent = "Supprimer";
  deleteBtn.addEventListener("click", () => {
    row.remove();
  });

  row.appendChild(inputLabel);
  row.appendChild(inputId);
  row.appendChild(selectType);
  row.appendChild(requiredContainer);
  row.appendChild(deleteBtn);

  builder.appendChild(row);
}

// Génère le JSON et le QR code à partir du formulaire "création"
function generateJsonAndQr() {
  const errorBox = document.getElementById("createError");
  const jsonTextarea = document.getElementById("generatedJson");
  const qrContainer = document.getElementById("generatedQr");
  const downloadBtn = document.getElementById("downloadQrBtn");

  errorBox.hidden = true;
  errorBox.textContent = "";
  jsonTextarea.value = "";
  qrContainer.innerHTML = "";
  downloadBtn.disabled = true;

  // Récupère les champs principaux
  const categorie = document.getElementById("createCategorie").value.trim();
  const titre = document.getElementById("createTitre").value.trim();
  const objectif = document.getElementById("createObjectif").value.trim();
  const concepteur = document.getElementById("createConcepteur").value.trim();
  const dateMaj = document.getElementById("createDateMaj").value.trim();
  const version = document.getElementById("createVersion").value.trim();
  const prompt = document.getElementById("createPrompt").value;

  const indiceChatgpt = document.getElementById("indiceChatgpt").value;
  const indicePerplexity = document.getElementById(
    "indicePerplexity"
  ).value;
  const indiceMistral = document.getElementById("indiceMistral").value;

  // Validation minimale
  const errors = [];
  if (!titre) errors.push("Le titre de la fiche est obligatoire.");
  if (!objectif) errors.push("L'objectif de la fiche est obligatoire.");
  if (!concepteur) errors.push("Le nom du concepteur est obligatoire.");
  if (!version) errors.push("La version est obligatoire.");
  if (!prompt.trim()) errors.push("Le prompt de la fiche ne doit pas être vide.");

  // Récupération des variables
  const variables = [];
  const rows = document.querySelectorAll("#variablesBuilder .variable-row");
  const ids = new Set();

  rows.forEach((row, index) => {
    const inputs = row.querySelectorAll("input, select");

    const inputLabel = inputs[0];
    const inputId = inputs[1];
    const selectType = inputs[2];
    const checkboxRequired = inputs[3];

    const label = inputLabel.value.trim();
    const id = inputId.value.trim();
    const type = selectType.value;
    const obligatoire = checkboxRequired.checked;

    // On autorise les lignes vides (non remplies) à être ignorées
    if (!label && !id) return;

    if (!label) {
      errors.push(`Variable #${index + 1} : le label est obligatoire.`);
    }
    if (!id) {
      errors.push(`Variable #${index + 1} : l'identifiant est obligatoire.`);
    }
    if (id && ids.has(id)) {
      errors.push(
        `Variable #${index + 1} : l'identifiant "${id}" est déjà utilisé.`
      );
    }
    if (id) ids.add(id);

    variables.push({
      id,
      label,
      type,
      obligatoire
    });
  });

  if (errors.length > 0) {
    errorBox.textContent = errors.join(" ");
    errorBox.hidden = false;
    return;
  }

  // Construction de l'objet JSON final
  const ficheObject = {
    categorie: categorie || undefined,
    titre,
    objectif,
    variables,
    prompt,
    indices_confiance: {
      chatgpt: Number(indiceChatgpt),
      perplexity: Number(indicePerplexity),
      mistral: Number(indiceMistral)
    },
    concepteur,
    date_maj: dateMaj || undefined,
    version
  };

  // Nettoyage : supprime les clés undefined
  const cleaned = removeUndefined(ficheObject);

  // Conversion en JSON (formaté pour lecture)
  const jsonFormatted = JSON.stringify(cleaned, null, 2);
  jsonTextarea.value = jsonFormatted;

  // Génération du QR code (on peut minifier le JSON pour réduire la taille)
  const jsonMinified = JSON.stringify(cleaned);

  generatedQrInstance = new QRCode(qrContainer, {
    text: jsonMinified,
    width: 200,
    height: 200
  });

  downloadBtn.disabled = false;
}

// Téléchargement de l'image du QR code généré
function downloadGeneratedQr() {
  const qrContainer = document.getElementById("generatedQr");
  const canvas = qrContainer.querySelector("canvas");

  if (!canvas) {
    alert("Aucun QR code à télécharger.");
    return;
  }

  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = "fiche-ia-qr.png";
  link.click();
}

// =============================
// Utilitaires
// =============================

// Echappe les caractères spéciaux HTML
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Echappe une chaîne pour une expression régulière
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Supprime récursivement les clés dont la valeur est undefined
function removeUndefined(obj) {
  if (Array.isArray(obj)) {
    return obj.map(removeUndefined);
  }
  if (obj && typeof obj === "object") {
    const result = {};
    Object.keys(obj).forEach((key) => {
      const value = obj[key];
      if (value === undefined) return;
      result[key] = removeUndefined(value);
    });
    return result;
  }
  return obj;
}
