const ChatbotSession = require("../models/ChatbotSession");

const SYSTEM_INSTRUCTION_TEXT = "You are MindMate, a warm, empathetic, and professional mental health AI companion. Your goal is to support students with stress, anxiety, academic pressure, and emotional well-being. Provide gentle validation, active listening, and evidence-based coping strategies (like mindfulness, breathing exercises, cognitive reframing, and study planning). If the student expresses severe distress, self-harm, or emergency situations, gently encourage them to seek professional support, connect them with clinical resources, and remind them that you are an AI assistant and not a replacement for professional therapy. Keep responses warm, encouraging, concise (2-4 sentences is usually ideal), and structured with paragraphs. Do not give medical diagnoses or prescribe medications.";

async function getGeminiResponse(contextMessages) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("AI Chatbot service is not configured (missing Gemini API Key).");
  }

  const geminiContents = contextMessages.map((msg) => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.content }],
  }));

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
          parts: [{ text: SYSTEM_INSTRUCTION_TEXT }],
        },
      }),
    }
  );

  if (!geminiResponse.ok) {
    const errData = await geminiResponse.json().catch(() => ({}));
    throw new Error(`Gemini API returned status ${geminiResponse.status}: ${JSON.stringify(errData)}`);
  }

  const data = await geminiResponse.json();
  const botResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!botResponse) {
    throw new Error("Invalid response format from Gemini API");
  }

  return botResponse;
}

exports.getSessions = async (req, res, next) => {
  try {
    await ChatbotSession.ensureTables();
    const sessions = await ChatbotSession.getAll(req.user.id);
    res.json(sessions);
  } catch (err) {
    next(err);
  }
};

exports.createSession = async (req, res, next) => {
  try {
    await ChatbotSession.ensureTables();
    const title = req.body.title && req.body.title.trim() ? req.body.title.trim() : "New Conversation";
    const session = await ChatbotSession.create(req.user.id, title);
    res.status(201).json(session);
  } catch (err) {
    next(err);
  }
};

exports.deleteSession = async (req, res, next) => {
  try {
    await ChatbotSession.ensureTables();
    const success = await ChatbotSession.delete(req.params.id, req.user.id);
    if (!success) {
      return res.status(404).json({
        status: "error",
        message: "Chat session not found or access denied",
      });
    }
    res.json({ status: "success", message: "Chat session deleted successfully" });
  } catch (err) {
    next(err);
  }
};

exports.getMessages = async (req, res, next) => {
  try {
    await ChatbotSession.ensureTables();
    const session = await ChatbotSession.verifyOwnership(req.params.id, req.user.id);
    if (!session) {
      return res.status(404).json({
        status: "error",
        message: "Chat session not found or access denied",
      });
    }
    const messages = await ChatbotSession.getMessages(req.params.id);
    res.json(messages);
  } catch (err) {
    next(err);
  }
};

exports.postMessage = async (req, res, next) => {
  try {
    await ChatbotSession.ensureTables();
    const userId = req.user.id;
    const sessionId = req.params.id;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ status: "error", message: "Message content is required" });
    }

    const session = await ChatbotSession.verifyOwnership(sessionId, userId);
    if (!session) {
      return res.status(404).json({ status: "error", message: "Chat session not found or access denied" });
    }

    const trimmedMsg = message.trim();
    const userMessageObj = await ChatbotSession.addMessage(userId, sessionId, "user", trimmedMsg);
    
    const contextMessages = await ChatbotSession.getContextMessages(sessionId, 10);
    
    let botResponse;
    try {
      botResponse = await getGeminiResponse(contextMessages);
    } catch (apiErr) {
      return res.status(500).json({ status: "error", message: apiErr.message });
    }

    const botMessageObj = await ChatbotSession.addMessage(userId, sessionId, "assistant", botResponse.trim());

    if (session.title === "New Conversation" || session.title === "New Chat") {
      let newTitle = trimmedMsg.length > 25 ? trimmedMsg.slice(0, 25) + "..." : trimmedMsg;
      await ChatbotSession.updateTitle(sessionId, newTitle);
    }

    res.status(201).json({
      status: "success",
      userMessage: userMessageObj,
      botMessage: botMessageObj,
    });
  } catch (err) {
    next(err);
  }
};

exports.getBackwardCompatibleSession = async (req, res, next) => {
  try {
    await ChatbotSession.ensureTables();
    const userId = req.user.id;
    
    let session = await ChatbotSession.getLatestSession(userId);
    let sessionId;
    if (!session) {
      const newSession = await ChatbotSession.create(userId, "Default Chat");
      sessionId = newSession.id;
    } else {
      sessionId = session.id;
    }

    const messages = await ChatbotSession.getMessages(sessionId);
    res.json(messages);
  } catch (err) {
    next(err);
  }
};

exports.postBackwardCompatibleSession = async (req, res, next) => {
  try {
    await ChatbotSession.ensureTables();
    const userId = req.user.id;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ status: "error", message: "Message content is required" });
    }

    let session = await ChatbotSession.getLatestSession(userId);
    let sessionId, sessionTitle;

    if (!session) {
      const newSession = await ChatbotSession.create(userId, "Default Chat");
      sessionId = newSession.id;
      sessionTitle = newSession.title;
    } else {
      sessionId = session.id;
      sessionTitle = session.title;
    }

    const trimmedMsg = message.trim();
    const userMessageObj = await ChatbotSession.addMessage(userId, sessionId, "user", trimmedMsg);
    
    const contextMessages = await ChatbotSession.getContextMessages(sessionId, 10);
    
    let botResponse;
    try {
      botResponse = await getGeminiResponse(contextMessages);
    } catch (apiErr) {
      return res.status(500).json({ status: "error", message: apiErr.message });
    }

    const botMessageObj = await ChatbotSession.addMessage(userId, sessionId, "assistant", botResponse.trim());

    if (sessionTitle === "Default Chat" || sessionTitle === "New Conversation" || sessionTitle === "New Chat") {
      let newTitle = trimmedMsg.length > 25 ? trimmedMsg.slice(0, 25) + "..." : trimmedMsg;
      await ChatbotSession.updateTitle(sessionId, newTitle);
    }

    res.status(201).json({
      status: "success",
      userMessage: userMessageObj,
      botMessage: botMessageObj,
    });
  } catch (err) {
    next(err);
  }
};
