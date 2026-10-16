// js/messages.js

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Check if user is logged in
  const session = await idbKeyval.get("gateSession");
  if (!session || !session.groupCode) {
    window.location.href = "index.html";
    return;
  }

  const visitorId = await idbKeyval.get("visitorId");
  const groupCode = session.groupCode;

  // State variables
  let reactionCounts = {}; 
  let userReactionTypes = {}; 

  const loadingState = document.getElementById("loadingState");
  const messagesList = document.getElementById("messagesList");
  const emptyState = document.getElementById("emptyState");

  // 2. Initialize Page
  await loadData();

  async function loadData() {
    try {
      // Fetch ALL approved messages for this group
      const { data: messages, error: msgError } = await sb
        .from("messages")
        .select("id, content, created_at")
        .eq("group_code", groupCode)
        .eq("status", "approved")
        .order("created_at", { ascending: false });

      if (msgError) throw msgError;

      if (!messages || messages.length === 0) {
        loadingState.hidden = true;
        emptyState.hidden = false;
        return;
      }

      // Fetch ALL reactions for these messages
      const messageIds = messages.map((m) => m.id).join(",");
      const { data: reactions, error: reactError } = await sb
        .from("reactions")
        .select("message_id, reaction_type, visitor_id")
        .in("message_id", messageIds);

      if (reactError) throw reactError;

      // Aggregate reaction counts AND track user's own reactions
      reactionCounts = {};
      userReactionTypes = {};
      
      if (reactions) {
        reactions.forEach((r) => {
          // Count reactions
          if (!reactionCounts[r.message_id]) {
            reactionCounts[r.message_id] = { love: 0, laugh: 0, clap: 0 };
          }
          reactionCounts[r.message_id][r.reaction_type]++;
          
          // Check if this is the current user's reaction
          if (r.visitor_id === visitorId) {
            userReactionTypes[r.message_id] = r.reaction_type;
          }
        });
      }

      // Sync with IndexedDB to ensure local state is perfect
      const localUserReactions = (await idbKeyval.get("userReactions")) || {};
      Object.keys(localUserReactions).forEach((msgId) => {
        const msgIdNum = parseInt(msgId, 10);
        if (!userReactionTypes[msgIdNum]) {
          userReactionTypes[msgIdNum] = localUserReactions[msgId];
        }
      });
      await idbKeyval.set("userReactions", userReactionTypes);

      // Render ALL messages immediately
      loadingState.hidden = true;
      messagesList.hidden = false;

      messages.forEach((msg) => {
        const userReactionType = userReactionTypes[msg.id] || userReactionTypes[String(msg.id)];
        const hasReacted = !!userReactionType;
        
        const card = createMessageCard(msg, reactionCounts[msg.id] || {}, hasReacted, userReactionType);
        messagesList.appendChild(card);
      });

    } catch (err) {
      console.error("Error loading messages:", err);
      loadingState.innerHTML = "<p>Failed to load messages. Please refresh.</p>";
    }
  }

  function createMessageCard(msg, counts, hasReacted, userReactionType) {
    const card = document.createElement("div");
    card.className = "message-card";
    card.dataset.messageId = msg.id;

    const dateStr = new Date(msg.created_at).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    const reactions = [
      { type: "love", emoji: "❤️", label: "Love" },
      { type: "laugh", emoji: "😂", label: "Laugh" },
      { type: "clap", emoji: "👏", label: "Clap" },
    ];

    const reactionsHtml = reactions
      .map((r) => {
        const count = counts[r.type] || 0;
        const isActive = hasReacted && userReactionType === r.type;
        const activeClass = isActive ? `active-${r.type}` : "";

        return `
          <button 
            class="reaction-btn ${activeClass}" 
            data-type="${r.type}" 
            data-count="${count}"
            ${hasReacted ? "disabled" : ""}
            aria-label="React ${r.label}"
          >
            <span>${r.emoji}</span>
            <span class="count">${count}</span>
          </button>
        `;
      })
      .join("");

    card.innerHTML = `
      <div class="message-content">${escapeHtml(msg.content)}</div>
      <div class="message-date">📅 ${dateStr}</div>
      <div class="reactions-bar">${reactionsHtml}</div>
    `;

    // Attach reaction click handlers ONLY if the user has NOT reacted yet
    if (!hasReacted) {
      card.querySelectorAll(".reaction-btn").forEach((btn) => {
        btn.addEventListener("click", () => handleReaction(msg.id, btn));
      });
    }

    return card;
  }

  async function handleReaction(messageId, btn) {
    if (btn.disabled) return;

    const reactionType = btn.dataset.type;
    const currentCount = parseInt(btn.dataset.count, 10);

    // 1. Optimistic UI Update
    btn.disabled = true;
    btn.classList.add(`active-${reactionType}`);
    btn.querySelector(".count").textContent = currentCount + 1;

    // Disable other buttons for this message immediately
    const card = btn.closest(".message-card");
    card.querySelectorAll(".reaction-btn").forEach((b) => {
      if (b !== btn) b.disabled = true;
    });

    // 2. Save to IndexedDB immediately
    const userReactions = (await idbKeyval.get("userReactions")) || {};
    userReactions[messageId] = reactionType;
    await idbKeyval.set("userReactions", userReactions);

    // 3. Save to Supabase
    try {
      const session = await idbKeyval.get("gateSession");
      const visitorId = await idbKeyval.get("visitorId");

      const { error } = await sb.from("reactions").insert({
        message_id: messageId,
        visitor_id: visitorId,
        reaction_type: reactionType,
        owner_code_id: session.codeId,
      });

      if (error) {
        // If it's a unique constraint violation (already reacted), the UI is already correct.
        if (error.code === "23505") {
          console.log("Reaction already exists in database (prevented duplicate).");
        } else {
          console.error("Reaction save error:", error);
          revertReactionUI(btn, currentCount, messageId);
        }
      }
    } catch (err) {
      console.error("Network error on reaction:", err);
      revertReactionUI(btn, currentCount, messageId);
    }
  }

  // Helper to revert UI if something goes wrong
  async function revertReactionUI(btn, originalCount, messageId) {
    const reactionType = btn.dataset.type;
    const card = btn.closest(".message-card");
    
    btn.disabled = false;
    btn.classList.remove(`active-${reactionType}`);
    btn.querySelector(".count").textContent = originalCount;
    card.querySelectorAll(".reaction-btn").forEach((b) => (b.disabled = false));
    
    // Remove from IndexedDB
    const userReactions = (await idbKeyval.get("userReactions")) || {};
    delete userReactions[messageId];
    await idbKeyval.set("userReactions", userReactions);
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
});
