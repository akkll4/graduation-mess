// js/qa.js

const QA_ANSWERED_KEY = "qaAnsweredQuestions";
const MAX_WORDS = 150;

document.addEventListener("DOMContentLoaded", async () => {
  const session = await idbKeyval.get("gateSession");
  if (!session || !session.groupCode) {
    window.location.href = "index.html";
    return;
  }

  const visitorId = await idbKeyval.get("visitorId");
  const groupCode = session.groupCode;
  const codeId = session.codeId; // ✅ Correctly defined

  const loadingState = document.getElementById("loadingState");
  const emptyState = document.getElementById("emptyState");
  const questionsList = document.getElementById("questionsList");

  const repliesModal = document.getElementById("repliesModal");
  const modalQuestionText = document.getElementById("modalQuestionText");
  const modalRepliesList = document.getElementById("modalRepliesList");
  const closeModalBtn = document.getElementById("closeModalBtn");

  if (closeModalBtn) {
    closeModalBtn.addEventListener("click", (e) => {
      e.preventDefault();
      closeModal();
    });
  }

  if (repliesModal) {
    repliesModal.addEventListener("click", (e) => {
      if (e.target === repliesModal) closeModal();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && repliesModal.classList.contains("is-visible")) {
      closeModal();
    }
  });

  await loadAllData();

  async function loadAllData() {
    try {
      const { data: questions, error: qError } = await sb
        .from("qa_questions")
        .select("id, question_text, sort_order")
        .eq("group_code", groupCode)
        .eq("active", true)
        .order("sort_order", { ascending: true });

      if (qError) throw qError;

      if (!questions || questions.length === 0) {
        loadingState.hidden = true;
        emptyState.hidden = false;
        return;
      }

      const questionIds = questions.map((q) => q.id);

      const { data: answers, error: aError } = await sb
        .from("qa_answers")
        .select("id, question_id, content, created_at")
        .in("question_id", questionIds)
        .eq("status", "approved")
        .order("created_at", { ascending: false });

      if (aError) throw aError;

      // ✅ Fetches based on codeId for cross-device sync
      const { data: myAnswers, error: myError } = await sb
        .from("qa_answers")
        .select("question_id")
        .eq("owner_code_id", codeId);

      if (myError) throw myError;

      const localAnswered = (await idbKeyval.get(QA_ANSWERED_KEY)) || [];
      const userAnsweredSet = new Set(localAnswered);
      if (myAnswers) myAnswers.forEach((a) => userAnsweredSet.add(a.question_id));
      await idbKeyval.set(QA_ANSWERED_KEY, Array.from(userAnsweredSet));

      const answersByQuestion = {};
      if (answers) {
        answers.forEach((a) => {
          if (!answersByQuestion[a.question_id]) answersByQuestion[a.question_id] = [];
          answersByQuestion[a.question_id].push(a);
        });
      }

      loadingState.hidden = true;
      questionsList.hidden = false;

      questions.forEach((q) => {
        const card = createQuestionCard(q, answersByQuestion[q.id] || [], userAnsweredSet.has(q.id));
        questionsList.appendChild(card);
      });

    } catch (err) {
      console.error("Error loading Q&A:", err);
      loadingState.innerHTML = `<p>Failed to load questions. Error: ${err.message || "Unknown"}</p>`;
    }
  }

  function createQuestionCard(question, approvedAnswers, hasAnswered) {
    const card = document.createElement("div");
    card.className = "question-card" + (hasAnswered ? " answered" : "");
    card.dataset.questionId = question.id;
    const answerCount = approvedAnswers.length;

    card.innerHTML = `
      <div class="question-top">
        <div class="question-number">Q${question.sort_order}</div>
        <div class="question-text">${escapeHtml(question.question_text)}</div>
      </div>
      <div class="answer-count-badge">💬 ${answerCount} ${answerCount === 1 ? "answer" : "answers"}</div>
      <div class="question-actions">
        <button class="qa-btn qa-btn-answer" data-action="answer" ${hasAnswered ? "disabled" : ""}>
          ${hasAnswered ? "✓ You Answered" : "✍️ Answer This"}
        </button>
        <button class="qa-btn qa-btn-replies" data-action="replies">👁️ Show Replies</button>
      </div>
      <div class="answer-form-wrapper" data-section="answer-form">
        <form class="answer-form" data-question-id="${question.id}">
          <label>Your anonymous reply (max ${MAX_WORDS} words)</label>
          <textarea placeholder="Share your memory..." maxlength="2000" required></textarea>
          <div class="word-count"><span class="word-count-num">0</span> / ${MAX_WORDS} words</div>
          <div class="answer-form-actions">
            <button type="button" class="qa-btn qa-btn-cancel" data-action="cancel">Cancel</button>
            <button type="submit" class="qa-btn qa-btn-submit" disabled>Submit Answer</button>
          </div>
          <div class="answer-success" hidden></div>
          <div class="answer-error" hidden></div>
        </form>
      </div>
    `;

    const answerBtn = card.querySelector('[data-action="answer"]');
    const answerFormWrapper = card.querySelector('[data-section="answer-form"]');
    const repliesBtn = card.querySelector('[data-action="replies"]');

    if (!hasAnswered) {
      answerBtn.addEventListener("click", () => answerFormWrapper.classList.toggle("open"));
    }

    repliesBtn.addEventListener("click", () => openModal(question.question_text, approvedAnswers));

    const cancelBtn = card.querySelector('[data-action="cancel"]');
    cancelBtn.addEventListener("click", () => {
      answerFormWrapper.classList.remove("open");
      const form = card.querySelector(".answer-form");
      form.reset();
      form.querySelector(".word-count-num").textContent = "0";
      form.querySelector(".qa-btn-submit").disabled = true;
      hideFormMessages(form);
    });

    const form = card.querySelector(".answer-form");
    const textarea = form.querySelector("textarea");
    const wordCountNum = form.querySelector(".word-count-num");
    const submitBtn = form.querySelector(".qa-btn-submit");

    textarea.addEventListener("input", () => {
      const text = textarea.value.trim();
      const words = text === "" ? 0 : text.split(/\s+/).length;
      wordCountNum.textContent = words;
      const wordCountEl = form.querySelector(".word-count");
      if (words > MAX_WORDS) {
        wordCountEl.classList.add("warning");
        submitBtn.disabled = true;
      } else if (words === 0) {
        wordCountEl.classList.remove("warning");
        submitBtn.disabled = true;
      } else {
        wordCountEl.classList.remove("warning");
        submitBtn.disabled = false;
      }
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      hideFormMessages(form);
      const text = textarea.value.trim();
      const words = text === "" ? 0 : text.split(/\s+/).length;

      if (words > MAX_WORDS || words === 0) {
        showFormMessage(form, "error", "Please check your word count.");
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting...";

      try {
        const { error } = await sb.from("qa_answers").insert({
          question_id: question.id,
          content: text,
          group_code: groupCode,
          owner_code_id: codeId, // ✅ Uses codeId
          owner_visitor_id: visitorId,
          status: "pending",
        });

        if (error) {
          if (error.code === "23505") {
            markAsAnswered(card, question.id);
            showFormMessage(form, "success", "You already answered this question.");
            return;
          }
          throw error;
        }

        await saveAnsweredLocally(question.id);
        markAsAnswered(card, question.id);
        showFormMessage(form, "success", "✓ Answer sent! It will appear after admin approval.");

        setTimeout(() => {
          answerFormWrapper.classList.remove("open");
          form.reset();
          wordCountNum.textContent = "0";
        }, 2000);

      } catch (err) {
        console.error("Answer submit error:", err);
        showFormMessage(form, "error", "Failed to send. Please try again.");
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Answer";
      }
    });

    return card;
  }

  function openModal(questionText, answers) {
    modalQuestionText.textContent = questionText;
    if (answers.length === 0) {
      modalRepliesList.innerHTML = `<div class="replies-empty">No replies yet. Be the first to answer!</div>`;
    } else {
      modalRepliesList.innerHTML = answers.map(a => `
        <div class="reply-item">
          <div class="reply-content">${escapeHtml(a.content)}</div>
          <div class="reply-meta">📅 ${formatDate(a.created_at)}</div>
        </div>
      `).join("");
    }
    repliesModal.classList.add("is-visible");
    document.body.classList.add("modal-open");
  }

  function closeModal() {
    repliesModal.classList.remove("is-visible");
    document.body.classList.remove("modal-open");
  }

  async function saveAnsweredLocally(questionId) {
    const localAnswered = (await idbKeyval.get(QA_ANSWERED_KEY)) || [];
    if (!localAnswered.includes(questionId)) {
      localAnswered.push(questionId);
      await idbKeyval.set(QA_ANSWERED_KEY, localAnswered);
    }
  }

  function markAsAnswered(card, questionId) {
    card.classList.add("answered");
    const answerBtn = card.querySelector('[data-action="answer"]');
    answerBtn.disabled = true;
    answerBtn.innerHTML = "✓ You Answered";
    const answerFormWrapper = card.querySelector('[data-section="answer-form"]');
    answerFormWrapper.classList.remove("open");
    const newBtn = answerBtn.cloneNode(true);
    answerBtn.parentNode.replaceChild(newBtn, answerBtn);
  }

  function showFormMessage(form, type, text) {
    const successEl = form.querySelector(".answer-success");
    const errorEl = form.querySelector(".answer-error");
    successEl.hidden = true;
    errorEl.hidden = true;
    if (type === "success") {
      successEl.textContent = text;
      successEl.hidden = false;
    } else {
      errorEl.textContent = text;
      errorEl.hidden = false;
    }
  }

  function hideFormMessages(form) {
    form.querySelector(".answer-success").hidden = true;
    form.querySelector(".answer-error").hidden = true;
  }

  function formatDate(dateString) {
    try {
      return new Date(dateString).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch { return ""; }
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
});
