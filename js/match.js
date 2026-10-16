// js/match.js

const TRIBUTES_KEY = "tributesWritten"; // IndexedDB key: array of classmate IDs user has written for

const SPECIALTIES = [
  // Surgical
  "General Surgery", "Cardiothoracic Surgery", "Neurosurgery", "Vascular Surgery",
  "Urology", "Plastic Surgery", "Orthopedics", "ENT", "Ophthalmology",
  "Pediatric Surgery", "Maxillofacial Surgery", "Transplant Surgery", "Trauma Surgery",
  // Medical
  "Internal Medicine", "Cardiology", "Gastroenterology", "Hematology", "Nephrology",
  "Pulmonology", "Endocrinology", "Rheumatology", "Infectious Diseases", "Oncology",
  "Geriatrics", "Neurology", "Psychiatry", "Dermatology", "Pediatrics", "OB/GYN",
  "Emergency Medicine", "ICU / Critical Care", "Anesthesiology", "Radiology",
  "Pathology", "Family Medicine", "Public Health", "Medical Research", "Not sure yet"
];

// Word limits per field
const LIMITS = {
  howKnow: 100,
  happyMemory: 150,
  goodThings: 150,
  advice: 150,
  oneWord: 1
};

document.addEventListener("DOMContentLoaded", async () => {
  const session = await idbKeyval.get("gateSession");
  if (!session || !session.groupCode) {
    window.location.href = "index.html";
    return;
  }

  const visitorId = await idbKeyval.get("visitorId");
  const groupCode = session.groupCode;
  const codeId = session.codeId;

  let classmates = [];
  let totalClassmates = 0;

  // Elements
  const landingView = document.getElementById("landingView");
  const formView = document.getElementById("formView");
  const viewTributeView = document.getElementById("viewTributeView");
  const loadingState = document.getElementById("loadingState");
  const progressCount = document.getElementById("progressCount");
  const progressFill = document.getElementById("progressFill");
  const seeClassmatesBtn = document.getElementById("seeClassmatesBtn");
  const backToLandingBtn = document.getElementById("backToLandingBtn");
  const backToLandingBtn2 = document.getElementById("backToLandingBtn2");
  const recentSection = document.getElementById("recentSection");
  const recentList = document.getElementById("recentList");

  // Modal elements
  const classmatesModal = document.getElementById("classmatesModal");
  const closeClassmatesModal = document.getElementById("closeClassmatesModal");
  const classmateSearch = document.getElementById("classmateSearch");
  const classmatesList = document.getElementById("classmatesList");

  // Form elements
  const tributeForm = document.getElementById("tributeForm");
  const specialtySelect = document.getElementById("specialtySelect");
  const submitBtn = document.getElementById("submitBtn");
  const formMessage = document.getElementById("formMessage");

  // Populate specialties dropdown
  SPECIALTIES.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    specialtySelect.appendChild(opt);
  });

  // State
  let writtenSet = new Set(); // classmate IDs user has written for
  let currentClassmate = null;
  let currentTribute = null;

  await initialize();

  async function initialize() {
    try {
      // ✅ Fetch real classmates from DB to ensure IDs match exactly
      const { data: fetchedClassmates, error: cErr } = await sb
        .from("classmates")
        .select("id, name")
        .eq("group_code", groupCode)
        .eq("active", true)
        .order("name");

      if (cErr) throw cErr;
      classmates = fetchedClassmates || [];
      totalClassmates = classmates.length;

      // Fetch user's existing tributes
      const { data: myTributes, error } = await sb
        .from("tributes")
        .select("id, classmate_id, status, specialty, one_word")
        .eq("owner_code_id", codeId);

      if (error) throw error;

      // Merge with IndexedDB
      const localWritten = (await idbKeyval.get(TRIBUTES_KEY)) || [];
      writtenSet = new Set(localWritten);
      if (myTributes) {
        myTributes.forEach(t => writtenSet.add(t.classmate_id));
      }
      await idbKeyval.set(TRIBUTES_KEY, Array.from(writtenSet));

      loadingState.hidden = true;
      landingView.hidden = false;
      
      updateProgress();
      await loadRecentTributes();

    } catch (err) {
      console.error("Init error:", err);
      loadingState.innerHTML = "<p>Failed to load. Please refresh.</p>";
    }
  }

  function updateProgress() {
    const count = writtenSet.size;
    progressCount.textContent = `${count} / ${totalClassmates}`;
    const percent = (count / totalClassmates) * 100;
    progressFill.style.width = `${percent}%`;
  }

  async function loadRecentTributes() {
    try {
      const { data: tributes, error } = await sb
        .from("tributes")
        .select("id, classmate_id, specialty, status, created_at")
        .eq("owner_code_id", codeId)
        .order("created_at", { ascending: false })
        .limit(3);

      if (error) throw error;

      if (!tributes || tributes.length === 0) {
        recentSection.hidden = true;
        return;
      }

      recentSection.hidden = false;
      recentList.innerHTML = tributes.map(t => {
        const classmate = classmates.find(c => c.id === t.classmate_id);
        const name = classmate ? classmate.name : "Unknown";
        return `
          <div class="recent-item" data-classmate-id="${t.classmate_id}">
            <span class="recent-name">${escapeHtml(name)}</span>
            <span class="recent-specialty">${escapeHtml(t.specialty)}</span>
          </div>
        `;
      }).join("");

      // Attach click handlers
      recentList.querySelectorAll(".recent-item").forEach(item => {
        item.addEventListener("click", () => {
          const id = parseInt(item.dataset.classmateId);
          const classmate = classmates.find(c => c.id === id);
          if (classmate) showViewTribute(classmate);
        });
      });

    } catch (err) {
      console.error("Recent tributes error:", err);
    }
  }

  // =========================
  // MODAL LOGIC
  // =========================
  seeClassmatesBtn.addEventListener("click", openClassmatesModal);
  closeClassmatesModal.addEventListener("click", closeClassmatesModalFn);
  classmatesModal.addEventListener("click", (e) => {
    if (e.target === classmatesModal) closeClassmatesModalFn();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && classmatesModal.classList.contains("is-visible")) {
      closeClassmatesModalFn();
    }
  });

  function openClassmatesModal() {
    renderClassmatesList("");
    classmateSearch.value = "";
    classmatesModal.classList.add("is-visible");
    document.body.classList.add("modal-open");
    setTimeout(() => classmateSearch.focus(), 100);
  }

  function closeClassmatesModalFn() {
    classmatesModal.classList.remove("is-visible");
    document.body.classList.remove("modal-open");
  }

  classmateSearch.addEventListener("input", () => {
    renderClassmatesList(classmateSearch.value.trim().toLowerCase());
  });

  function renderClassmatesList(query) {
    let filtered = classmates;
    if (query) {
      const queryWords = query.split(/\s+/).filter(w => w.length > 0);
      filtered = classmates.filter(c => {
        const nameLower = c.name.toLowerCase();
        return queryWords.every(word => nameLower.includes(word));
      });
    }

    if (filtered.length === 0) {
      classmatesList.innerHTML = `<div class="modal-empty">No classmates found</div>`;
      return;
    }

    classmatesList.innerHTML = filtered.map(c => {
      const written = writtenSet.has(c.id);
      return `
        <div class="classmate-item" data-id="${c.id}">
          <span class="classmate-name">${escapeHtml(c.name)}</span>
          <span class="classmate-badge ${written ? 'written' : 'not-written'}">
            ${written ? '✓ Written' : '✎ Write'}
          </span>
        </div>
      `;
    }).join("");

    classmatesList.querySelectorAll(".classmate-item").forEach(item => {
      item.addEventListener("click", () => {
        const id = parseInt(item.dataset.id);
        const classmate = classmates.find(c => c.id === id);
        if (classmate) handleClassmateClick(classmate);
      });
    });
  }

  async function handleClassmateClick(classmate) {
    closeClassmatesModalFn();
    currentClassmate = classmate;

    if (writtenSet.has(classmate.id)) {
      // Already written - fetch and show tribute
      await showViewTribute(classmate);
    } else {
      showForm(classmate);
    }
  }

  // =========================
  // FORM VIEW
  // =========================
  function showForm(classmate) {
    formView.hidden = false;
    landingView.hidden = true;
    viewTributeView.hidden = true;

    document.getElementById("formClassmateName").textContent = classmate.name;
    
    // Reset form
    tributeForm.reset();
    submitBtn.disabled = true;
    formMessage.hidden = true;
    
    // Reset word counts
    tributeForm.querySelectorAll(".word-count-num, .char-count-num").forEach(el => {
      el.textContent = "0";
    });
    tributeForm.querySelectorAll(".word-count").forEach(el => {
      el.classList.remove("warning");
    });

    // Attach word count listeners
    attachWordCountListeners();
    
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function attachWordCountListeners() {
    const fields = [
      { id: "howKnowInput", limit: LIMITS.howKnow, type: "words" },
      { id: "happyMemoryInput", limit: LIMITS.happyMemory, type: "words" },
      { id: "goodThingsInput", limit: LIMITS.goodThings, type: "words" },
      { id: "adviceInput", limit: LIMITS.advice, type: "words" },
      { id: "oneWordInput", limit: LIMITS.oneWord, type: "words" }
    ];

    fields.forEach(f => {
      const input = document.getElementById(f.id);
      const counter = input.parentElement.querySelector(".word-count-num");
      const counterWrap = input.parentElement.querySelector(".word-count");

      input.addEventListener("input", () => {
        const text = input.value.trim();
        const count = f.type === "words" 
          ? (text === "" ? 0 : text.split(/\s+/).length)
          : text.length;

        counter.textContent = count;

        if (count > f.limit) {
          counterWrap.classList.add("warning");
        } else {
          counterWrap.classList.remove("warning");
        }

        validateForm();
      });
    });

    // Signature (char count)
    const sigInput = document.getElementById("signatureInput");
    const sigCounter = sigInput.parentElement.querySelector(".char-count-num");
    sigInput.addEventListener("input", () => {
      sigCounter.textContent = sigInput.value.length;
    });

    // Specialty
    specialtySelect.addEventListener("change", validateForm);
  }

  function validateForm() {
    const specialty = specialtySelect.value;
    const oneWord = document.getElementById("oneWordInput").value.trim();
    const oneWordCount = oneWord === "" ? 0 : oneWord.split(/\s+/).length;
    
    // Check all word limits
    const howKnow = document.getElementById("howKnowInput").value.trim();
    const happyMemory = document.getElementById("happyMemoryInput").value.trim();
    const goodThings = document.getElementById("goodThingsInput").value.trim();
    const advice = document.getElementById("adviceInput").value.trim();

    const howKnowCount = howKnow === "" ? 0 : howKnow.split(/\s+/).length;
    const happyMemoryCount = happyMemory === "" ? 0 : happyMemory.split(/\s+/).length;
    const goodThingsCount = goodThings === "" ? 0 : goodThings.split(/\s+/).length;
    const adviceCount = advice === "" ? 0 : advice.split(/\s+/).length;

    const withinLimits = 
      howKnowCount <= LIMITS.howKnow &&
      happyMemoryCount <= LIMITS.happyMemory &&
      goodThingsCount <= LIMITS.goodThings &&
      adviceCount <= LIMITS.advice &&
      oneWordCount <= LIMITS.oneWord;

    const required = specialty && oneWordCount === 1 && withinLimits;
    submitBtn.disabled = !required;
  }

  tributeForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    formMessage.hidden = true;

    const data = {
      classmate_id: currentClassmate.id,
      group_code: groupCode,
      owner_code_id: codeId,
      owner_visitor_id: visitorId,
      specialty: specialtySelect.value,
      how_know: document.getElementById("howKnowInput").value.trim() || null,
      happy_memory: document.getElementById("happyMemoryInput").value.trim() || null,
      good_things: document.getElementById("goodThingsInput").value.trim() || null,
      one_word: document.getElementById("oneWordInput").value.trim(),
      advice: document.getElementById("adviceInput").value.trim() || null,
      signature_phrase: document.getElementById("signatureInput").value.trim() || null,
      status: "pending"
    };

    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";

    try {
      const { error } = await sb.from("tributes").insert(data);

      if (error) {
        if (error.code === "23505") {
          showMessage("You already wrote a tribute for this classmate.", "success");
          await markAsWritten(currentClassmate.id);
          setTimeout(() => showViewTribute(currentClassmate), 1500);
          return;
        }
        throw error;
      }

      await markAsWritten(currentClassmate.id);
      showMessage("✓ Tribute sent! It will be delivered after admin approval.", "success");
      updateProgress();
      await loadRecentTributes();

      setTimeout(() => showViewTribute(currentClassmate), 1800);

    } catch (err) {
      console.error("Tribute submit error:", err);
      showMessage("Failed to send. Please try again.", "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Tribute";
    }
  });

  async function markAsWritten(classmateId) {
    writtenSet.add(classmateId);
    const local = (await idbKeyval.get(TRIBUTES_KEY)) || [];
    if (!local.includes(classmateId)) {
      local.push(classmateId);
      await idbKeyval.set(TRIBUTES_KEY, local);
    }
  }

  function showMessage(text, type) {
    formMessage.textContent = text;
    formMessage.className = `form-message ${type}`;
    formMessage.hidden = false;
  }

  // =========================
  // VIEW TRIBUTE
  // =========================
  async function showViewTribute(classmate) {
    viewTributeView.hidden = false;
    formView.hidden = true;
    landingView.hidden = true;

    document.getElementById("viewClassmateName").textContent = classmate.name;

    try {
      const { data, error } = await sb
        .from("tributes")
        .select("*")
        .eq("classmate_id", classmate.id)
        .eq("owner_code_id", codeId)
        .limit(1);

      if (error) throw error;

      if (!data || data.length === 0) {
        // Fallback - shouldn't happen but just in case
        document.getElementById("tributeContent").innerHTML = 
          `<div class="tribute-empty">Tribute not found. Please try again.</div>`;
        return;
      }

      const tribute = data[0];
      currentTribute = tribute;

      // Status badge
      // Status badge
      const statusEl = document.getElementById("tributeStatus");
      statusEl.className = `tribute-status ${tribute.status}`;
      statusEl.textContent = tribute.status === "approved" ? "✓ Approved" : 
                             tribute.status === "rejected" ? "✗ Rejected" : 
                             "⏳ Pending Approval";

      // Render content
      const content = document.getElementById("tributeContent");
      content.innerHTML = `
        <div class="tribute-item">
          <div class="tribute-item-label">Specialty Match</div>
          <div class="tribute-item-value specialty">${escapeHtml(tribute.specialty)}</div>
        </div>

        <div class="tribute-item">
          <div class="tribute-item-label">How I Know You</div>
          <div class="tribute-item-value">${tribute.how_know ? escapeHtml(tribute.how_know) : '<span class="tribute-empty">Not specified</span>'}</div>
        </div>

        <div class="tribute-item">
          <div class="tribute-item-label">Happy Memory</div>
          <div class="tribute-item-value">${tribute.happy_memory ? escapeHtml(tribute.happy_memory) : '<span class="tribute-empty">Not specified</span>'}</div>
        </div>

        <div class="tribute-item">
          <div class="tribute-item-label">Good Things I See in You</div>
          <div class="tribute-item-value">${tribute.good_things ? escapeHtml(tribute.good_things) : '<span class="tribute-empty">Not specified</span>'}</div>
        </div>

        <div class="tribute-item">
          <div class="tribute-item-label">One Word to Describe You</div>
          <div class="tribute-item-value one-word">"${escapeHtml(tribute.one_word)}"</div>
        </div>

        <div class="tribute-item">
          <div class="tribute-item-label">My Advice to You</div>
          <div class="tribute-item-value">${tribute.advice ? escapeHtml(tribute.advice) : '<span class="tribute-empty">Not specified</span>'}</div>
        </div>

        <div class="tribute-item">
          <div class="tribute-item-label">Your Signature Phrase</div>
          <div class="tribute-item-value">${tribute.signature_phrase ? escapeHtml(tribute.signature_phrase) : '<span class="tribute-empty">Not specified</span>'}</div>
        </div>
      `;

      window.scrollTo({ top: 0, behavior: "smooth" });

    } catch (err) {
      console.error("View tribute error:", err);
      document.getElementById("tributeContent").innerHTML = 
        `<div class="tribute-empty">Error loading tribute.</div>`;
    }
  }

  // =========================
  // NAVIGATION
  // =========================
  function goBackToLanding() {
    formView.hidden = true;
    viewTributeView.hidden = true;
    landingView.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  backToLandingBtn.addEventListener("click", goBackToLanding);
  backToLandingBtn2.addEventListener("click", goBackToLanding);

  // =========================
  // HELPERS
  // =========================
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
});