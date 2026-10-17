// api/gate.js

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim() !== "") {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  if (req.headers["x-real-ip"]) {
    return String(req.headers["x-real-ip"]);
  }
  return req.socket?.remoteAddress || "unknown";
}

function normalizeCode(code) {
  return String(code || "").trim().toUpperCase().replace(/\s+/g, "");
}

async function supabaseFetch(path, options = {}) {
  const SUPABASE_URL = process.env.SUPABASE_URL || "https://myazzpalbiedwceqogjz.supabase.co";
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15YXp6cGFsYmllZHdjZXFvZ2p6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MjEzMzM4NCwiZXhwIjoyMTA3NzA5Mzg0fQ.-p5RRzDhoEdXh-yK_B308PtN6-XdCYE4nLT2b5RP9AU";
  
  const url = `${SUPABASE_URL}/rest/v1/${path}`;

  const headers = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  };

  if (options.method && options.method !== "GET") {
    headers["Content-Type"] = "application/json";
  }

  if (options.prefer) {
    headers["Prefer"] = options.prefer;
  }

  const res = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    throw new Error(typeof data === "string" ? data : JSON.stringify(data));
  }

  return data;
}

async function logEvent(payload) {
  try {
    await supabaseFetch("access_logs", {
      method: "POST",
      body: payload,
    });
  } catch (error) {
    console.error("Access log error:", error.message);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  const ip = getClientIp(req);
  const userAgent = String(req.headers["user-agent"] || "");
  const body = parseBody(req);
  const action = String(body.action || "");
  const code = normalizeCode(body.code);
  const groupCode = String(body.groupCode || "").trim().toLowerCase();
  const visitorId = String(body.visitorId || "").trim();

  try {
    // ==========================================
    // GENERATE CODE
    // ==========================================
    if (action === "generate-code") {
      if (!groupCode || !["malaysian", "arab"].includes(groupCode)) {
        return res.status(400).json({ ok: false, error: "Invalid group." });
      }

      await logEvent({
        code: null,
        event: "generate_attempt",
        visitor_id: visitorId,
        ip,
        user_agent: userAgent,
        details: `group=${groupCode}`,
      });

      const group = await supabaseFetch(
        `group_settings?select=*&group_code=eq.${groupCode}&limit=1`
      );

      if (!group || !group[0] || !group[0].active) {
        return res.status(403).json({ ok: false, error: "This group is not available." });
      }

      if (group[0].closed) {
        return res.status(403).json({ ok: false, error: "This group is closed." });
      }

      const activeCodes = await supabaseFetch(
        `access_codes?select=id&group_code=eq.${groupCode}&status=eq.active`
      );

      if (Array.isArray(activeCodes) && activeCodes.length >= group[0].max_entries) {
        return res.status(403).json({ ok: false, error: "This group is full." });
      }

      const unusedCodes = await supabaseFetch(
        `access_codes?select=*&group_code=eq.${groupCode}&status=eq.unused&limit=100`
      );

      if (!Array.isArray(unusedCodes) || unusedCodes.length === 0) {
        return res.status(403).json({ ok: false, error: "No codes available." });
      }

      const randomIndex = Math.floor(Math.random() * unusedCodes.length);
      const selectedCode = unusedCodes[randomIndex];

      await logEvent({
        code_id: selectedCode.id,
        code: selectedCode.code,
        event: "code_generated",
        visitor_id: visitorId,
        ip,
        user_agent: userAgent,
      });

      return res.status(200).json({
        ok: true,
        code: selectedCode.code,
        codeId: selectedCode.id,
        groupCode: selectedCode.group_code,
        groupLabel: group[0].label,
      });
    }

    // ==========================================
    // VERIFY CODE (Multi-device friendly)
    // ==========================================
    if (action === "verify-code") {
      if (!code || !groupCode || !visitorId) {
        return res.status(400).json({ ok: false, error: "Code, group, and visitor ID required." });
      }

      const accessCode = await supabaseFetch(
        `access_codes?select=*&code=eq.${encodeURIComponent(code)}&group_code=eq.${groupCode}&limit=1`
      );

      if (!accessCode || !accessCode[0]) {
        return res.status(404).json({ ok: false, error: "Code not found. Please check and try again." });
      }

      const codeData = accessCode[0];

      if (codeData.status === "blocked") {
        return res.status(403).json({ ok: false, error: "This code is blocked." });
      }

      const group = await supabaseFetch(
        `group_settings?select=*&group_code=eq.${codeData.group_code}&limit=1`
      );

      if (!group || !group[0] || !group[0].active) {
        return res.status(403).json({ ok: false, error: "This group is not available." });
      }

      const now = new Date().toISOString();

      // 1. Activate unused code
      if (codeData.status === "unused") {
        const updated = await supabaseFetch(`access_codes?id=eq.${codeData.id}`, {
          method: "PATCH",
          prefer: "return=representation",
          body: {
            status: "active",
            assigned_visitor_id: visitorId, // Remember who activated it first
            first_ip: ip,
            last_ip: ip,
            last_user_agent: userAgent,
            activated_at: now,
            last_seen_at: now,
          },
        });

        await logEvent({
          code_id: codeData.id,
          code: codeData.code,
          event: "activation_success",
          visitor_id: visitorId,
          ip,
          user_agent: userAgent,
          details: "verified_existing_code",
        });

        return res.status(200).json({
          ok: true,
          code: updated[0].code,
          codeId: updated[0].id,
          groupCode: updated[0].group_code,
          groupLabel: group[0].label,
        });
      }

      // 2. Already active -> ALLOW MULTI-DEVICE (Just update last seen)
      if (codeData.status === "active") {
        const updated = await supabaseFetch(`access_codes?id=eq.${codeData.id}`, {
          method: "PATCH",
          prefer: "return=representation",
          body: {
            last_ip: ip,
            last_user_agent: userAgent,
            last_seen_at: now,
          },
        });

        await logEvent({
          code_id: codeData.id,
          code: codeData.code,
          event: "reentry_success",
          visitor_id: visitorId,
          ip,
          user_agent: userAgent,
          details: "multi_device_login",
        });

        return res.status(200).json({
          ok: true,
          code: updated[0].code,
          codeId: updated[0].id,
          groupCode: updated[0].group_code,
          groupLabel: group[0].label,
        });
      }

      return res.status(400).json({ ok: false, error: "This code is not available." });
    }

    // ==========================================
    // ACTIVATE CODE (Multi-device friendly)
    // ==========================================
    if (action === "activate") {
      if (!code || !visitorId) {
        return res.status(400).json({ ok: false, error: "Code and visitor ID required." });
      }

      const accessCode = await supabaseFetch(
        `access_codes?select=*&code=eq.${encodeURIComponent(code)}&limit=1`
      );

      if (!accessCode || !accessCode[0]) {
        return res.status(404).json({ ok: false, error: "Invalid access code." });
      }

      const codeData = accessCode[0];

      if (codeData.status === "blocked") {
        return res.status(403).json({ ok: false, error: "This code is blocked." });
      }

      const now = new Date().toISOString();

      // 1. Activate unused code
      if (codeData.status === "unused") {
        const updated = await supabaseFetch(`access_codes?id=eq.${codeData.id}`, {
          method: "PATCH",
          prefer: "return=representation",
          body: {
            status: "active",
            assigned_visitor_id: visitorId,
            first_ip: ip,
            last_ip: ip,
            last_user_agent: userAgent,
            activated_at: now,
            last_seen_at: now,
          },
        });

        await logEvent({
          code_id: codeData.id,
          code: codeData.code,
          event: "activation_success",
          visitor_id: visitorId,
          ip,
          user_agent: userAgent,
        });

        return res.status(200).json({
          ok: true,
          code: updated[0].code,
          codeId: updated[0].id,
          groupCode: updated[0].group_code,
          groupLabel: "Group", // Fallback
        });
      }

      // 2. Already active -> ALLOW MULTI-DEVICE (Just update last seen)
      if (codeData.status === "active") {
        const updated = await supabaseFetch(`access_codes?id=eq.${codeData.id}`, {
          method: "PATCH",
          prefer: "return=representation",
          body: {
            last_ip: ip,
            last_user_agent: userAgent,
            last_seen_at: now,
          },
        });

        await logEvent({
          code_id: codeData.id,
          code: codeData.code,
          event: "reentry_success",
          visitor_id: visitorId,
          ip,
          user_agent: userAgent,
          details: "multi_device_login",
        });

        return res.status(200).json({
          ok: true,
          code: updated[0].code,
          codeId: updated[0].id,
          groupCode: updated[0].group_code,
          groupLabel: "Group", // Fallback
        });
      }

      return res.status(400).json({ ok: false, error: "This code is not available." });
    }

    // ==========================================
    // PROFILE (Multi-device friendly)
    // ==========================================
    if (action === "profile") {
      if (!code || !visitorId) {
        return res.status(400).json({ ok: false, error: "Code and visitor ID required." });
      }

      const accessCode = await supabaseFetch(
        `access_codes?select=*&code=eq.${encodeURIComponent(code)}&limit=1`
      );

      if (!accessCode || !accessCode[0] || accessCode[0].status !== "active") {
        return res.status(403).json({ ok: false, error: "Invalid access code." });
      }

      const codeData = accessCode[0];

      // ✅ REMOVED: The check that blocked different visitorIds. 
      // Now it just updates last seen and lets them view their profile on any device.

      const now = new Date().toISOString();

      await supabaseFetch(`access_codes?id=eq.${codeData.id}`, {
        method: "PATCH",
        body: {
          last_ip: ip,
          last_user_agent: userAgent,
          last_seen_at: now,
        },
      });

      const messages = await supabaseFetch(
        `messages?select=id,content,status,created_at&owner_code_id=eq.${codeData.id}&order=created_at.desc&limit=200`
      );

      let reactionsByMessage = {};

      if (Array.isArray(messages) && messages.length > 0) {
        const messageIds = messages.map((m) => m.id).join(",");
        const reactions = await supabaseFetch(
          `reactions?select=message_id,reaction_type&message_id=in.(${messageIds})`
        );

        if (Array.isArray(reactions)) {
          for (const reaction of reactions) {
            if (!reactionsByMessage[reaction.message_id]) {
              reactionsByMessage[reaction.message_id] = {};
            }
            reactionsByMessage[reaction.message_id][reaction.reaction_type] =
              (reactionsByMessage[reaction.message_id][reaction.reaction_type] || 0) + 1;
          }
        }
      }

      const messagesWithReactions = Array.isArray(messages)
        ? messages.map((message) => ({
            ...message,
            reactions: reactionsByMessage[message.id] || {},
          }))
        : [];

      return res.status(200).json({
        ok: true,
        code: codeData.code,
        codeId: codeData.id,
        groupCode: codeData.group_code,
        messages: messagesWithReactions,
      });
    }

    return res.status(400).json({ ok: false, error: "Unknown action." });
  } catch (error) {
    console.error("Gate API error:", error);
    return res.status(500).json({ ok: false, error: "Server error: " + error.message });
  }
};
