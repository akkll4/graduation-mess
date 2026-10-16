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
  let allMessages = [];
  let reactionCounts = {}; 
  let currentIndex = 0;
  const BATCH_SIZE = 5;

  const loadingState = document.getElementById("loadingState");
  const messagesList = document.getElementById("messagesList");
  const emptyState = document.getElementById("emptyState");
  const allSeenState = document.getElementById("allSeenState");
  const loadMoreContainer = document.getElementById("loadMoreContainer");
  const loadMoreBtn = document.getElementById("loadMoreBtn");
  const reshuffleBtn = document.getElementById("reshuffleBtn");
  const refreshBtn = document.getElementById("refreshBtn");

  // 2. Initialize Page
  await loadData();

  // 3. Event Listeners
  loadMoreBtn.addEventListener("click", loadNextBatch);
  reshuffleBtn.addEventListener("click", handleReshuffle);
  if (refreshBtn) {
    refreshBtn.addEventListener("click", handleRefresh);
  }

  async function loadData() {
    try {
      // Fetch approved messages for this group
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

      allMessages = messages;

      // Fetch all reactions for these messages
      const messageIds = messages.map((m) => m.id).join(",");
      const { data: reactions, error: reactError } = await sb
        .from("reactions")
        .select("message_id, reaction_type, visitor_id")
        .in("message_id", messageIds);

      if (reactError) throw reactError;

      // Aggregate reaction counts
      reactionCounts = {};
      if (reactions) {
        reactions.forEach((r) => {
          if (!reactionCounts[r.message_id]) {
            reactionCounts[r.message_id] = { love: 0, laugh: 0, clap: 0 };
          }
          reactionCounts[r.message_id][r.reaction_type]++;
        });
      }

      // Sync Supabase reactions with IndexedDB to ensure local state is perfect
      const localUserReactions = (await idbKeyval.get("userReactions")) || {};
      if (reactions) {
        reactions.forEach((r) => {
          if (r.visitor_id === visitorId) {
            localUserReactions[r.message_id] = r.reaction_type;
          }
        });
      }
      // Save the synced state back to IndexedDB
      await idbKeyval.set("userReactions", localUserReactions);

      loadingState.hidden = true;
      loadNextBatch();

    } catch (err) {
      console.error("Error loading messages:", err);
      loadingState.innerHTML = "<p>Failed to load messages. Please refresh.</p>";
    }
  }

  async function loadNextBatch() {
    const seenIds = (await idbKeyval.get("seenMessageIds")) || [];
    // Get the synced user reactions from IndexedDB
    const userReactions = (await idbKeyval.get("userReactions")) || {};

    // Filter out messages the user has already seen
    const unseenMessages = allMessages.filter((m) => !seenIds.includes(m.id));

    if (unseenMessages.length === 0) {
      messagesList.hidden = true;
      loadMoreContainer.hidden = true;
      allSeenState.hidden = false;
      return;
    }

    // Get the next batch
    const batch = unseenMessages.slice(currentIndex, currentIndex + BATCH_SIZE);
    currentIndex += BATCH_SIZE;

    // Render the batch
    batch.forEach((msg) => {
      // Check both number and string keys to be 100% safe
      const userReactionType = userReactions[msg.id] || userReactions[String(msg.id)];
      const hasReacted = !!userReactionType;

      const card = createMessageCard(msg, reactionCounts[msg.id] || {}, hasReacted, userReactionType);
      messagesList.appendChild(card);
      
      // Mark as seen in IndexedDB
      seenIds.push(msg.id);
    });

    await idbKeyval.set("seenMessageIds", seenIds);

    // Update UI visibility
    messagesList.hidden = false;
    allSeenState.hidden = true;

    if (currentIndex >= unseenMessages.length) {
      loadMoreContainer.hidden = true;
    } else {
      loadMoreContainer.hidden = false;
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
        // Highlight the specific reaction the user chose
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
      const { error } = await sb.from("reactions").insert({
        message_id: messageId,
        visitor_id: visitorId,
        reaction_type: reactionType,
        owner_code_id: session.codeId,
      });

      if (error) {
        // If it's a unique constraint violation (already reacted), the UI is already correct, so we just log it.
        if (error.code === "23505") {
          console.log("Reaction already exists in database (prevented duplicate).");
        } else {
          console.error("Reaction save error:", error);
          // Revert UI only on unexpected errors
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

  async function handleReshuffle() {
    await idbKeyval.del("seenMessageIds");
    await idbKeyval.del("userReactions");
    
    currentIndex = 0;
    messagesList.innerHTML = "";
    allSeenState.hidden = true;
    loadingState.hidden = false;
    loadingState.innerHTML = '<div class="spinner"></div><p>Reshuffling memories...</p>';
    
    await loadData();
  }

  async function handleRefresh() {
    window.location.reload();
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
});