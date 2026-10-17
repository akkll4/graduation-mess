// js/gate.js

const GATE_API = "/api/gate";
const SESSION_KEY = "gateSession";
const VISITOR_KEY = "visitorId";

document.addEventListener("DOMContentLoaded", initGate);

async function initGate() {
  if (!window.idbKeyval) {
    console.error("idb-keyval is not loaded.");
    return;
  }

  const visitorId = await getVisitorId();
  const session = await idbKeyval.get(SESSION_KEY);

  // ✅ AUTO-LOGIN: If session exists in IndexedDB, skip the gate
  if (session && session.code && session.codeId) {
    renderProfileButton(session, visitorId);
    return;
  }

  // No session found - show the gate card
  renderGateCard(visitorId);
}

async function getVisitorId() {
  let visitorId = await idbKeyval.get(VISITOR_KEY);

  if (!visitorId) {
    visitorId = makeUUID();
    await idbKeyval.set(VISITOR_KEY, visitorId);
  }

  return visitorId;
}

function makeUUID() {
  if (window.crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function renderGateCard(visitorId) {
  const root = document.getElementById("gate-root");
  if (!root) return;

  document.body.classList.add("gate-open");

  root.innerHTML = `
    <div class="gate-overlay" role="dialog" aria-modal="true">
      <div class="gate-card">
        <div class="gate-badge">🎓 Batch Access</div>
        <h2>Welcome!</h2>
        <p class="gate-sub">Choose your group to continue.</p>

        <div class="gate-group-buttons">
          <button class="gate-group-btn" data-group="malaysian">Malaysian</button>
          <button class="gate-group-btn" data-group="arab">Arab</button>
        </div>

        <!-- Step 2: Two Options -->
        <div id="gateStep2" style="display: none;">
          <p class="gate-sub" style="margin-top: 16px;">How would you like to enter?</p>
          
          <div class="gate-option-buttons">
            <button id="generateNewBtn" class="gate-option-btn primary">
              <span class="option-icon">🆕</span>
              <span class="option-text">
                <strong>Generate New Code</strong>
                <small>I'm entering for the first time</small>
              </span>
            </button>
            
            <button id="existingCodeBtn" class="gate-option-btn secondary">
              <span class="option-icon">🔑</span>
              <span class="option-text">
                <strong>I Have a Code</strong>
                <small>Log in with my existing code</small>
              </span>
            </button>
          </div>
        </div>

        <!-- Step 3A: Generate New Code Flow -->
        <div id="gateGenerateFlow" style="display: none;">
          <button id="generateCodeBtn" class="btn btn-gold gate-btn">
            Generate My Code
          </button>

          <div id="gateCodeSection" style="display: none;">
            <div class="gate-code-display">
              <code id="generatedCode"></code>
              <button id="copyCodeBtn" class="mini-btn secondary">Copy Code</button>
            </div>

            <p class="gate-note" style="margin: 12px 0; color: #c0392b; font-weight: 600;">
              ⚠️ Save this code! You'll need it to log in next time.
            </p>

            <label class="gate-label">Confirm your code</label>
            <input id="gateCodeInput" class="gate-input" type="text" readonly />

            <button id="activateBtn" class="btn btn-gold gate-btn">
              Log In
            </button>
          </div>
        </div>

        <!-- Step 3B: Existing Code Flow -->
        <div id="gateExistingFlow" style="display: none;">
          <label class="gate-label">Enter your access code</label>
          <input id="existingCodeInput" class="gate-input" type="text" 
                 placeholder="GRAD-XXXX-XXXX" 
                 style="text-transform: uppercase;" />
          
          <button id="verifyCodeBtn" class="btn btn-gold gate-btn">
            Verify & Log In
          </button>
        </div>

        <div id="gateError" class="gate-error" hidden></div>

        <p class="gate-note">
          Please use the same device and do not clear browser data.
        </p>
      </div>
    </div>
  `;

  const groupButtons = document.querySelectorAll(".gate-group-btn");
  const step2 = document.getElementById("gateStep2");
  const generateFlow = document.getElementById("gateGenerateFlow");
  const existingFlow = document.getElementById("gateExistingFlow");
  
  const generateNewBtn = document.getElementById("generateNewBtn");
  const existingCodeBtn = document.getElementById("existingCodeBtn");
  
  const generateBtn = document.getElementById("generateCodeBtn");
  const codeSection = document.getElementById("gateCodeSection");
  const generatedCodeEl = document.getElementById("generatedCode");
  const copyCodeBtn = document.getElementById("copyCodeBtn");
  const codeInput = document.getElementById("gateCodeInput");
  const activateBtn = document.getElementById("activateBtn");
  
  const existingCodeInput = document.getElementById("existingCodeInput");
  const verifyCodeBtn = document.getElementById("verifyCodeBtn");
  
  const errorBox = document.getElementById("gateError");

  let selectedGroup = null;
  let generatedCode = null;
  let generatedCodeId = null;

  // Group Selection
  groupButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      groupButtons.forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedGroup = btn.dataset.group;
      step2.style.display = "block";
      hideError();
    });
  });

  // Option A: Generate New Code
  generateNewBtn.addEventListener("click", () => {
    step2.style.display = "none";
    generateFlow.style.display = "block";
    hideError();
  });

  // Option B: Existing Code
  existingCodeBtn.addEventListener("click", () => {
    step2.style.display = "none";
    existingFlow.style.display = "block";
    existingCodeInput.focus();
    hideError();
  });

  // Generate Code Action
  generateBtn.addEventListener("click", async () => {
    if (!selectedGroup) {
      showError("Please select a group first.");
      return;
    }

    generateBtn.disabled = true;
    generateBtn.textContent = "Generating...";
    hideError();

    try {
      const res = await fetch(GATE_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate-code",
          groupCode: selectedGroup,
          visitorId,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        showError(data.error || "Could not generate code.");
        generateBtn.disabled = false;
        generateBtn.textContent = "Generate My Code";
        return;
      }

      generatedCode = data.code;
      generatedCodeId = data.codeId;

      generatedCodeEl.textContent = data.code;
      codeInput.value = data.code;
      codeSection.style.display = "block";
      generateBtn.style.display = "none";
    } catch (error) {
      console.error(error);
      showError("Connection error. Please try again.");
      generateBtn.disabled = false;
      generateBtn.textContent = "Generate My Code";
    }
  });

  copyCodeBtn.addEventListener("click", async () => {
    const copied = await copyText(generatedCode);
    if (copied) {
      copyCodeBtn.textContent = "Copied!";
      setTimeout(() => { copyCodeBtn.textContent = "Copy Code"; }, 1200);
    } else {
      copyCodeBtn.textContent = "Failed";
      setTimeout(() => { copyCodeBtn.textContent = "Copy Code"; }, 1200);
    }
  });

  // Activate New Code
  activateBtn.addEventListener("click", async () => {
    if (!generatedCode) {
      showError("No code generated.");
      return;
    }

    activateBtn.disabled = true;
    activateBtn.textContent = "Activating...";
    hideError();

    try {
      const res = await fetch(GATE_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "activate",
          code: generatedCode,
          visitorId,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        showError(data.error || "Could not activate code.");
        activateBtn.disabled = false;
        activateBtn.textContent = "Log In";
        return;
      }

      const session = {
        code: data.code,
        codeId: data.codeId,
        groupCode: data.groupCode,
        groupLabel: data.groupLabel || data.groupCode,
        activatedAt: new Date().toISOString(),
      };

      await idbKeyval.set(SESSION_KEY, session);
      window.location.reload();
    } catch (error) {
      console.error(error);
      showError("Connection error. Please try again.");
      activateBtn.disabled = false;
      activateBtn.textContent = "Log In";
    }
  });

  // Verify Existing Code
  verifyCodeBtn.addEventListener("click", async () => {
    const code = existingCodeInput.value.trim().toUpperCase();
    
    if (!code) {
      showError("Please enter your code.");
      return;
    }

    if (!selectedGroup) {
      showError("Please select a group first.");
      return;
    }

    verifyCodeBtn.disabled = true;
    verifyCodeBtn.textContent = "Verifying...";
    hideError();

    try {
      const res = await fetch(GATE_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify-code",
          code: code,
          groupCode: selectedGroup,
          visitorId,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        showError(data.error || "Invalid code.");
        verifyCodeBtn.disabled = false;
        verifyCodeBtn.textContent = "Verify & Log In";
        return;
      }

      const session = {
        code: data.code,
        codeId: data.codeId,
        groupCode: data.groupCode,
        groupLabel: data.groupLabel || data.groupCode,
        activatedAt: new Date().toISOString(),
      };

      await idbKeyval.set(SESSION_KEY, session);
      window.location.reload();
    } catch (error) {
      console.error(error);
      showError("Connection error. Please try again.");
      verifyCodeBtn.disabled = false;
      verifyCodeBtn.textContent = "Verify & Log In";
    }
  });

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  function hideError() {
    errorBox.hidden = true;
    errorBox.textContent = "";
  }
}

async function renderProfileButton(session, visitorId) {
  const nav = document.getElementById("siteNav");
  if (!nav) return;

  const groupLabel = session.groupLabel || session.groupCode || "Group";

  const profileWrap = document.createElement("div");
  profileWrap.className = "profile-wrap";

  profileWrap.innerHTML = `
    <button class="profile-btn" id="profileBtn" type="button">
      👤 <span>${escapeHtml(groupLabel)}</span>
    </button>

    <div class="profile-menu" id="profileMenu" hidden>
      <div class="profile-menu-title">Your profile</div>

      <div class="profile-item-label">Your access code</div>

      <div class="profile-code-row">
        <code id="profileCode">${escapeHtml(session.code)}</code>
        <button class="mini-btn secondary" id="copyCodeBtn" type="button">Copy</button>
      </div>

      <div class="profile-group">Group: ${escapeHtml(groupLabel)}</div>

      <button class="mini-btn" id="loadMyMessagesBtn" type="button">
        Load my messages
      </button>

      <div id="profileMessageBox" class="profile-messages"></div>
    </div>
  `;

  nav.appendChild(profileWrap);

  const profileBtn = document.getElementById("profileBtn");
  const profileMenu = document.getElementById("profileMenu");
  const copyCodeBtn = document.getElementById("copyCodeBtn");
  const loadMyMessagesBtn = document.getElementById("loadMyMessagesBtn");
  const profileMessageBox = document.getElementById("profileMessageBox");

  profileBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    profileMenu.hidden = !profileMenu.hidden;
  });

  document.addEventListener("click", (event) => {
    if (!profileWrap.contains(event.target)) {
      profileMenu.hidden = true;
    }
  });

  copyCodeBtn.addEventListener("click", async () => {
    const copied = await copyText(session.code);
    if (copied) {
      copyCodeBtn.textContent = "Copied";
      setTimeout(() => { copyCodeBtn.textContent = "Copy"; }, 1200);
    } else {
      copyCodeBtn.textContent = "Failed";
      setTimeout(() => { copyCodeBtn.textContent = "Copy"; }, 1200);
    }
  });

  loadMyMessagesBtn.addEventListener("click", loadProfile);

  async function loadProfile() {
    profileMessageBox.innerHTML = `<div class="profile-loading">Loading...</div>`;

    try {
      const res = await fetch(GATE_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "profile",
          code: session.code,
          visitorId,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        profileMessageBox.innerHTML = `<div class="profile-error">${escapeHtml(data.error || "Could not load.")}</div>`;
        return;
      }

      renderProfileMessages(data.messages || []);
    } catch (error) {
      console.error(error);
      profileMessageBox.innerHTML = `<div class="profile-error">Connection error.</div>`;
    }
  }

  function renderProfileMessages(messages) {
    if (!messages.length) {
      profileMessageBox.innerHTML = `<div class="profile-loading">No messages yet.</div>`;
      return;
    }

    profileMessageBox.innerHTML = messages
      .map((message) => {
        const reactionsText = renderReactions(message.reactions || {});

        return `
          <div class="profile-message">
            <p>${escapeHtml(message.content)}</p>
            <div class="profile-meta">
              <span class="status-badge ${message.status}">${escapeHtml(statusLabel(message.status))}</span>
              <span>${formatDate(message.created_at)}</span>
              ${reactionsText ? `<span>${reactionsText}</span>` : ""}
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderReactions(reactions) {
    const emojiMap = { love: "❤️", funny: "😂", touching: "🥹", motivating: "🔥" };
    const entries = Object.entries(reactions).filter(([_, count]) => count > 0);
    if (!entries.length) return "";
    return entries.map(([reaction, count]) => `${emojiMap[reaction] || "✨"} ${count}`).join(" ");
  }

  function statusLabel(status) {
    if (status === "approved") return "Approved";
    if (status === "rejected") return "Rejected";
    return "Pending";
  }

  function formatDate(dateString) {
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return "";
    }
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      return true;
    } catch {
      return false;
    }
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
