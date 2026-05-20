const SEND_ENDPOINT = "";
const RECIPIENT = "lukasz.w.malinowski@gmail.com";
const STORAGE_KEY = "erasmus-kalamata-2026-survey";

const scaleLabels = {
  1: "zdecydowanie nie",
  2: "raczej nie",
  3: "trudno powiedzieć",
  4: "raczej tak",
  5: "zdecydowanie tak",
};

const ratingGroups = [
  {
    target: "logisticsRatings",
    items: [
      ["logistics_info", "Informacje przed wyjazdem były jasne i wystarczające."],
      ["logistics_travel", "Organizacja podróży i pobytu była sprawna."],
      ["logistics_support", "Wsparcie organizacyjne podczas mobilności było adekwatne."],
      ["logistics_conditions", "Warunki realizacji szkolenia sprzyjały uczeniu się."],
    ],
  },
  {
    target: "programRatings",
    items: [
      ["program_goals", "Program szkolenia był zgodny z celami mobilności."],
      ["program_needs", "Zakres zajęć odpowiadał moim potrzebom zawodowym."],
      ["program_methods", "Metody pracy były angażujące i dobrze dobrane."],
      ["program_practice", "Program zawierał wystarczająco dużo elementów praktycznych."],
    ],
  },
  {
    target: "resultsRatings",
    items: [
      ["results_knowledge", "Mobilność zwiększyła moją wiedzę w wybranym obszarze."],
      ["results_skills", "Rozwinąłem/Rozwinęłam umiejętności przydatne w pracy."],
      ["results_confidence", "Czuję się pewniej we wdrażaniu poznanych rozwiązań."],
      ["results_institution", "Rezultaty szkolenia mogą wesprzeć rozwój mojej instytucji."],
    ],
  },
  {
    target: "sharingRatings",
    items: [
      ["sharing_plan", "Mam jasny plan wykorzystania rezultatów po powrocie."],
      ["sharing_team", "Wiedza ze szkolenia będzie możliwa do przekazania innym osobom."],
      ["sharing_recommend", "Polecił(a)bym udział w podobnej mobilności innym pracownikom."],
    ],
  },
];

const form = document.querySelector("#surveyForm");
const progressBar = document.querySelector("#progressBar");
const progressText = document.querySelector("#progressText");
const messageBox = document.querySelector("#messageBox");
const saveStatus = document.querySelector("#saveStatus");
const downloadPdfButton = document.querySelector("#downloadPdfButton");
const sendPdfButton = document.querySelector("#sendPdfButton");
const clearButton = document.querySelector("#clearButton");
const installButton = document.querySelector("#installButton");
const offlineStatus = document.querySelector("#offlineStatus");

let deferredInstallPrompt = null;

function createRatings() {
  ratingGroups.forEach((group) => {
    const container = document.querySelector(`#${group.target}`);
    container.innerHTML = group.items.map(([name, question]) => ratingTemplate(name, question)).join("");
  });
}

function ratingTemplate(name, question) {
  const options = Object.entries(scaleLabels)
    .map(
      ([value, label]) => `
        <input type="radio" id="${name}_${value}" name="${name}" value="${value}" required />
        <label for="${name}_${value}">
          <strong>${value}</strong>
          <small>${label}</small>
        </label>
      `,
    )
    .join("");

  return `
    <fieldset class="rating-question">
      <legend>${question}</legend>
      <div class="rating-options">${options}</div>
    </fieldset>
  `;
}

function getFormData() {
  const data = {};
  new FormData(form).forEach((value, key) => {
    data[key] = value;
  });
  return data;
}

function restoreForm() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return;

  let data = {};
  try {
    data = JSON.parse(saved);
  } catch (error) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }

  Object.entries(data).forEach(([key, value]) => {
    const field = form.elements[key];
    if (!field) return;

    if (field instanceof RadioNodeList) {
      const radio = form.querySelector(`[name="${key}"][value="${CSS.escape(value)}"]`);
      if (radio) radio.checked = true;
      return;
    }

    field.value = value;
  });
}

function saveDraft() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(getFormData()));
  saveStatus.textContent = `Zapisano roboczo: ${new Date().toLocaleTimeString("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function updateProgress() {
  const requiredFields = [...form.querySelectorAll("[required]")];
  const completed = requiredFields.filter((field) => {
    if (field.type === "radio") {
      return Boolean(form.querySelector(`[name="${field.name}"]:checked`));
    }
    return Boolean(field.value.trim());
  });

  const uniqueRequired = new Set(requiredFields.map((field) => field.name));
  const uniqueCompleted = new Set(completed.map((field) => field.name));
  const percent = uniqueRequired.size
    ? Math.round((uniqueCompleted.size / uniqueRequired.size) * 100)
    : 0;

  progressBar.style.width = `${percent}%`;
  progressText.textContent = `${percent}%`;
}

function setMessage(text, type = "") {
  messageBox.textContent = text;
  messageBox.className = `message ${type}`.trim();
}

function getRatingQuestions() {
  return ratingGroups.flatMap((group) =>
    group.items.map(([name, question]) => ({
      name,
      question,
    })),
  );
}

function getAverageRating(data) {
  const values = getRatingQuestions()
    .map((item) => Number(data[item.name]))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (!values.length) return "Brak ocen";
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return average.toFixed(2);
}

function safeFilePart(value) {
  return (value || "bez_tematu")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 70);
}

function getPdfFileName(data) {
  const date = new Date().toISOString().slice(0, 10);
  return `ankieta_erasmus_kalamata_2026_${safeFilePart(data.trainingTopic)}_${date}.pdf`;
}

function validateForm() {
  if (!window.jspdf) {
    setMessage(
      "Moduł PDF nie jest jeszcze dostępny. Odśwież stronę po połączeniu z internetem i spróbuj ponownie.",
      "error",
    );
    return false;
  }

  if (form.reportValidity()) return true;
  setMessage("Uzupełnij wymagane pola, aby wygenerować kompletny PDF.", "error");
  return false;
}

function addWrappedText(doc, text, x, y, maxWidth, lineHeight) {
  const cleanText = String(text || "Brak odpowiedzi");
  const lines = doc.splitTextToSize(cleanText, maxWidth);
  lines.forEach((line) => {
    if (y > 275) {
      doc.addPage();
      y = 22;
    }
    doc.text(line, x, y);
    y += lineHeight;
  });
  return y;
}

function addSectionTitle(doc, title, y) {
  if (y > 260) {
    doc.addPage();
    y = 22;
  }
  doc.setFillColor(232, 243, 244);
  doc.rect(14, y - 6, 182, 10, "F");
  doc.setTextColor(23, 74, 124);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(title, 18, y + 1);
  doc.setTextColor(20, 32, 51);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  return y + 12;
}

function buildPdf() {
  const data = getFormData();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const generatedAt = new Date().toLocaleString("pl-PL");
  const maxWidth = 176;
  let y = 20;

  doc.setFillColor(23, 74, 124);
  doc.rect(0, 0, 210, 30, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  y = addWrappedText(
    doc,
    "Ankieta ewaluacyjna mobilności kadry Erasmus+ - Kalamata, Grecja 2026",
    14,
    13,
    182,
    6,
  );

  y = 42;
  doc.setTextColor(20, 32, 51);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Data wygenerowania: ${generatedAt}`, 14, y);
  y += 7;
  doc.text(`Temat szkolenia: ${data.trainingTopic || "Brak odpowiedzi"}`, 14, y);
  y += 7;
  doc.text(`Średnia ocen z pytań zamkniętych: ${getAverageRating(data)}`, 14, y);
  y += 12;

  y = addSectionTitle(doc, "Informacje ogólne", y);
  y = addQuestion(doc, "Data udziału / zakończenia mobilności", data.mobilityDate, y);
  y = addQuestion(doc, "Rola uczestnika", data.participantRole, y);

  const sections = [
    ["Organizacja i logistyka", ratingGroups[0].items],
    ["Cele i realizacja programu", ratingGroups[1].items],
    ["Nabyte kompetencje i rezultaty", ratingGroups[2].items],
    ["Upowszechnianie rezultatów i wnioski", ratingGroups[3].items],
  ];

  sections.forEach(([title, items]) => {
    y = addSectionTitle(doc, title, y + 2);
    items.forEach(([name, question]) => {
      const value = data[name] ? `${data[name]} - ${scaleLabels[data[name]]}` : "Brak odpowiedzi";
      y = addQuestion(doc, question, value, y);
    });
  });

  y = addSectionTitle(doc, "Pytania otwarte", y + 2);
  y = addQuestion(doc, "Największa wartość merytoryczna mobilności", data.value, y);
  y = addQuestion(doc, "Konkretne umiejętności do wykorzystania po powrocie", data.skills, y);
  y = addQuestion(doc, "Sposób upowszechniania wiedzy", data.sharingMethod, y);
  addQuestion(doc, "Co wymaga poprawy w przyszłości", data.improvements, y);

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(95, 111, 132);
    doc.text(`Strona ${page} z ${pageCount}`, 174, 289);
  }

  return { doc, data };
}

function addQuestion(doc, question, answer, y) {
  if (y > 260) {
    doc.addPage();
    y = 22;
  }
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 32, 51);
  doc.setFontSize(10);
  y = addWrappedText(doc, question, 14, y, 182, 5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 73, 91);
  y = addWrappedText(doc, answer || "Brak odpowiedzi", 18, y + 1, 174, 5);
  return y + 4;
}

function downloadPdf() {
  if (!validateForm()) return null;
  const { doc, data } = buildPdf();
  doc.save(getPdfFileName(data));
  setMessage("PDF został wygenerowany i pobrany.", "success");
  return { doc, data };
}

async function sendPdf() {
  if (!validateForm()) return;
  if (!SEND_ENDPOINT) {
    setMessage(
      "Automatyczna wysyłka nie została skonfigurowana. Pobierz PDF i prześlij go do koordynatora.",
      "error",
    );
    return;
  }

  sendPdfButton.disabled = true;
  setMessage("Przygotowuję PDF do wysyłki...", "");

  try {
    const { doc, data } = buildPdf();
    const pdfBase64 = doc.output("datauristring").split(",")[1];
    const response = await fetch(SEND_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: RECIPIENT,
        subject: "Ankieta ewaluacyjna mobilności Erasmus+ - Kalamata 2026",
        pdfBase64,
        formData: data,
      }),
    });

    if (!response.ok) throw new Error("Wysyłka nie powiodła się.");
    setMessage("PDF został wysłany do koordynatora.", "success");
  } catch (error) {
    setMessage("Nie udało się wysłać PDF. Pobierz plik i prześlij go ręcznie.", "error");
  } finally {
    sendPdfButton.disabled = false;
  }
}

function updateOnlineStatus() {
  const isOnline = navigator.onLine;
  offlineStatus.textContent = isOnline ? "Online" : "Offline";
  offlineStatus.classList.toggle("offline", !isOnline);
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js");
  }
}

createRatings();
restoreForm();
updateProgress();
updateOnlineStatus();
registerServiceWorker();

form.addEventListener("input", () => {
  saveDraft();
  updateProgress();
});

form.addEventListener("change", () => {
  saveDraft();
  updateProgress();
});

downloadPdfButton.addEventListener("click", downloadPdf);
sendPdfButton.addEventListener("click", sendPdf);

clearButton.addEventListener("click", () => {
  if (!confirm("Czy na pewno wyczyścić zapisane odpowiedzi?")) return;
  form.reset();
  localStorage.removeItem(STORAGE_KEY);
  updateProgress();
  setMessage("Formularz został wyczyszczony.", "success");
  saveStatus.textContent = "Odpowiedzi zapisują się automatycznie na tym urządzeniu.";
});

window.addEventListener("online", updateOnlineStatus);
window.addEventListener("offline", updateOnlineStatus);

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.hidden = false;
});

installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installButton.hidden = true;
});
