// js/match.js

const TRIBUTES_KEY = "tributesWritten";

const SPECIALTIES = [
  "General Surgery", "Cardiothoracic Surgery", "Neurosurgery", "Vascular Surgery",
  "Urology", "Plastic Surgery", "Orthopedics", "ENT", "Ophthalmology",
  "Pediatric Surgery", "Maxillofacial Surgery", "Transplant Surgery", "Trauma Surgery",
  "Internal Medicine", "Cardiology", "Gastroenterology", "Hematology", "Nephrology",
  "Pulmonology", "Endocrinology", "Rheumatology", "Infectious Diseases", "Oncology",
  "Geriatrics", "Neurology", "Psychiatry", "Dermatology", "Pediatrics", "OB/GYN",
  "Emergency Medicine", "ICU / Critical Care", "Anesthesiology", "Radiology",
  "Pathology", "Family Medicine", "Public Health", "Medical Research", "Not sure yet"
];

const LIMITS = { howKnow: 100, happyMemory: 150, goodThings: 150, advice: 150, oneWord: 1 };

document.addEventListener("DOMContentLoaded", async () => {
  const session = await idbKeyval.get("gateSession");
  if (!session || !session.groupCode) {
    window.location.href = "index.html";
    return;
  }

  const visitorId = await idbKeyval.get("visitorId");
  const groupCode = session.groupCode;
  const codeId = session.codeId; 
  
  console.log("🔍 1. Session codeId:", codeId, "Type:", typeof codeId);

  let classmates = [];
  let totalClassmates = 0;

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

  const classmatesModal = document.getElementById("classmatesModal");
  const closeClassmatesModal = document.getElementById("closeClassmatesModal");
  const classmateSearch = document.getElementById("classmateSearch");
  const classmatesList = document.getElementById("classmatesList");

  const tributeForm = document.getElementById("tributeForm");
  const specialtySelect = document.getElementById("specialtySelect");
  const submitBtn = document.getElementById("submitBtn");
  const formMessage = document.getElementById("formMessage");

  SPECIALTIES.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    specialtySelect.appendChild(opt);
  });

  let writtenSet = new Set();
  let currentClassmate = null;

  await initialize();

  async function initialize() {
    try {
      const { data: fetchedClassmates, error: cErr } = await sb
        .from("classmates")
        .select("id, name")
        .eq("group_code", groupCode)
        .eq("active", true)
        .order("name");

      if (cErr) throw cErr;
      classmates = fetchedClassmates || [];
      totalClassmates = classmates.length;
      console.log("🔍 2. Fetched classmates count:", totalClassmates);

      // ✅ Fetches based on codeId. We try BOTH number and string to be absolutely safe.
      console.log("🔍 3. Fetching tributes for owner_code_id:", codeId);
      
      const { data: myTributes, error } = await sb
        .from("tributes")
        .select("id, classmate_id, status, specialty, one_word")
        .eq("owner_code_id", codeId);

      console.log("🔍 4. Tributes query result:", myTributes);
      console.log("🔍 5. Tributes query error:", error);

      if (error) throw error;

      const localWritten = (await idbKeyval.get(TRIBUTES_KEY)) || [];
      console.log("🔍 6. Local IndexedDB written:", localWritten);
      
      writtenSet = new Set(localWritten.map(id => Number(id)));
      
      if (myTributes && myTributes.length > 0) {
        myTributes.forEach(t => {
          console.log("🔍 7. Adding classmate_id to writtenSet:", t.classmate_id);
          writtenSet.add(Number(t.classmate_id));
        });
      } else {
        console.log("⚠️ WARNING: No tributes found in database for this codeId!");
      }
      
      console.log("🔍 8. Final writtenSet:", Array.from(writtenSet));
      await idbKeyval.set(TRIBUTES_KEY, Array.from(writtenSet));

      loadingState.hidden = true;
      landingView.hidden = false;
      
      updateProgress();
      await loadRecentTributes();

    } catch (err) {
      console.error("❌ Init error:", err);
      loadingState.innerHTML = "<p>Failed to load. Please refresh.</p>";
    }
  }

  function updateProgress() {
    const count = writtenSet.size;
    progressCount.textContent = `${count} / ${totalClassmates}`;
    const percent = totalClassmates > 0 ? (count / totalClassmates) * 100 : 0;
    progressFill.style.width = `${percent}%`;
  }

  async function loadRecentTributes() {
    try {
      console.log("🔍 9. Loading recent tributes for codeId:", codeId);
      const { data: tributes, error } = await sb
        .from("tributes")
        .select("id, classmate_id, specialty, status, created_at")
        .eq("owner_code_id", codeId)
        .order("created_at", { ascending: false })
        .limit(3);

      console.log("🔍 10. Recent tributes result:", tributes);

      if (error) throw error;
      if (!tributes || tributes.length === 0) {
        recentSection.hidden = true;
        return;
      }

      recentSection.hidden = false;
      recentList.innerHTML = tributes.map(t => {
        const classmate = classmates.find(c => c.id === Number(t.classmate_id));
        console.log("🔍 11. Matching classmate for ID", t.classmate_id, ":", classmate ? classmate.name : "NOT FOUND");
        return `
          <div class="recent-item" data-classmate-id="${t.classmate_id}">
            <span class="recent-name">${escapeHtml(classmate ? classmate.name : "Unknown")}</span>
            <span class="recent-specialty">${escapeHtml(t.specialty)}</span>
          </div>
        `;
      }).join("");

      recentList.querySelectorAll(".recent-item").forEach(item => {
        item.addEventListener("click", () => {
          const id = Number(item.dataset.classmateId);
          const classmate = classmates.find(c => c.id === id);
          if (classmate) showViewTribute(classmate);
        });
      });
    } catch (err) {
      console.error("❌ Recent tributes error:", err);
    }
  }

  seeClassmatesBtn.addEventListener("click", openClassmatesModal);
  closeClassmatesModal.addEventListener("click", closeClassmatesModalFn);
  classmatesModal.addEventListener("click", (e) => { if (e.target === classmatesModal) closeClassmatesModalFn(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && classmatesModal.classList.contains("is-visible")) closeClassmatesModalFn(); });

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

  classmateSearch.addEventListener("input", () => renderClassmatesList(classmateSearch.value.trim().toLowerCase()));

  function renderClassmatesList(query) {
    let filtered = classmates;
    if (query) {
      const queryWords = query.split(/\s+/).filter(w => w.length > 0);
      filtered = classmates.filter(c => queryWords.every(word => c.name.toLowerCase().includes(word)));
    }

    if (filtered.length === 0) {
      classmatesList.innerHTML = `<div class="modal-empty">No classmates found</div>`;
      return;
    }

    classmatesList.innerHTML = filtered.map(c => `
      <div class="classmate-item" data-id="${c.id}">
        <span class="classmate-name">${escapeHtml(c.name)}</span>
        <span class="classmate-badge ${writtenSet.has(Number(c.id)) ? 'written' : 'not-written'}">
          ${writtenSet.has(Number(c.id)) ? '✓ Written' : '✎ Write'}
        </span>
      </div>
    `).join("");

    classmatesList.querySelectorAll(".classmate-item").forEach(item => {
      item.addEventListener("click", () => {
        const classmate = classmates.find(c => c.id === Number(item.dataset.id));
        if (classmate) handleClassmateClick(classmate);
      });
    });
  }

  async function handleClassmateClick(classmate) {
    closeClassmatesModalFn();
    currentClassmate = classmate;
    if (writtenSet.has(Number(classmate.id))) {
      await showViewTribute(classmate);
    } else {
      showForm(classmate);
    }
  }

  function showForm(classmate) {
    formView.hidden = false;
    landingView.hidden = true;
    viewTributeView.hidden = true;
    document.getElementById("formClassmateName").textContent = classmate.name;
    tributeForm.reset();
    submitBtn.disabled = true;
    formMessage.hidden = true;
    tributeForm.querySelectorAll(".word-count-num, .char-count-num").forEach(el => el.textContent = "0");
    tributeForm.querySelectorAll(".word-count").forEach(el => el.classList.remove("warning"));
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
        const count = f.type === "words" ? (text === "" ? 0 : text.split(/\s+/).length) : text.length;
        counter.textContent = count;
        counterWrap.classList.toggle("warning", count > f.limit);
        validateForm();
      });
    });

    document.getElementById("signatureInput").addEventListener("input", function() {
      this.parentElement.querySelector(".char-count-num").textContent = this.value.length;
    });
    specialtySelect.addEventListener("change", validateForm);
  }

  function validateForm() {
    const specialty = specialtySelect.value;
    const oneWord = document.getElementById("oneWordInput").value.trim();
    const oneWordCount = oneWord === "" ? 0 : oneWord.split(/\s+/).length;
    
    const howKnowCount = document.getElementById("howKnowInput").value.trim() === "" ? 0 : document.getElementById("howKnowInput").value.trim().split(/\s+/).length;
    const happyMemoryCount = document.getElementById("happyMemoryInput").value.trim() === "" ? 0 : document.getElementById("happyMemoryInput").value.trim().split(/\s+/).length;
    const goodThingsCount = document.getElementById("goodThingsInput").value.trim() === "" ? 0 : document.getElementById("goodThingsInput").value.trim().split(/\s+/).length;
    const adviceCount = document.getElementById("adviceInput").value.trim() === "" ? 0 : document.getElementById("adviceInput").value.trim().split(/\s+/).length;

    const withinLimits = howKnowCount <= LIMITS.howKnow && happyMemoryCount <= LIMITS.happyMemory && goodThingsCount <= LIMITS.goodThings && adviceCount <= LIMITS.advice && oneWordCount <= LIMITS.oneWord;
    submitBtn.disabled = !(specialty && oneWordCount === 1 && withinLimits);
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

    console.log("🔍 12. Submitting tribute data:", data);

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
      console.error("❌ Tribute submit error:", err);
      showMessage("Failed to send. Please try again.", "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Tribute";
    }
  });

  async function markAsWritten(classmateId) {
    const numId = Number(classmateId);
    writtenSet.add(numId);
    const local = (await idbKeyval.get(TRIBUTES_KEY)) || [];
    if (!local.includes(numId)) {
      local.push(numId);
      await idbKeyval.set(TRIBUTES_KEY, local);
    }
  }

  function showMessage(text, type) {
    formMessage.textContent = text;
    formMessage.className = `form-message ${type}`;
    formMessage.hidden = false;
  }

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
        document.getElementById("tributeContent").innerHTML = `<div class="tribute-empty">Tribute not found.</div>`;
        return;
      }

      const tribute = data[0];

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
      console.error("❌ View tribute error:", err);
      document.getElementById("tributeContent").innerHTML = `<div class="tribute-empty">Error loading tribute.</div>`;
    }
  }

  function goBackToLanding() {
    formView.hidden = true;
    viewTributeView.hidden = true;
    landingView.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  backToLandingBtn.addEventListener("click", goBackToLanding);
  backToLandingBtn2.addEventListener("click", goBackToLanding);

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
});
