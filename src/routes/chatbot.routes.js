const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

/**
 * Lazy-load/ensure schema for chatbot_sessions and chatbot_messages
 */
async function ensureChatbotSessionsTable() {
  // 1. Create chatbot_sessions table
  await db.query(`
    CREATE TABLE IF NOT EXISTS chatbot_sessions (
      id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
      user_id UUID NOT NULL REFERENCES unistudents(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT 'New Conversation',
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  await db.query(
    "CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_user_id ON chatbot_sessions(user_id)"
  );

  // 2. Create chatbot_messages table if not exists
  await db.query(`
    CREATE TABLE IF NOT EXISTS chatbot_messages (
      id UUID PRIMARY KEY DEFAULT COALESCE(uuid_generate_v4()::uuid, gen_random_uuid()),
      user_id UUID NOT NULL REFERENCES unistudents(id) ON DELETE CASCADE,
      role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  await db.query(
    "CREATE INDEX IF NOT EXISTS idx_chatbot_messages_user_id ON chatbot_messages(user_id)"
  );
  await db.query(
    "CREATE INDEX IF NOT EXISTS idx_chatbot_messages_created_at ON chatbot_messages(created_at)"
  );

  // 3. Add session_id column to chatbot_messages if not exists
  await db.query(`
    ALTER TABLE chatbot_messages ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES chatbot_sessions(id) ON DELETE CASCADE
  `);

  // 4. Data migration for orphaned records
  await db.query(`
    DO $$
    DECLARE
      r RECORD;
      new_session_id UUID;
    BEGIN
      FOR r IN SELECT DISTINCT user_id FROM chatbot_messages WHERE session_id IS NULL LOOP
        INSERT INTO chatbot_sessions (user_id, title)
        VALUES (r.user_id, 'Default Chat')
        RETURNING id INTO new_session_id;

        UPDATE chatbot_messages
        SET session_id = new_session_id
        WHERE user_id = r.user_id AND session_id IS NULL;
      END LOOP;
    END $$;
  `);

  // 5. Enforce NOT NULL constraint
  await db.query(`
    ALTER TABLE chatbot_messages ALTER COLUMN session_id SET NOT NULL
  `);
}

/**
 * Redirection/Role validation guard specifically for student-only chatbot access
 */
function requireStudent(req, res, next) {
  if (req.user?.role !== "student") {
    return res.status(403).json({
      status: "error",
      message: "Only students are allowed to access the AI Chatbot companion",
    });
  }
  return next();
}

// Protect all routes under this router
router.use(requireAuth);
router.use(requireStudent);

/**
 * GET /api/chatbot/sessions
 * Retrieve all chat sessions for the logged-in student
 */
router.get("/sessions", async (req, res, next) => {
  try {
    await ensureChatbotSessionsTable();
    const userId = req.user.id;

    const result = await db.query(
      "SELECT id, title, created_at FROM chatbot_sessions WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/chatbot/sessions
 * Create a new chat session
 */
router.post("/sessions", async (req, res, next) => {
  try {
    await ensureChatbotSessionsTable();
    const userId = req.user.id;
    const { title } = req.body;
    const sessionTitle = title && title.trim() ? title.trim() : "New Conversation";

    const result = await db.query(
      "INSERT INTO chatbot_sessions (user_id, title) VALUES ($1, $2) RETURNING id, title, created_at",
      [userId, sessionTitle]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/chatbot/sessions/:id
 * Delete a specific chat session
 */
router.delete("/sessions/:id", async (req, res, next) => {
  try {
    await ensureChatbotSessionsTable();
    const userId = req.user.id;
    const sessionId = req.params.id;

    // Verify session belongs to user
    const verifyRes = await db.query(
      "SELECT id FROM chatbot_sessions WHERE id = $1 AND user_id = $2",
      [sessionId, userId]
    );
    if (verifyRes.rowCount === 0) {
      return res.status(404).json({
        status: "error",
        message: "Chat session not found or access denied",
      });
    }

    await db.query("DELETE FROM chatbot_sessions WHERE id = $1", [sessionId]);
    res.json({ status: "success", message: "Chat session deleted successfully" });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/chatbot/sessions/:id/messages
 * Load all messages in a specific chat session
 */
router.get("/sessions/:id/messages", async (req, res, next) => {
  try {
    await ensureChatbotSessionsTable();
    const userId = req.user.id;
    const sessionId = req.params.id;

    // Verify session belongs to user
    const verifyRes = await db.query(
      "SELECT id FROM chatbot_sessions WHERE id = $1 AND user_id = $2",
      [sessionId, userId]
    );
    if (verifyRes.rowCount === 0) {
      return res.status(404).json({
        status: "error",
        message: "Chat session not found or access denied",
      });
    }

    const result = await db.query(
      "SELECT id, role, content, created_at FROM chatbot_messages WHERE session_id = $1 ORDER BY created_at ASC",
      [sessionId]
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/chatbot/sessions/:id/messages
 * Post a message to a specific session and get AI response
 */
router.post("/sessions/:id/messages", async (req, res, next) => {
  try {
    await ensureChatbotSessionsTable();
    const userId = req.user.id;
    const sessionId = req.params.id;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        status: "error",
        message: "Message content is required",
      });
    }

    // Verify session belongs to user
    const sessionRes = await db.query(
      "SELECT id, title FROM chatbot_sessions WHERE id = $1 AND user_id = $2",
      [sessionId, userId]
    );
    if (sessionRes.rowCount === 0) {
      return res.status(404).json({
        status: "error",
        message: "Chat session not found or access denied",
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        status: "error",
        message: "AI Chatbot service is not configured (missing Gemini API Key).",
      });
    }

    const trimmedMsg = message.trim();

    // 1. Persist User Message
    const userInsert = await db.query(
      "INSERT INTO chatbot_messages (user_id, session_id, role, content) VALUES ($1, $2, $3, $4) RETURNING id, role, content, created_at",
      [userId, sessionId, "user", trimmedMsg]
    );
    const userMessageObj = userInsert.rows[0];

    // 2. Fetch last 10 messages in this session
    const contextRes = await db.query(
      "SELECT role, content FROM chatbot_messages WHERE session_id = $1 ORDER BY created_at DESC LIMIT 10",
      [sessionId]
    );
    const contextMessages = contextRes.rows.reverse();

    // 3. Generate response via Gemini API
    const geminiContents = contextMessages.map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

    const systemInstructionText =
      "You are MindMate, a warm, empathetic, and professional mental health AI companion. Your goal is to support students with stress, anxiety, academic pressure, and emotional well-being. Provide gentle validation, active listening, and evidence-based coping strategies (like mindfulness, breathing exercises, cognitive reframing, and study planning). If the student expresses severe distress, self-harm, or emergency situations, gently encourage them to seek professional support, connect them with clinical resources, and remind them that you are an AI assistant and not a replacement for professional therapy. Keep responses warm, encouraging, concise (2-4 sentences is usually ideal), and structured with paragraphs. Do not give medical diagnoses or prescribe medications.";

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: geminiContents,
          systemInstruction: {
            parts: [{ text: systemInstructionText }],
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errData = await geminiResponse.json().catch(() => ({}));
      throw new Error(
        `Gemini API returned status ${geminiResponse.status}: ${JSON.stringify(errData)}`
      );
    }

    const data = await geminiResponse.json();
    const botResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!botResponse) {
      throw new Error("Invalid response format from Gemini API");
    }

    // 4. Persist Bot Message
    const botInsert = await db.query(
      "INSERT INTO chatbot_messages (user_id, session_id, role, content) VALUES ($1, $2, $3, $4) RETURNING id, role, content, created_at",
      [userId, sessionId, "assistant", botResponse.trim()]
    );
    const botMessageObj = botInsert.rows[0];

    // 5. Dynamically rename session title if it is the default
    const sessionTitle = sessionRes.rows[0].title;
    if (sessionTitle === "New Conversation" || sessionTitle === "New Chat") {
      let newTitle = trimmedMsg.length > 25 ? trimmedMsg.slice(0, 25) + "..." : trimmedMsg;
      await db.query(
        "UPDATE chatbot_sessions SET title = $1 WHERE id = $2",
        [newTitle, sessionId]
      );
    }

    // 6. Respond to client
    res.status(201).json({
      status: "success",
      userMessage: userMessageObj,
      botMessage: botMessageObj,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/chatbot
 * Backward-compatible endpoint (loads messages of the most recent session)
 */
router.get("/", async (req, res, next) => {
  try {
    await ensureChatbotSessionsTable();
    const userId = req.user.id;

    // Find the most recent session
    let sessionRes = await db.query(
      "SELECT id FROM chatbot_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
      [userId]
    );

    let sessionId;
    if (sessionRes.rowCount === 0) {
      const createSessionRes = await db.query(
        "INSERT INTO chatbot_sessions (user_id, title) VALUES ($1, 'Default Chat') RETURNING id",
        [userId]
      );
      sessionId = createSessionRes.rows[0].id;
    } else {
      sessionId = sessionRes.rows[0].id;
    }

    const result = await db.query(
      "SELECT id, role, content, created_at FROM chatbot_messages WHERE session_id = $1 ORDER BY created_at ASC",
      [sessionId]
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/chatbot
 * Backward-compatible endpoint (sends message to the most recent session)
 */
router.post("/", async (req, res, next) => {
  try {
    await ensureChatbotSessionsTable();
    const userId = req.user.id;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        status: "error",
        message: "Message content is required",
      });
    }

    // Find the most recent session
    let sessionRes = await db.query(
      "SELECT id, title FROM chatbot_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
      [userId]
    );

    let sessionId;
    let sessionTitle;
    if (sessionRes.rowCount === 0) {
      const createSessionRes = await db.query(
        "INSERT INTO chatbot_sessions (user_id, title) VALUES ($1, 'Default Chat') RETURNING id, title",
        [userId]
      );
      sessionId = createSessionRes.rows[0].id;
      sessionTitle = createSessionRes.rows[0].title;
    } else {
      sessionId = sessionRes.rows[0].id;
      sessionTitle = sessionRes.rows[0].title;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        status: "error",
        message: "AI Chatbot service is not configured (missing Gemini API Key).",
      });
    }

    const trimmedMsg = message.trim();

    // 1. Persist User Message
    const userInsert = await db.query(
      "INSERT INTO chatbot_messages (user_id, session_id, role, content) VALUES ($1, $2, $3, $4) RETURNING id, role, content, created_at",
      [userId, sessionId, "user", trimmedMsg]
    );
    const userMessageObj = userInsert.rows[0];

    // 2. Fetch last 10 messages
    const contextRes = await db.query(
      "SELECT role, content FROM chatbot_messages WHERE session_id = $1 ORDER BY created_at DESC LIMIT 10",
      [sessionId]
    );
    const contextMessages = contextRes.rows.reverse();

    // 3. Call Gemini API
    const geminiContents = contextMessages.map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

    const systemInstructionText =
      "You are MindMate, a warm, empathetic, and professional mental health AI companion. Your goal is to support students with stress, anxiety, academic pressure, and emotional well-being. Provide gentle validation, active listening, and evidence-based coping strategies (like mindfulness, breathing exercises, cognitive reframing, and study planning). If the student expresses severe distress, self-harm, or emergency situations, gently encourage them to seek professional support, connect them with clinical resources, and remind them that you are an AI assistant and not a replacement for professional therapy. Keep responses warm, encouraging, concise (2-4 sentences is usually ideal), and structured with paragraphs. Do not give medical diagnoses or prescribe medications.";

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: geminiContents,
          systemInstruction: {
            parts: [{ text: systemInstructionText }],
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errData = await geminiResponse.json().catch(() => ({}));
      throw new Error(
        `Gemini API returned status ${geminiResponse.status}: ${JSON.stringify(errData)}`
      );
    }

    const data = await geminiResponse.json();
    const botResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!botResponse) {
      throw new Error("Invalid response format from Gemini API");
    }

    // 4. Persist Bot Message
    const botInsert = await db.query(
      "INSERT INTO chatbot_messages (user_id, session_id, role, content) VALUES ($1, $2, $3, $4) RETURNING id, role, content, created_at",
      [userId, sessionId, "assistant", botResponse.trim()]
    );
    const botMessageObj = botInsert.rows[0];

    // 5. Update session title if appropriate
    if (sessionTitle === "Default Chat" || sessionTitle === "New Conversation" || sessionTitle === "New Chat") {
      let newTitle = trimmedMsg.length > 25 ? trimmedMsg.slice(0, 25) + "..." : trimmedMsg;
      await db.query(
        "UPDATE chatbot_sessions SET title = $1 WHERE id = $2",
        [newTitle, sessionId]
      );
    }

    // 6. Respond to client
    res.status(201).json({
      status: "success",
      userMessage: userMessageObj,
      botMessage: botMessageObj,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
