const ContactMessage = require("../models/ContactMessage");
const { sendContactSubmissionEmail } = require("../utils/emailService");

exports.submitContactForm = async (req, res, next) => {
  try {
    await ContactMessage.initTable();
    const { name, email, subject, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ message: "Name, email, and message are required." });
    }

    const newContact = await ContactMessage.create({ name, email, subject, message });

    sendContactSubmissionEmail({ name, email, subject, message }).catch((err) => {
      console.error("Failed to send contact submission email notification:", err);
    });

    res.status(201).json({
      status: "success",
      message: "Thank you! Your message has been sent to our administrator.",
      contactId: newContact.id,
    });
  } catch (error) {
    next(error);
  }
};
