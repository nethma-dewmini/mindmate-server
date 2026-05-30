const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

/**
 * Lazy-load/ensure schema for chatbot_messages
 */
async function ensureChatbotMessagesTable() {
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

/**
 * Keyword-based, mental-health-themed simulated fallback engine
 */
function generateSimulatedResponse(userMessage) {
  const msg = String(userMessage || "").toLowerCase();

  if (
    msg.includes("anxious") ||
    msg.includes("anxiety") ||
    msg.includes("panic") ||
    msg.includes("scared")
  ) {
    return "I hear you, and it is completely understandable to feel anxious. When anxiety peaks, it helps to ground yourself. Let's try a simple box breath together: inhale for 4 seconds, hold for 4, exhale for 4, and hold for 4. How does your body feel right now?";
  }

  if (
    msg.includes("stress") ||
    msg.includes("exam") ||
    msg.includes("study") ||
    msg.includes("overwhelm") ||
    msg.includes("pressure")
  ) {
    return "Exam and study stress can feel incredibly overwhelming when tasks pile up. Remember, you don't have to tackle everything at once. Let's try breaking your work into smaller, manageable steps. Have you taken a short break or walked around recently?";
  }

  if (
    msg.includes("sad") ||
    msg.includes("lonely") ||
    msg.includes("depressed") ||
    msg.includes("cry") ||
    msg.includes("heartbroken")
  ) {
    return "I'm really sorry you are going through this. Feeling down or lonely is incredibly difficult, but please remember you're not alone. I'm here to listen. Would you like to tell me more about what is weighing on your heart today?";
  }

  if (
    msg.includes("suicide") ||
    msg.includes("kill myself") ||
    msg.includes("self-harm") ||
    msg.includes("hurt myself") ||
    msg.includes("ending my life")
  ) {
    return "I hear how much pain you are in right now, but please know that you are not alone and there is help available. Because I'm an AI, I cannot provide emergency counseling. Please connect with our university counseling services immediately, or call a crisis hotline (like 1926 in Sri Lanka). Your safety and life are extremely important.";
  }

  if (
    msg.includes("hello") ||
    msg.includes("hi ") ||
    msg.includes("hey") ||
    msg.includes("good morning") ||
    msg.includes("good afternoon")
  ) {
    return "Hello! I'm MindMate, your mental health companion. I'm here to offer a safe space for you to talk, share your thoughts, or learn coping strategies. What's on your mind today?";
  }

  const defaultResponses = [
    "Thank you for sharing that with me. I'm here to support you. Can you tell me a bit more about how that is affecting you?",
    "I understand. It sounds like you are processing a lot right now. Remember to be gentle with yourself. What would feel most supportive for you in this moment?",
    "I hear you, and I'm listening. As your MindMate companion, I want to help you work through this. Would you like to explore some coping techniques or just talk?",
  ];

  return defaultResponses[Math.floor(Math.random() * defaultResponses.length)];
}

// Protect all routes under this router
router.use(requireAuth);
router.use(requireStudent);

/**
 * GET /api/chatbot
 * Load conversation history for the student
 */
router.get("/", async (req, res, next) => {
  try {
    await ensureChatbotMessagesTable();
    const userId = req.user.id;

    const result = await db.query(
      "SELECT id, role, content, created_at FROM chatbot_messages WHERE user_id = $1 ORDER BY created_at ASC",
      [userId]
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/chatbot
 * Send a message and retrieve the AI assistant's response
 */
router.post("/", async (req, res, next) => {
  try {
    await ensureChatbotMessagesTable();
    const userId = req.user.id;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        status: "error",
        message: "Message content is required",
      });
    }

    const trimmedMsg = message.trim();

    // 1. Persist User Message
    const userInsert = await db.query(
      "INSERT INTO chatbot_messages (user_id, role, content) VALUES ($1, 'user', $2) RETURNING id, role, content, created_at",
      [userId, trimmedMsg]
    );
    const userMessageObj = userInsert.rows[0];

    // 2. Fetch last 10 messages for conversational context
    const contextRes = await db.query(
      "SELECT role, content FROM chatbot_messages WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10",
      [userId]
    );
    const contextMessages = contextRes.rows.reverse();

    // 3. Generate chatbot response
    let botResponse = "";
    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey) {
      try {
        const geminiContents = contextMessages.map((msg) => ({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: msg.content }],
        }));

        const systemInstructionText =
          "You are MindMate, a warm, empathetic, and professional mental health AI companion. Your goal is to support students with stress, anxiety, academic pressure, and emotional well-being. Provide gentle validation, active listening, and evidence-based coping strategies (like mindfulness, breathing exercises, cognitive reframing, and study planning). If the student expresses severe distress, self-harm, or emergency situations, gently encourage them to seek professional support, connect them with clinical resources, and remind them that you are an AI assistant and not a replacement for professional therapy. Keep responses warm, encouraging, concise (2-4 sentences is usually ideal), and structured with paragraphs. Do not give medical diagnoses or prescribe medications.";

        const geminiResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
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
        botResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!botResponse) {
          throw new Error("Invalid response format from Gemini API");
        }
      } catch (err) {
        console.error("Gemini API call failed, falling back to simulated response:", err);
        botResponse = generateSimulatedResponse(trimmedMsg);
      }
    } else {
      botResponse = generateSimulatedResponse(trimmedMsg);
    }

    // 4. Persist Bot Message
    const botInsert = await db.query(
      "INSERT INTO chatbot_messages (user_id, role, content) VALUES ($1, 'assistant', $2) RETURNING id, role, content, created_at",
      [userId, botResponse.trim()]
    );
    const botMessageObj = botInsert.rows[0];

    // 5. Respond to client
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
