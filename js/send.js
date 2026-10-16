// js/send.js

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("messageForm");
  const contentInput = document.getElementById("messageContent");
  const wordCountEl = document.getElementById("wordCount");
  const submitBtn = document.getElementById("submitBtn");
  const formMessage = document.getElementById("formMessage");

  const MAX_WORDS = 150;

  // 1. Word Count Logic
  contentInput.addEventListener("input", () => {
    const text = contentInput.value.trim();
    const words = text === "" ? 0 : text.split(/\s+/).length;
    
    wordCountEl.textContent = words;

    if (words > MAX_WORDS) {
      wordCountEl.parentElement.classList.add("warning");
      submitBtn.disabled = true;
      submitBtn.textContent = "Word limit exceeded";
    } else if (words === 0) {
      wordCountEl.parentElement.classList.remove("warning");
      submitBtn.disabled = true;
      submitBtn.textContent = "Send Message";
    } else {
      wordCountEl.parentElement.classList.remove("warning");
      submitBtn.disabled = false;
      submitBtn.textContent = "Send Message";
    }
  });

  // 2. Form Submit Logic
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideMessage();

    const text = contentInput.value.trim();
    const words = text === "" ? 0 : text.split(/\s+/).length;

    if (words > MAX_WORDS || words === 0) {
      showMessage("Please check your word count.", "error");
      return;
    }

    // Get user session from IndexedDB
    const session = await idbKeyval.get("gateSession");
    const visitorId = await idbKeyval.get("visitorId");

    if (!session || !session.codeId) {
      showMessage("You must be logged in to send a message.", "error");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending...";

    try {
      const response = await sb.from("messages").insert({
        content: text,
        status: "pending",
        group_code: session.groupCode,
        owner_code_id: session.codeId,
        owner_visitor_id: visitorId,
      });

      if (response.error) {
        throw response.error;
      }

      // Success!
      showMessage("Message sent successfully! It will appear after admin approval.", "success");
      form.reset();
      wordCountEl.textContent = "0";
      submitBtn.disabled = true;
      submitBtn.textContent = "Send Message";

    } catch (err) {
      console.error("Send error:", err);
      showMessage("Failed to send message: " + (err.message || "Unknown error"), "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Send Message";
    }
  });

  function showMessage(text, type) {
    formMessage.textContent = text;
    formMessage.className = `form-message ${type}`;
    formMessage.hidden = false;
  }

  function hideMessage() {
    formMessage.hidden = true;
    formMessage.textContent = "";
    formMessage.className = "form-message";
  }
});