// ======================================================
// Mémento opérationnel IA – RCH
// app.js — Version 0.3.1
// ------------------------------------------------------
// - Instance unique Html5Qrcode (caméra + fichier)
// - Scan fichier et scan caméra unifiés
// - Création JSON + QR code (inchangée)
// ------------------------------------------------------

let html5QrCode = null;          // Instance html5-qrcode globale
let isCameraRunning = false;     // Indique si la caméra est active
let currentFiche = null;         // Fiche courante (JSON issu du QR)
let currentVariablesValues = {}; // Valeurs saisies des variables

// =============================
// Initialisation au chargement
// =============================

document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  initScanView();
  initCreateView();
});

// ------------------------------------------------------
// Helper : s'assure qu'on a une instance Html5Qrcode
// ------------------------------------------------------
function ensureHtml5QrCodeInstance() {
  const cameraElementId = "camera";
  if (!html5QrCode) {
    html5QrCode = new Html5Qrcode(cameraElementId);
  }
  return html5QrCode;
}

// =============================
// Gestion des onglets
// =============================

function initTabs() {
  const tabButtons = document.querySelectorAll(".tab-button");
  const tabPanels = document.querySelectorAll(".tab-panel");

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-tab");

      tabButtons.forEach((b) => b.classList.remove("tab-button--active"));
      btn.classList.add("tab-button--active");

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

  cameraBtn.addEventListener("click", () => {
    startCameraScan();
  });

  scanBtn.addEventListener("click", () => {
    if (!isCameraRunning) {
      startCameraScan();
    }
  });

  resetBtn.addEventListener("click", () => {
    resetScanView();
  });

  qrFileInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (file) {
      scanQrFromFile(file);
    }
  });

  infosComplementaires.addEventListener("input", () => {
    updatePromptPreview();
  });

  generatePromptBtn.addEventListener("click", () => {
    updatePromptPreview(true);
  });

  btnChatgpt.addEventListener("click", () => openIa("chatgpt"));
  btnPerplexity.addEventListener("click", () => openIa("perplexity"));
  btnMistral.addEventListener("click", () => openIa("mistral"));

  setIaButtonsState(null);
}

// ------------------------------------------------------
// Lancement du scan caméra avec html5-qrcode
// ------------------------------------------------------

function startCameraScan() {
  const cameraError = document.getElementById("cameraError");
  const videoBox = document.getElementById("videoBox");

  cameraError.hidden = true;

  // Déjà en cours → on ne relance pas
  if (isCameraRunning) return;

  // Affiche la zone vidéo
  videoBox.hidden = false;

  const qr = ensureHtml5QrCodeInstance();

  Html5Qrcode.getCameras()
    .then((devices) => {
      if (!devices || devices.length === 0) {
        throw new Error("Aucune caméra disponible.");
      }

      const backCamera = devices.find((d) =>
        d.label.toLowerCase().includes("back")
      );
      const cameraId = backCamera ? backCamera.id : devices[0].id;

      return qr.start(
        cameraId,
        { fps: 10, qrbox: 250 },
        (decodedText) => {
          handleQrDecoded(decodedText);
          stopCameraScan();
        },
        (errorMessage) => {
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
  const videoBox = document.getElementById("videoBox");

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

  videoBox.hidden = true;
}

// ------------------------------------------------------
// Scan d'un QR à partir d'un fichier image
// ------------------------------------------------------

function scanQrFromFile(file) {
  const cameraError = document.getElementById("cameraError");
  cameraError.hidden = true;

  try {
    const qr = ensureHtml5QrCodeInstance();

    if (isCameraRunning) {
      stopCameraScan();
    }

    qr
      .scanFile(file, false)
      .then((decodedText) => {
        handleQrDecoded(decodedText);
        // Nettoyage de l'instance pour éviter les blocages
        qr.clear();
        html5QrCode = null;
      })
      .catch((err) => {
        cameraError.textContent =
          "Impossible de lire le QR depuis le fichier : " + (err?.message || err);
        cameraError.hidden = false;
      });
  } catch (err) {
    cameraError.textContent =
      "Erreur lors de l'initialisation du lecteur de fichier : " + (err?.message || err);
    cameraError.hidden = false;
  }
}

// ------------------------------------------------------
// Traitement du texte décodé depuis le QR
// ------------------------------------------------------

function handleQrDecoded(decodedText) {
  let json;
  try {
    json = JSON.parse(decodedText);
  } catch (e) {
    alert("Le QR code ne contient pas un JSON valide.\nDétail : " + e.message);
    return;
  }

  currentFiche = json;
  currentVariablesValues = {};

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

  const lines = [];
  if (categorie) lines.push("<strong>" + escapeHtml(categorie) + "</strong>");
  if (titre) lines.push("<span>" + escapeHtml(titre) + "</span>");
  if (objectif) lines.push("<br><em>" + escapeHtml(objectif) + "</em>");
  if (version || date_maj || concepteur) {
    const metaParts = [];
    if (version) metaParts.push("Version " + escapeHtml(version));
    if (date_maj) metaParts.push("MAJ : " + escapeHtml(date_maj));
    if (concepteur) metaParts.push("Concepteur : " + escapeHtml(concepteur));
    lines.push("<br><span>" + metaParts.join(" — ") + "</span>");
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

    if (!id) return;

    const fieldDiv = document.createElement("div");
    fieldDiv.className = "variable-field";

    const labelEl = document.createElement("label");
    labelEl.className = "variable-label";
    labelEl.setAttribute("for", "var-" + id);
    labelEl.textContent = label || id;

    if (obligatoire) {
      const star = document.createElement("span");
      star.className = "obligatoire";
      star.textContent = "*";
      labelEl.appendChild(star);
    }

    let inputEl;
    if (type === "number") {
      inputEl = document.createElement("input");
      inputEl.type = "number";
    } else if (type === "file") {
      inputEl = document.createElement("input");
      inputEl.type = "file";
    } else {
      inputEl = document.createElement("input");
      inputEl.type = "text";
    }

    inputEl.id = "var-" + id;
    inputEl.dataset.varId = id;
    inputEl.dataset.varObligatoire = String(obligatoire);
    inputEl.placeholder = placeholder || "";

    inputEl.addEventListener("input", () => {
      currentVariablesValues[id] =
        inputEl.type === "file"
          ? (inputEl.files && inputEl.files[0] && inputEl.files[0].name) || ""
          : inputEl.value;
      updatePromptPreview();
    });

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

  if (Array.isArray(currentFiche.variables)) {
    currentFiche.variables.forEach((v) => {
      if (!v.id) return;
      const value = currentVariablesValues[v.id] || "";
      const placeholder = new RegExp("{{\s*" + escapeRegex(v.id) + "\s*}}", "g");
      prompt = prompt.replace(placeholder, value);
    });
  }

  const infosComplementaires = document.getElementById("infosComplementaires");
  const extra = infosComplementaires.value.trim();
  if (extra) {
    prompt += "\n\nInformations complémentaires : " + extra;
  }

  return prompt;
}

// Met à jour la zone de texte du prompt et l'état des boutons IA
function updatePromptPreview(scrollToPrompt = false) {
  const compiledPrompt = document.getElementById("compiledPrompt");
  const promptFinal = buildPrompt();
  compiledPrompt.value = promptFinal || "";

  const allRequiredFilled = checkAllRequiredVariablesFilled();
  if (!allRequiredFilled) {
    setIaButtonsDisableAll(
      "Veuillez remplir tous les champs obligatoires avant d'utiliser les IA."
    );
  } else {
    const indices = currentFiche && currentFiche.indices_confiance;
    setIaButtonsState(indices || null);
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

function setIaButtonsState(indices) {
  const btnChatgpt = document.getElementById("btnChatgpt");
  const btnPerplexity = document.getElementById("btnPerplexity");
  const btnMistral = document.getElementById("btnMistral");

  if (!currentFiche || !indices) {
    setIaButtonsDisableAll();
    return;
  }

  const applyState = (btn, level) => {
    btn.classList.remove("btn-ia--level3", "btn-ia--level2", "btn-ia--disabled");

    if (level === 3) {
      btn.disabled = false;
      btn.classList.add("btn-ia--level3");
    } else if (level === 2) {
      btn.disabled = false;
      btn.classList.add("btn-ia--level2");
    } else {
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

function normalizeIndice(value) {
  const n = Number(value);
  if (n === 3 || n === 2 || n === 1) return n;
  return 1;
}

// Ouverture de l'IA sélectionnée avec le prompt pré-rempli
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
      url = "https://chatgpt.com/?q=" + encoded;
      break;
    case "perplexity":
      url = "https://www.perplexity.ai/search?q=" + encoded;
      break;
    case "mistral":
      url = "https://chat.mistral.ai/chat?q=" + encoded;
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
  stopCameraScan();

  currentFiche = null;
  currentVariablesValues = {};

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

  const inputLabel = document.createElement("input");
  inputLabel.type = "text";
  inputLabel.placeholder = "Label (ex : Code ONU)";

  const inputId = document.createElement("input");
  inputId.type = "text";
  inputId.placeholder = "Identifiant (ex : code_onu)";

  const selectType = document.createElement("select");
  ["text", "number", "geoloc", "file"].forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    selectType.appendChild(opt);
  });

  const requiredContainer = document.createElement("div");
  requiredContainer.className = "var-required";

  const checkboxRequired = document.createElement("input");
  checkboxRequired.type = "checkbox";

  const labelRequired = document.createElement("label");
  labelRequired.textContent = "Obligatoire";

  requiredContainer.appendChild(checkboxRequired);
  requiredContainer.appendChild(labelRequired);

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

  const categorie = document.getElementById("createCategorie").value.trim();
  const titre = document.getElementById("createTitre").value.trim();
  const objectif = document.getElementById("createObjectif").value.trim();
  const concepteur = document.getElementById("createConcepteur").value.trim();
  const dateMaj = document.getElementById("createDateMaj").value.trim();
  const version = document.getElementById("createVersion").value.trim();
  const prompt = document.getElementById("createPrompt").value;

  const indiceChatgpt = document.getElementById("indiceChatgpt").value;
  const indicePerplexity = document.getElementById("indicePerplexity").value;
  const indiceMistral = document.getElementById("indiceMistral").value;

  const errors = [];
  if (!titre) errors.push("Le titre de la fiche est obligatoire.");
  if (!objectif) errors.push("L'objectif de la fiche est obligatoire.");
  if (!concepteur) errors.push("Le nom du concepteur est obligatoire.");
  if (!version) errors.push("La version est obligatoire.");
  if (!prompt.trim()) errors.push("Le prompt de la fiche ne doit pas être vide.");

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

    if (!label && !id) return;

    if (!label) {
      errors.push("Variable #" + (index + 1) + " : le label est obligatoire.");
    }
    if (!id) {
      errors.push("Variable #" + (index + 1) + " : l'identifiant est obligatoire.");
    }
    if (id && ids.has(id)) {
      errors.push(
        'Variable #' +
        (index + 1) +
        ' : l\'identifiant "' +
        id +
        '" est déjà utilisé.'
      );
    }
    if (id) ids.add(id);

    variables.push({
      id: id,
      label: label,
      type: type,
      obligatoire: obligatoire
    });
  });

  if (errors.length > 0) {
    errorBox.textContent = errors.join(" ");
    errorBox.hidden = false;
    return;
  }

  const ficheObject = {
    categorie: categorie || undefined,
    titre: titre,
    objectif: objectif,
    variables: variables,
    prompt: prompt,
    indices_confiance: {
      chatgpt: Number(indiceChatgpt),
      perplexity: Number(indicePerplexity),
      mistral: Number(indiceMistral)
    },
    concepteur: concepteur,
    date_maj: dateMaj || undefined,
    version: version
  };

  const cleaned = removeUndefined(ficheObject);

  const jsonFormatted = JSON.stringify(cleaned, null, 2);
  jsonTextarea.value = jsonFormatted;

  const jsonMinified = JSON.stringify(cleaned);

  if (typeof QRCode !== "function") {
    alert(
      "La librairie QRCode n'est pas disponible. Vérifiez le chargement du script qrcodejs."
    );
    return;
  }

  qrContainer.innerHTML = "";
  new QRCode("generatedQr", {
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

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
