// js/votes.js

const VOTES_VOTED_KEY = "votesVotedQuestions";

document.addEventListener("DOMContentLoaded", async () => {
  const session = await idbKeyval.get("gateSession");
  if (!session || !session.groupCode) {
    window.location.href = "index.html";
    return;
  }

  const visitorId = await idbKeyval.get("visitorId");
  const groupCode = session.groupCode;
  const codeId = session.codeId;

  const loadingState = document.getElementById("loadingState");
  const emptyState = document.getElementById("emptyState");
  const allDoneState = document.getElementById("allDoneState");
  const questionsList = document.getElementById("questionsList");
  const progressSection = document.getElementById("progressSection");
  const progressCount = document.getElementById("progressCount");
  const progressFill = document.getElementById("progressFill");

  let questions = [];
  let votedSet = new Set();
  let totalQuestions = 0;

  // 🚀 INSTANT LOAD: Use local data instead of fetching from DB
  let localClassmates = [];

  await loadData();

  async function loadData() {
    try {
      // ✅ Fetch real classmates from DB to ensure IDs match exactly
      const { data: fetchedClassmates, error: cErr } = await sb
        .from("classmates")
        .select("id, name")
        .eq("group_code", groupCode)
        .eq("active", true)
        .order("name");

      if (cErr) throw cErr;
      localClassmates = fetchedClassmates || [];

      const { data: qs, error: qError } = await sb
        .from("vote_questions")
        .select("id, question_text, category, sort_order")
        .eq("group_code", groupCode)
        .eq("active", true);

      if (qError) throw qError;

      if (!qs || qs.length === 0) {
        loadingState.hidden = true;
        emptyState.hidden = false;
        return;
      }

      // 🎲 Shuffle questions randomly
      questions = shuffleArray([...qs]);
      totalQuestions = questions.length;

      // Fetch user's already voted questions
      const { data: myVotes, error: vError } = await sb
        .from("votes")
        .select("question_id")
        .eq("voter_code_id", codeId);

      if (vError) throw vError;

      const localVoted = (await idbKeyval.get(VOTES_VOTED_KEY)) || [];
      votedSet = new Set(localVoted);
      if (myVotes) myVotes.forEach((v) => votedSet.add(v.question_id));
      await idbKeyval.set(VOTES_VOTED_KEY, Array.from(votedSet));

      progressSection.hidden = false;
      updateProgress();

      loadingState.hidden = true;
      questionsList.hidden = false;

      questions.forEach((q, index) => {
        const card = createVoteCard(q, index + 1, votedSet.has(q.id), localClassmates);
        questionsList.appendChild(card);
      });

      if (votedSet.size >= totalQuestions) {
        allDoneState.hidden = false;
      }

    } catch (err) {
      console.error("Error loading votes:", err);
      loadingState.innerHTML = `<p>Failed to load questions. Please refresh.</p>`;
    }
  }

  function updateProgress() {
    const count = votedSet.size;
    progressCount.textContent = `${count} / ${totalQuestions}`;
    const percent = (count / totalQuestions) * 100;
    progressFill.style.width = `${percent}%`;
  }

function createVoteCard(question, displayNumber, hasVoted, classmates) {
  const card = document.createElement("div");
  card.className = "vote-card" + (hasVoted ? " voted" : "");
  card.dataset.questionId = question.id;

  const categoryLabel = {
    personality: "Personality",
    medical: "Medical Career",
    habits: "Habits & General"
  }[question.category] || question.category;

  card.innerHTML = `
    <div class="vote-top">
      <div class="vote-number" style="${hasVoted ? 'background: #2e7d32;' : ''}">Q${displayNumber}</div>
      <div>
        <div class="vote-text">${escapeHtml(question.question_text)}</div>
        <span class="vote-category ${question.category}">${categoryLabel}</span>
      </div>
    </div>

    ${hasVoted ? `
      <div class="voted-badge">✓ You already voted on this question</div>
    ` : `
      <div class="choices-container">
        ${createChoiceSlot(1)}
        ${createChoiceSlot(2)}
        ${createChoiceSlot(3)}
      </div>
      <button class="vote-submit-btn" disabled>Submit Vote</button>
      <div class="vote-message" hidden></div>
    `}
  `;

  if (!hasVoted) {
    attachSearchLogic(card, question.id, classmates);
  }

  return card;
}

  function createChoiceSlot(rank) {
    const points = rank === 1 ? "3 pts" : rank === 2 ? "2 pts" : "1 pt";
    return `
      <div class="choice-slot" data-rank="${rank}">
        <div class="choice-label">
          <span class="rank-badge rank-${rank}">${rank}</span>
          <span>${rank === 1 ? "1st Choice" : rank === 2 ? "2nd Choice" : "3rd Choice"}</span>
          <span class="points">${points}</span>
        </div>
        <div class="search-wrapper">
          <span class="search-icon">🔍</span>
          <input type="text" class="search-input" placeholder="Type a name..." data-rank="${rank}" autocomplete="off" />
          <div class="search-dropdown" data-rank="${rank}"></div>
        </div>
      </div>
    `;
  }

  function attachSearchLogic(card, questionId, classmates) {
    const slots = card.querySelectorAll(".choice-slot");
    const selections = { 1: null, 2: null, 3: null };

    slots.forEach((slot) => {
      const rank = parseInt(slot.dataset.rank);
      const input = slot.querySelector(".search-input");
      const dropdown = slot.querySelector(".search-dropdown");

      input.addEventListener("input", () => {
        const query = input.value.trim().toLowerCase();
        if (query.length === 0) {
          dropdown.classList.remove("open");
          return;
        }

        const queryWords = query.split(/\s+/).filter(w => w.length > 0);
        
        const matches = classmates.filter((c) => {
          if (selections[1]?.id === c.id || selections[2]?.id === c.id || selections[3]?.id === c.id) return false;
          const nameLower = c.name.toLowerCase();
          return queryWords.every(word => nameLower.includes(word));
        }).slice(0, 15);

        if (matches.length === 0) {
          dropdown.innerHTML = `<div class="search-empty">No matches found</div>`;
        } else {
          dropdown.innerHTML = matches.map((c) => {
            const highlighted = highlightMatches(c.name, queryWords);
            return `<div class="search-option" data-id="${c.id}" data-name="${escapeHtml(c.name)}">${highlighted}</div>`;
          }).join("");
        }

        dropdown.classList.add("open");

        dropdown.querySelectorAll(".search-option").forEach((opt) => {
          opt.addEventListener("click", () => {
            const id = parseInt(opt.dataset.id);
            const name = opt.dataset.name;
            selectName(rank, id, name);
          });
        });
      });

      document.addEventListener("click", (e) => {
        if (!slot.contains(e.target)) dropdown.classList.remove("open");
      });

      function selectName(rank, id, name) {
        selections[rank] = { id, name };
        const wrapper = slot.querySelector(".search-wrapper");
        
        // ✅ FIXED: Added data-classmate-id to retrieve it on submit
        wrapper.innerHTML = `
          <div class="selected-badge" data-classmate-id="${id}">
            <span>${escapeHtml(name)}</span>
            <button type="button" class="remove-btn" aria-label="Remove">✕</button>
          </div>
        `;

        wrapper.querySelector(".remove-btn").addEventListener("click", () => {
          selections[rank] = null;
          wrapper.innerHTML = `
            <span class="search-icon">🔍</span>
            <input type="text" class="search-input" placeholder="Type a name..." data-rank="${rank}" autocomplete="off" />
            <div class="search-dropdown" data-rank="${rank}"></div>
          `;
          // Re-attach logic to the new input
          const newInput = wrapper.querySelector(".search-input");
          const newDropdown = wrapper.querySelector(".search-dropdown");
          
          newInput.addEventListener("input", () => {
             // (Same logic as above, simplified for brevity - it works identically)
             const q = newInput.value.trim().toLowerCase();
             if (!q) { newDropdown.classList.remove("open"); return; }
             const qWords = q.split(/\s+/).filter(w => w.length > 0);
             const m = classmates.filter((c) => {
               if (selections[1]?.id === c.id || selections[2]?.id === c.id || selections[3]?.id === c.id) return false;
               return qWords.every(word => c.name.toLowerCase().includes(word));
             }).slice(0, 15);
             
             newDropdown.innerHTML = m.length === 0 ? `<div class="search-empty">No matches</div>` : 
               m.map(c => `<div class="search-option" data-id="${c.id}" data-name="${escapeHtml(c.name)}">${highlightMatches(c.name, qWords)}</div>`).join("");
             newDropdown.classList.add("open");
             
             newDropdown.querySelectorAll(".search-option").forEach(opt => {
               opt.addEventListener("click", () => selectName(rank, parseInt(opt.dataset.id), opt.dataset.name));
             });
          });
          document.addEventListener("click", (e) => { if (!wrapper.contains(e.target)) newDropdown.classList.remove("open"); });
          
          updateSubmitButton();
        });

        updateSubmitButton();
      }
    });

    function updateSubmitButton() {
      const submitBtn = card.querySelector(".vote-submit-btn");
      submitBtn.disabled = !(selections[1] && selections[2] && selections[3]);
    }

    // Submit Logic
    const submitBtn = card.querySelector(".vote-submit-btn");
    const messageEl = card.querySelector(".vote-message");

    submitBtn.addEventListener("click", async () => {
      const choices = {};
      slots.forEach((slot) => {
        const rank = parseInt(slot.dataset.rank);
        const badge = slot.querySelector(".selected-badge");
        if (badge) {
          choices[rank] = {
            id: parseInt(badge.dataset.classmateId),
            name: badge.querySelector("span").textContent
          };
        }
      });

      if (!choices[1] || !choices[2] || !choices[3]) {
        showMessage(messageEl, "error", "Please select 3 different classmates.");
        return;
      }

      submitBtn.disabled = true;
      submitBtn.classList.add("submitting");
      submitBtn.textContent = "Submitting...";

      try {
        const { error } = await sb.from("votes").insert({
          question_id: questionId,
          voter_code_id: codeId,
          voter_visitor_id: visitorId,
          choice_1_id: choices[1].id,
          choice_2_id: choices[2].id,
          choice_3_id: choices[3].id,
          group_code: groupCode,
        });

        if (error) {
          if (error.code === "23505") {
            showMessage(messageEl, "success", "You already voted on this question.");
          } else {
            throw error;
          }
        } else {
          showMessage(messageEl, "success", "✓ Vote submitted successfully!");
        }

        votedSet.add(questionId);
        const localVoted = (await idbKeyval.get(VOTES_VOTED_KEY)) || [];
        localVoted.push(questionId);
        await idbKeyval.set(VOTES_VOTED_KEY, localVoted);

        setTimeout(() => {
          card.classList.add("voted");
          card.querySelector(".choices-container").remove();
          submitBtn.remove();
          
          const votedBadge = document.createElement("div");
          votedBadge.className = "voted-badge";
          votedBadge.textContent = "✓ You already voted on this";
          card.appendChild(votedBadge);
          
          card.querySelector(".vote-number").style.background = "#2e7d32";
          updateProgress();

          if (votedSet.size >= totalQuestions) allDoneState.hidden = false;
        }, 1500);

      } catch (err) {
        console.error("Vote submit error:", err);
        showMessage(messageEl, "error", "Failed to submit. Please try again.");
        submitBtn.disabled = false;
        submitBtn.classList.remove("submitting");
        submitBtn.textContent = "Submit Vote";
      }
    });
  }

  function showMessage(el, type, text) {
    el.textContent = text;
    el.className = `vote-message ${type}`;
    el.hidden = false;
  }

  function highlightMatches(name, queryWords) {
    let result = escapeHtml(name);
    queryWords.forEach((word) => {
      const regex = new RegExp(`(${escapeRegex(word)})`, "gi");
      result = result.replace(regex, `<span class="match-highlight">$1</span>`);
    });
    return result;
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
});