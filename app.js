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
  if (!window.pdfMake) {
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

async function imageToDataUrl(src) {
  const response = await fetch(src);
  const blob = await response.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

function answerText(value) {
  return value && String(value).trim() ? String(value).trim() : "Brak odpowiedzi";
}

function ratingText(value) {
  return value ? `${value} - ${scaleLabels[value]}` : "Brak odpowiedzi";
}

function sectionBlock(title, rows) {
  return [
    {
      text: title,
      style: "sectionTitle",
      margin: [0, 18, 0, 8],
    },
    {
      table: {
        widths: ["*", 150],
        body: rows.map(([question, answer]) => [
          { text: question, style: "questionCell" },
          { text: answerText(answer), style: "answerCell" },
        ]),
      },
      layout: {
        hLineColor: () => "#d9e2ec",
        vLineColor: () => "#d9e2ec",
        paddingLeft: () => 9,
        paddingRight: () => 9,
        paddingTop: () => 7,
        paddingBottom: () => 7,
      },
    },
  ];
}

function openAnswerBlock(title, answer) {
  return {
    margin: [0, 8, 0, 0],
    table: {
      widths: ["*"],
      body: [
        [{ text: title, style: "openQuestion" }],
        [{ text: answerText(answer), style: "openAnswer" }],
      ],
    },
    layout: {
      hLineColor: () => "#d9e2ec",
      vLineColor: () => "#d9e2ec",
      paddingLeft: () => 10,
      paddingRight: () => 10,
      paddingTop: () => 8,
      paddingBottom: () => 8,
    },
  };
}

async function buildPdfDefinition() {
  const data = getFormData();
  const generatedAt = new Date().toLocaleString("pl-PL");
  const averageRating = getAverageRating(data);
  const logoDataUrl = await imageToDataUrl("assets/logoebg.png");

  const sections = [
    ["Organizacja i logistyka", ratingGroups[0].items],
    ["Cele i realizacja programu", ratingGroups[1].items],
    ["Nabyte kompetencje i rezultaty", ratingGroups[2].items],
    ["Upowszechnianie rezultatów i wnioski", ratingGroups[3].items],
  ];

  const content = [
    {
      columns: [
        logoDataUrl
          ? { image: logoDataUrl, width: 168, margin: [0, 0, 20, 0] }
          : { text: "Education without borders", style: "logoFallback" },
        {
          width: "*",
          stack: [
            { text: "Ankieta ewaluacyjna mobilności kadry Erasmus+", style: "title" },
            { text: "Kalamata, Grecja 2026", style: "subtitle" },
          ],
        },
      ],
      columnGap: 18,
      margin: [0, 0, 0, 18],
    },
    {
      canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: "#d9e2ec" }],
      margin: [0, 0, 0, 14],
    },
    {
      table: {
        widths: ["*", "*", 95],
        body: [
          [
            { text: "Data wygenerowania", style: "metaLabel" },
            { text: "Temat szkolenia", style: "metaLabel" },
            { text: "Średnia ocen", style: "metaLabel" },
          ],
          [
            { text: generatedAt, style: "metaValue" },
            { text: answerText(data.trainingTopic), style: "metaValue" },
            { text: averageRating, style: "scoreValue" },
          ],
        ],
      },
      layout: {
        fillColor: (rowIndex) => (rowIndex === 0 ? "#e8f3f4" : "#ffffff"),
        hLineColor: () => "#c8d5e2",
        vLineColor: () => "#c8d5e2",
        paddingLeft: () => 9,
        paddingRight: () => 9,
        paddingTop: () => 8,
        paddingBottom: () => 8,
      },
      margin: [0, 0, 0, 10],
    },
    ...sectionBlock("Informacje ogólne", [
      ["Data udziału / zakończenia mobilności", data.mobilityDate],
      ["Rola uczestnika", data.participantRole],
    ]),
  ];

  sections.forEach(([title, items]) => {
    content.push(
      ...sectionBlock(
        title,
        items.map(([name, question]) => [question, ratingText(data[name])]),
      ),
    );
  });

  content.push(
    { text: "Pytania otwarte", style: "sectionTitle", margin: [0, 18, 0, 8] },
    openAnswerBlock("Największa wartość merytoryczna mobilności", data.value),
    openAnswerBlock("Konkretne umiejętności do wykorzystania po powrocie", data.skills),
    openAnswerBlock("Sposób upowszechniania wiedzy", data.sharingMethod),
    openAnswerBlock("Co wymaga poprawy w przyszłości", data.improvements),
  );

  const docDefinition = {
    pageSize: "A4",
    pageMargins: [40, 36, 40, 42],
    info: {
      title: "Ankieta ewaluacyjna mobilności kadry Erasmus+ - Kalamata, Grecja 2026",
      author: "Education without borders",
      subject: answerText(data.trainingTopic),
    },
    footer: (currentPage, pageCount) => ({
      columns: [
        { text: "Erasmus+ | Kalamata, Grecja 2026", alignment: "left" },
        { text: `Strona ${currentPage} z ${pageCount}`, alignment: "right" },
      ],
      margin: [40, 0],
      fontSize: 8,
      color: "#5f6f84",
    }),
    content,
    defaultStyle: {
      font: "Roboto",
      fontSize: 9,
      color: "#142033",
      lineHeight: 1.18,
    },
    styles: {
      title: { fontSize: 18, bold: true, color: "#174a7c", margin: [0, 8, 0, 4] },
      subtitle: { fontSize: 12, bold: true, color: "#0c7b83" },
      logoFallback: { fontSize: 12, bold: true, color: "#174a7c" },
      metaLabel: { bold: true, color: "#174a7c", fontSize: 8 },
      metaValue: { color: "#142033", fontSize: 9 },
      scoreValue: { color: "#174a7c", fontSize: 15, bold: true, alignment: "center" },
      sectionTitle: {
        fontSize: 12,
        bold: true,
        color: "#ffffff",
        fillColor: "#174a7c",
        margin: [0, 0, 0, 0],
      },
      questionCell: { bold: true, color: "#142033" },
      answerCell: { color: "#334155" },
      openQuestion: { bold: true, color: "#174a7c", fillColor: "#e8f3f4" },
      openAnswer: { color: "#334155", minHeight: 30 },
    },
  };

  return { docDefinition, data };
}

async function getPdfBase64(docDefinition) {
  return new Promise((resolve) => {
    pdfMake.createPdf(docDefinition).getBase64(resolve);
  });
}

async function downloadPdf() {
  if (!validateForm()) return null;
  downloadPdfButton.disabled = true;
  setMessage("Przygotowuję estetyczny PDF...", "");

  try {
    const { docDefinition, data } = await buildPdfDefinition();
    pdfMake.createPdf(docDefinition).download(getPdfFileName(data));
    setMessage("PDF został wygenerowany i pobrany.", "success");
    return { docDefinition, data };
  } catch (error) {
    setMessage("Nie udało się wygenerować PDF. Spróbuj ponownie za chwilę.", "error");
    return null;
  } finally {
    downloadPdfButton.disabled = false;
  }
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
    const { docDefinition, data } = await buildPdfDefinition();
    const pdfBase64 = await getPdfBase64(docDefinition);
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
