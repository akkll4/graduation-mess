// js/admin.js

const ADMIN_EMAIL = "a.yousf13a@gmail.com"; // Replace with your admin email

let currentGroup = "malaysian";
let currentSection = "messages"; // 'messages', 'qa', 'votes', 'match'
let currentMsgStatus = "pending";
let currentQaStatus = "pending";
let currentVoteView = "summary"; 
let currentTributeStatus = "pending";      // ✅ ADD THIS
let currentTributeRecipient = "all";       // ✅ ADD THIS

let cachedVotesData = null; 
let cachedTributesData = null;             // ✅ ADD THIS
let cachedClassmatesList = [];             // ✅ ADD THIS


document.addEventListener("DOMContentLoaded", async () => {
  const { data: { session }, error: sessionError } = await sb.auth.getSession();
  
  if (sessionError) console.error("Session error:", sessionError);

  if (session && session.user.email === ADMIN_EMAIL) {
    showDashboard();
  } else {
    showLogin();
  }

  // Login Form
  document.getElementById("loginForm").addEventListener("submit", handleLogin);
  document.getElementById("logoutBtn").addEventListener("click", handleLogout);

  // Level 1: Group Tabs
  document.querySelectorAll(".admin-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".admin-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentGroup = tab.dataset.group;
      loadAllData();
    });
  });

  // Level 2: Section Tabs
  document.querySelectorAll(".section-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".section-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentSection = tab.dataset.section;
      
      document.querySelectorAll(".admin-section-content").forEach((sec) => {
        sec.hidden = true;
      });
      
      const activeSection = document.getElementById(`${currentSection}Section`);
      if (activeSection) activeSection.hidden = false;

      if (currentSection === "messages") loadMessages();
      else if (currentSection === "qa") loadQaAnswers();
      else if (currentSection === "votes") loadVotes();
      else if (currentSection === "match") loadTributes(); // NEW
    });
  });

  // Message Filters
  document.querySelectorAll("#messagesSection .filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#messagesSection .filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentMsgStatus = btn.dataset.status;
      loadMessages();
    });
  });

  // Q&A Filters
  document.querySelectorAll("#qaSection .filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#qaSection .filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentQaStatus = btn.dataset.qaStatus;
      loadQaAnswers();
    });
  });

  let currentVoteView = "summary";
  document.querySelectorAll("#votesSection .filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#votesSection .filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentVoteView = btn.dataset.voteView;
      renderVotesResults(); // Re-render with new view
    });
  });



  document.querySelectorAll("#matchSection .filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#matchSection .filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentTributeStatus = btn.dataset.tributeStatus;
      renderTributes();
    });
  });

  // Recipient filter (will be populated dynamically)
  const recipientFilter = document.getElementById("recipientFilter");
  if (recipientFilter) {
    recipientFilter.addEventListener("change", () => {
      currentTributeRecipient = recipientFilter.value;
      renderTributes();
    });
  }
    

});

function showLogin() {
  document.getElementById("loginScreen").style.display = "grid";
  document.getElementById("adminDashboard").style.display = "none";
}

function showDashboard() {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("adminDashboard").style.display = "block";
  loadAllData();
}

async function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const errorBox = document.getElementById("loginError");

  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;

    if (data.user.email !== ADMIN_EMAIL) {
      await sb.auth.signOut();
      throw new Error("Access denied: Unauthorized email address.");
    }

    errorBox.hidden = true;
    showDashboard();
  } catch (err) {
    errorBox.textContent = err.message || "Invalid email or password.";
    errorBox.hidden = false;
  }
}

async function handleLogout() {
  await sb.auth.signOut();
  showLogin();
}

async function loadAllData() {
  await loadCodeStats();
  if (currentSection === "messages") {
    await loadMessages();
  } else if (currentSection === "qa") {
    await loadQaAnswers();
  }
}

async function loadCodeStats() {
  try {
    const { data: codes, error } = await sb
      .from("access_codes")
      .select("status")
      .eq("group_code", currentGroup);

    if (error) throw error;

    const total = codes.length;
    const active = codes.filter((c) => c.status === "active").length;
    const remaining = codes.filter((c) => c.status === "unused").length;

    document.getElementById("totalCodes").textContent = total;
    document.getElementById("activeCodes").textContent = active;
    document.getElementById("remainingCodes").textContent = remaining;
  } catch (err) {
    console.error("Error loading code stats:", err);
  }
}

// ==========================================
// MESSAGES LOGIC
// ==========================================
async function loadMessages() {
  const listEl = document.getElementById("messagesList");
  listEl.innerHTML = '<div class="loading">Loading messages...</div>';

  try {
    const { data: messages, error } = await sb
      .from("messages")
      .select("*, access_codes(code)")
      .eq("group_code", currentGroup)
      .eq("status", currentMsgStatus)
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (!messages || messages.length === 0) {
      listEl.innerHTML = '<div class="empty-state">No messages found</div>';
      return;
    }

    listEl.innerHTML = messages.map((msg) => {
      const code = msg.access_codes?.code || "Unknown";
      const date = new Date(msg.created_at).toLocaleString();

      return `
        <div class="message-item" data-id="${msg.id}">
          <div class="message-header">
            <div class="message-meta">
              <span class="message-code">${code}</span>
              <span>${date}</span>
            </div>
            <span class="message-status ${msg.status}">${msg.status}</span>
          </div>
          <div class="message-content">${escapeHtml(msg.content)}</div>
          <div class="message-actions">
            ${msg.status === "pending" ? `
              <button class="action-btn approve" onclick="updateMessageStatus(${msg.id}, 'approved')">Approve</button>
              <button class="action-btn reject" onclick="updateMessageStatus(${msg.id}, 'rejected')">Reject</button>
            ` : `
              <button class="action-btn approve" onclick="updateMessageStatus(${msg.id}, 'pending')">Move to Pending</button>
            `}
          </div>
        </div>
      `;
    }).join("");
  } catch (err) {
    console.error("Error loading messages:", err);
    listEl.innerHTML = '<div class="empty-state">Error loading messages</div>';
  }
}

window.updateMessageStatus = async function(messageId, newStatus) {
  try {
    const { error } = await sb.from("messages").update({ status: newStatus }).eq("id", messageId);
    if (error) throw error;
    await loadMessages();
  } catch (err) {
    console.error("Error updating message:", err);
    alert("Failed to update message status");
  }
};

// ==========================================
// Q&A ANSWERS LOGIC
// ==========================================
async function loadQaAnswers() {
  const listEl = document.getElementById("qaAnswersList");
  listEl.innerHTML = '<div class="loading">Loading Q&A answers...</div>';

  try {
    const { data: answers, error } = await sb
      .from("qa_answers")
      .select(`
        id,
        content,
        status,
        created_at,
        qa_questions (question_text),
        access_codes (code)
      `)
      .eq("group_code", currentGroup)
      .eq("status", currentQaStatus)
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (!answers || answers.length === 0) {
      listEl.innerHTML = '<div class="empty-state">No Q&A answers found</div>';
      return;
    }

    listEl.innerHTML = answers.map((ans) => {
      const questionText = ans.qa_questions?.question_text || "Unknown Question";
      const userCode = ans.access_codes?.code || "Unknown Code";
      const date = new Date(ans.created_at).toLocaleString();

      return `
        <div class="message-item" data-id="${ans.id}">
          <div class="message-header">
            <div class="message-meta">
              <span class="user-code-badge">👤 ${userCode}</span>
              <span>${date}</span>
            </div>
            <span class="message-status ${ans.status}">${ans.status}</span>
          </div>
          
          <div class="qa-question-text">Q: ${escapeHtml(questionText)}</div>
          <div class="qa-answer-content">${escapeHtml(ans.content)}</div>
          
          <div class="message-actions">
            ${ans.status === "pending" ? `
              <button class="action-btn approve" onclick="updateQaAnswerStatus(${ans.id}, 'approved')">Approve</button>
              <button class="action-btn reject" onclick="updateQaAnswerStatus(${ans.id}, 'rejected')">Reject</button>
            ` : `
              <button class="action-btn approve" onclick="updateQaAnswerStatus(${ans.id}, 'pending')">Move to Pending</button>
            `}
          </div>
        </div>
      `;
    }).join("");
  } catch (err) {
    console.error("Error loading Q&A answers:", err);
    listEl.innerHTML = '<div class="empty-state">Error loading Q&A answers</div>';
  }
}

window.updateQaAnswerStatus = async function(answerId, newStatus) {
  try {
    const { error } = await sb.from("qa_answers").update({ status: newStatus }).eq("id", answerId);
    if (error) throw error;
    await loadQaAnswers();
  } catch (err) {
    console.error("Error updating Q&A answer:", err);
    alert("Failed to update answer status");
  }
};



// ==========================================
// VOTES LOGIC
// ==========================================

async function loadVotes() {
  const loadingEl = document.getElementById("votesLoading");
  const emptyEl = document.getElementById("votesEmpty");
  const resultsEl = document.getElementById("votesResultsList");

  loadingEl.hidden = false;
  emptyEl.hidden = true;
  resultsEl.hidden = true;

  try {
    // 1. Fetch Questions
    const { data: questions, error: qErr } = await sb
      .from("vote_questions")
      .select("id, question_text, category")
      .eq("group_code", currentGroup)
      .eq("active", true);
    if (qErr) throw qErr;

    // 2. Fetch Classmates
    const { data: classmates, error: cErr } = await sb
      .from("classmates")
      .select("id, name")
      .eq("group_code", currentGroup);
    if (cErr) throw cErr;

    // 3. Fetch Access Codes (to map voter_code_id to actual code string)
    const { data: codes, error: codeErr } = await sb
      .from("access_codes")
      .select("id, code");
    if (codeErr) throw codeErr;

    // 4. Fetch Votes
    const { data: votes, error: vErr } = await sb
      .from("votes")
      .select("question_id, voter_code_id, choice_1_id, choice_2_id, choice_3_id")
      .eq("group_code", currentGroup);
    if (vErr) throw vErr;

    // Build Maps for fast lookup
    const classmateMap = new Map(classmates.map(c => [c.id, c.name]));
    const codeMap = new Map(codes.map(c => [c.id, c.code]));

    // Process Data
    const results = {};
    questions.forEach(q => {
      results[q.id] = {
        question: q.question_text,
        category: q.category,
        totalVotes: 0,
        points: {}, 
        details: [] 
      };
    });

    if (votes) {
      votes.forEach(v => {
        if (!results[v.question_id]) return;
        
        results[v.question_id].totalVotes++;
        
        const voterCode = codeMap.get(v.voter_code_id) || "Unknown";
        const c1 = classmateMap.get(v.choice_1_id) || "Unknown";
        const c2 = classmateMap.get(v.choice_2_id) || "Unknown";
        const c3 = classmateMap.get(v.choice_3_id) || "Unknown";

        results[v.question_id].details.push({ voterCode, c1, c2, c3 });

        // Add points: 1st=3, 2nd=2, 3rd=1
        results[v.question_id].points[v.choice_1_id] = (results[v.question_id].points[v.choice_1_id] || 0) + 3;
        results[v.question_id].points[v.choice_2_id] = (results[v.question_id].points[v.choice_2_id] || 0) + 2;
        results[v.question_id].points[v.choice_3_id] = (results[v.question_id].points[v.choice_3_id] || 0) + 1;
      });
    }

    // Sort points for each question
    Object.keys(results).forEach(qId => {
      const pointsObj = results[qId].points;
      const sorted = Object.entries(pointsObj)
        .map(([id, pts]) => ({ id: parseInt(id), name: classmateMap.get(parseInt(id)) || "Unknown", points: pts }))
        .sort((a, b) => b.points - a.points);
      
      results[qId].top3 = sorted.slice(0, 3);
    });

    cachedVotesData = results;
    loadingEl.hidden = true;

    if (!votes || votes.length === 0) {
      emptyEl.hidden = false;
    } else {
      resultsEl.hidden = false;
      renderVotesResults();
    }

  } catch (err) {
    console.error("Error loading votes:", err);
    loadingEl.innerHTML = '<div class="empty-state">Error loading voting results.</div>';
  }
}

function renderVotesResults() {
  const resultsEl = document.getElementById("votesResultsList");
  if (!cachedVotesData) return;

  resultsEl.innerHTML = Object.entries(cachedVotesData).map(([qId, data]) => {
    if (data.totalVotes === 0) return ""; // Skip questions with no votes

    const categoryLabel = { personality: "Personality", medical: "Medical Career", habits: "Habits & General" }[data.category] || data.category;

    // Build Winners HTML
    const winnersHtml = data.top3.map((winner, index) => {
      const rankClass = index === 0 ? "first" : "";
      const rankNum = index + 1;
      return `
        <div class="winner-row ${rankClass}">
          <div class="winner-rank rank-${rankNum}">${rankNum}</div>
          <div class="winner-name">${escapeHtml(winner.name)}</div>
          <div class="winner-points">${winner.points} pts</div>
        </div>
      `;
    }).join("");

    // Build Details HTML
    const detailsHtml = data.details.map(d => `
      <div class="log-entry">
        <span class="log-voter-code">👤 ${escapeHtml(d.voterCode)}</span>
        <span class="log-choices">
          <span class="c1">1st: ${escapeHtml(d.c1)}</span> • 
          <span class="c2">2nd: ${escapeHtml(d.c2)}</span> • 
          <span class="c3">3rd: ${escapeHtml(d.c3)}</span>
        </span>
      </div>
    `).join("");

    return `
      <div class="vote-result-card">
        <div class="vote-result-header">
          <div class="vote-result-question">
            <span class="vote-category ${data.category}" style="font-size:0.7rem; padding:2px 8px; margin-right:8px;">${categoryLabel}</span>
            ${escapeHtml(data.question)}
          </div>
          <div class="vote-total-votes">${data.totalVotes} votes</div>
        </div>

        ${currentVoteView === "summary" ? `
          <div class="winners-container">
            ${winnersHtml || '<div style="color:var(--muted); font-style:italic;">No valid votes yet.</div>'}
          </div>
        ` : `
          <div class="vote-details-log open">
            ${detailsHtml}
          </div>
        `}

        <button class="toggle-details-btn" onclick="toggleVoteDetails()">
          ${currentVoteView === "summary" ? "👁️ Show Detailed Voter Log" : "📊 Show Summary Leaderboard"}
        </button>
      </div>
    `;
  }).join("");
}

// Global function for the onclick handler
window.toggleVoteDetails = function() {
  // Toggle the view
  currentVoteView = currentVoteView === "summary" ? "details" : "summary";
  
  // Update the filter buttons to match
  document.querySelectorAll("#votesSection .filter-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.voteView === currentVoteView);
  });
  
  // Re-render
  renderVotesResults();
};


// ==========================================
// TRIBUTES (MATCH) LOGIC
// ==========================================

async function loadTributes() {
  const loadingEl = document.getElementById("tributesLoading");
  const emptyEl = document.getElementById("tributesEmpty");
  const listEl = document.getElementById("tributesList");
  const statsEl = document.getElementById("tributeStats");
  const recipientFilter = document.getElementById("recipientFilter");

  loadingEl.hidden = false;
  emptyEl.hidden = true;
  listEl.hidden = true;

  try {
    // 1. Fetch all classmates for this group (for recipient dropdown)
    const { data: classmates, error: cErr } = await sb
      .from("classmates")
      .select("id, name")
      .eq("group_code", currentGroup)
      .eq("active", true)
      .order("name");
    if (cErr) throw cErr;
    cachedClassmatesList = classmates || [];

    // 2. Populate recipient dropdown (only if not already populated for this group)
    const currentOptions = Array.from(recipientFilter.options).map(o => o.value);
    if (!currentOptions.includes("group_" + currentGroup)) {
      // Clear and rebuild
      recipientFilter.innerHTML = '<option value="all">All classmates</option>';
      cachedClassmatesList.forEach(c => {
        const opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = c.name;
        recipientFilter.appendChild(opt);
      });
      // Add a marker option to track which group is loaded
      const marker = document.createElement("option");
      marker.value = "group_" + currentGroup;
      marker.hidden = true;
      marker.selected = false;
      recipientFilter.appendChild(marker);
    }

    // 3. Fetch access codes (to map writer's code_id to actual code string)
    const { data: codes, error: codeErr } = await sb
      .from("access_codes")
      .select("id, code");
    if (codeErr) throw codeErr;

    // 4. Fetch all tributes for this group
    const { data: tributes, error: tErr } = await sb
      .from("tributes")
      .select("id, classmate_id, owner_code_id, specialty, how_know, happy_memory, good_things, one_word, advice, signature_phrase, status, created_at")
      .eq("group_code", currentGroup)
      .order("created_at", { ascending: false });
    if (tErr) throw tErr;

    // Build maps
    const classmateMap = new Map(cachedClassmatesList.map(c => [c.id, c.name]));
    const codeMap = new Map(codes.map(c => [c.id, c.code]));

    // Process tributes
    const processedTributes = (tributes || []).map(t => ({
      ...t,
      recipientName: classmateMap.get(t.classmate_id) || "Unknown",
      writerCode: codeMap.get(t.owner_code_id) || "Unknown"
    }));

    cachedTributesData = processedTributes;
    loadingEl.hidden = true;

    // Stats
    const total = processedTributes.length;
    const pending = processedTributes.filter(t => t.status === "pending").length;
    const approved = processedTributes.filter(t => t.status === "approved").length;
    statsEl.textContent = `Total: ${total} • Pending: ${pending} • Approved: ${approved}`;

    if (processedTributes.length === 0) {
      emptyEl.hidden = false;
    } else {
      listEl.hidden = false;
      renderTributes();
    }

  } catch (err) {
    console.error("Error loading tributes:", err);
    loadingEl.innerHTML = '<div class="empty-state">Error loading tributes.</div>';
  }
}

function renderTributes() {
  const listEl = document.getElementById("tributesList");
  const emptyEl = document.getElementById("tributesEmpty");
  if (!cachedTributesData) return;

  // Apply filters
  let filtered = cachedTributesData.filter(t => t.status === currentTributeStatus);
  if (currentTributeRecipient !== "all") {
    filtered = filtered.filter(t => t.classmate_id === parseInt(currentTributeRecipient));
  }

  if (filtered.length === 0) {
    listEl.hidden = true;
    emptyEl.hidden = false;
    return;
  }

  listEl.hidden = false;
  emptyEl.hidden = true;

  listEl.innerHTML = filtered.map(t => {
    const date = new Date(t.created_at).toLocaleString();

    const fields = [
      { label: "Specialty Match", value: t.specialty, class: "specialty" },
      { label: "How I Know You", value: t.how_know },
      { label: "Happy Memory", value: t.happy_memory },
      { label: "Good Things I See in You", value: t.good_things },
      { label: "One Word to Describe You", value: t.one_word, class: "one-word" },
      { label: "My Advice to You", value: t.advice },
      { label: "Signature Phrase", value: t.signature_phrase }
    ];

    const fieldsHtml = fields.map(f => {
      const displayClass = f.class || "";
      const valueHtml = f.value 
        ? `<div class="tribute-field-value ${displayClass}">${escapeHtml(f.value)}</div>`
        : `<div class="tribute-field-value empty">Not specified</div>`;
      return `
        <div class="tribute-field">
          <span class="tribute-field-label">${f.label}</span>
          ${valueHtml}
        </div>
      `;
    }).join("");

    // Build action buttons based on current status
    let actionsHtml = "";
    if (t.status === "pending") {
      actionsHtml = `
        <button class="action-btn approve" onclick="updateTributeStatus(${t.id}, 'approved')">Approve</button>
        <button class="action-btn reject" onclick="updateTributeStatus(${t.id}, 'rejected')">Reject</button>
      `;
    } else {
      actionsHtml = `
        <button class="action-btn approve" onclick="updateTributeStatus(${t.id}, 'pending')">Move to Pending</button>
      `;
    }

    return `
      <div class="tribute-admin-card" data-id="${t.id}">
        <div class="tribute-admin-header">
          <div class="tribute-participants">
            <div class="tribute-for">
              <span>🎯 Tribute for:</span>
              <strong>${escapeHtml(t.recipientName)}</strong>
            </div>
            <div class="tribute-by">
              <span>✍️ Written by:</span>
              <span class="user-code-badge">👤 ${escapeHtml(t.writerCode)}</span>
            </div>
          </div>
          <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
            <span class="message-status ${t.status}">${t.status}</span>
            <span class="tribute-date">${date}</span>
          </div>
        </div>

        <div class="tribute-fields">
          ${fieldsHtml}
        </div>

        <div class="tribute-admin-actions">
          ${actionsHtml}
        </div>
      </div>
    `;
  }).join("");
}

window.updateTributeStatus = async function(tributeId, newStatus) {
  try {
    const { error } = await sb
      .from("tributes")
      .update({ status: newStatus })
      .eq("id", tributeId);

    if (error) throw error;
    
    // Update cache and re-render
    const tribute = cachedTributesData.find(t => t.id === tributeId);
    if (tribute) tribute.status = newStatus;
    
    // Update stats
    const statsEl = document.getElementById("tributeStats");
    const total = cachedTributesData.length;
    const pending = cachedTributesData.filter(t => t.status === "pending").length;
    const approved = cachedTributesData.filter(t => t.status === "approved").length;
    statsEl.textContent = `Total: ${total} • Pending: ${pending} • Approved: ${approved}`;
    
    renderTributes();
  } catch (err) {
    console.error("Error updating tribute:", err);
    alert("Failed to update tribute status");
  }
};


function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}