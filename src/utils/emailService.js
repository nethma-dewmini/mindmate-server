const nodemailer = require("nodemailer");

// Create transport configuration
const createTransporter = () => {
  const nodemailerConfigPresent =
    process.env.MAIL_HOST && process.env.MAIL_USER && process.env.MAIL_PASS;

  if (!nodemailerConfigPresent) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: Number(process.env.MAIL_PORT) || 587,
    secure: process.env.MAIL_SECURE === "true",
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
  });
};

// Generic mail helper
const sendMail = async ({ to, subject, text, html }) => {
  const transporter = createTransporter();
  const from = process.env.MAIL_FROM || process.env.MAIL_USER || "noreply@mindmate.com";

  if (!transporter) {
    // Console fallback logging for local development when SMTP is not configured
    console.log("\n==================================================");
    console.log("📨  [EMAIL SENT (DEV FALLBACK - SMTP NOT CONFIGURED)]");
    console.log(`To:      ${to}`);
    console.log(`From:    ${from}`);
    console.log(`Subject: ${subject}`);
    console.log("--------------------------------------------------");
    console.log("Text Body:\n", text);
    console.log("--------------------------------------------------");
    console.log("HTML Body:\n", html);
    console.log("==================================================\n");
    return true;
  }

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
    });
    console.log(`📨 Email sent successfully to ${to} (ID: ${info.messageId})`);
    return !!info;
  } catch (err) {
    console.error("❌ Failed to send email via SMTP:", err);
    return false;
  }
};

/**
 * Send password reset email
 */
const sendPasswordResetEmail = async (email, resetLink) => {
  const subject = "MindMate - Reset Your Password";
  const text = `Reset your password by visiting: ${resetLink}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #5bb5a1; border-bottom: 2px solid #5bb5a1; padding-bottom: 10px;">Reset Your Password</h2>
      <p>Hello,</p>
      <p>We received a request to reset your password for your MindMate account. Please click the button below to set a new password:</p>
      <div style="margin: 30px 0; text-align: center;">
        <a href="${resetLink}" style="background-color: #5bb5a1; color: white; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 6px; display: inline-block;">Reset Password</a>
      </div>
      <p>If you did not request a password reset, you can safely ignore this email.</p>
      <p>This link is valid for 60 minutes.</p>
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin-top: 30px;" />
      <p style="font-size: 12px; color: #a0aec0; text-align: center;">MindMate Mental Health Solutions</p>
    </div>
  `;
  return await sendMail({ to: email, subject, text, html });
};

/**
 * Notify admin when an expert application is submitted
 */
const sendExpertApplicationAdminNotification = async (app) => {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@mindmate.com";
  const subject = `[MindMate Admin] New Expert Application: ${app.name}`;
  const text = `A new expert application has been submitted by ${app.name} (${app.email}) for review. Check the Admin Dashboard to review.`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #4a5568; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">New Expert Application</h2>
      <p>Hello Admin,</p>
      <p>A new professional mental health expert application has been submitted and is pending review:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr>
          <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #edf2f7; width: 120px;">Name:</td>
          <td style="padding: 8px; border-bottom: 1px solid #edf2f7;">${app.name}</td>
        </tr>
        <tr>
          <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #edf2f7;">Title:</td>
          <td style="padding: 8px; border-bottom: 1px solid #edf2f7;">${app.title || "N/A"}</td>
        </tr>
        <tr>
          <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #edf2f7;">Email:</td>
          <td style="padding: 8px; border-bottom: 1px solid #edf2f7;">${app.email}</td>
        </tr>
        <tr>
          <td style="padding: 8px; font-weight: bold; border-bottom: 1px solid #edf2f7;">Specialization:</td>
          <td style="padding: 8px; border-bottom: 1px solid #edf2f7;">${app.specialization || "N/A"}</td>
        </tr>
      </table>
      <p>Please log in to the MindMate Admin Dashboard to inspect their uploaded documents and take action on the application.</p>
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin-top: 30px;" />
      <p style="font-size: 12px; color: #a0aec0; text-align: center;">MindMate Admin Notifications</p>
    </div>
  `;
  return await sendMail({ to: adminEmail, subject, text, html });
};

/**
 * Send approval email to approved expert
 */
const sendExpertApplicationApprovedEmail = async (email, name) => {
  const subject = "MindMate - Your Expert Application Has Been Approved!";
  const text = `Hello ${name},\n\nWe are excited to inform you that your application to join MindMate as a licensed mental health professional has been approved! Before you can log in, please register your account and set up your password at the expert registration page: ${process.env.CLIENT_ORIGIN || "http://localhost:5173"}/expert/register?email=${encodeURIComponent(email)}\n\nBest regards,\nThe MindMate Team`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #5bb5a1; border-bottom: 2px solid #5bb5a1; padding-bottom: 10px;">Application Approved!</h2>
      <p>Hello ${name},</p>
      <p>We are delighted to inform you that your application to join MindMate as a licensed mental health professional has been **approved** by our administration team!</p>
      <p>Please register your account and set up your password to get started. Once registered, you will be able to:</p>
      <ul>
        <li>Access your Expert Dashboard</li>
        <li>Create and schedule live group sessions for students</li>
        <li>Upload mental wellness resources, articles, and guides</li>
        <li>Review student assessments and support requests</li>
      </ul>
      <div style="margin: 30px 0; text-align: center;">
        <a href="${process.env.CLIENT_ORIGIN || "http://localhost:5173"}/expert/register?email=${encodeURIComponent(email)}" style="background-color: #5bb5a1; color: white; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 6px; display: inline-block;">Create Expert Account</a>
      </div>
      <p>Welcome to our community, and thank you for partnering with us to support student mental wellness!</p>
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin-top: 30px;" />
      <p style="font-size: 12px; color: #a0aec0; text-align: center;">The MindMate Support Team</p>
    </div>
  `;
  return await sendMail({ to: email, subject, text, html });
};

/**
 * Send session booking confirmation email to student
 */
const sendSessionBookingEmail = async ({
  studentEmail,
  studentName,
  expertName,
  topic,
  sessionDate,
  sessionTime,
  meetingLink,
  meetingDetails
}) => {
  const subject = `MindMate - Booking Confirmed: ${topic}`;
  
  // Format the date
  let dateStr = sessionDate;
  if (sessionDate instanceof Date) {
    dateStr = sessionDate.toLocaleDateString("en-US", {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  } else if (typeof sessionDate === "string") {
    try {
      const parsed = new Date(sessionDate);
      if (!isNaN(parsed.getTime())) {
        dateStr = parsed.toLocaleDateString("en-US", {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
      }
    } catch (e) {}
  }

  const text = `Hello ${studentName},\n\nYour booking for the live group session "${topic}" hosted by ${expertName} has been confirmed.\n\nSession Details:\n- Date: ${dateStr}\n- Time: ${sessionTime}\n- Join Link: ${meetingLink || "To be provided by the expert"}\n- Instructions: ${meetingDetails || "None"}\n\nBest regards,\nThe MindMate Team`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #5bb5a1; border-bottom: 2px solid #5bb5a1; padding-bottom: 10px;">Live Session Booking Confirmed</h2>
      <p>Hello ${studentName},</p>
      <p>Your booking for the upcoming live group session has been successfully confirmed. Please find the session details below:</p>
      
      <div style="background-color: #f7fafc; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #5bb5a1;">
        <p style="margin: 5px 0;"><strong>Topic:</strong> ${topic}</p>
        <p style="margin: 5px 0;"><strong>Hosted By:</strong> ${expertName}</p>
        <p style="margin: 5px 0;"><strong>Date:</strong> ${dateStr}</p>
        <p style="margin: 5px 0;"><strong>Time:</strong> ${sessionTime}</p>
      </div>

      <h3 style="color: #2d3748;">Joining Details</h3>
      ${meetingLink ? `
        <p>You can join the live meeting using the following link:</p>
        <div style="margin: 20px 0; text-align: center;">
          <a href="${meetingLink}" target="_blank" style="background-color: #5bb5a1; color: white; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 6px; display: inline-block;">Join Live Session</a>
        </div>
      ` : `
        <p style="color: #e53e3e; font-style: italic;">The meeting link has not been created. Please check your student dashboard closer to the session time to retrieve the joining link.</p>
      `}

      ${meetingDetails ? `
        <div style="margin-top: 15px;">
          <strong>Additional Instructions:</strong>
          <p style="background-color: #fffaf0; padding: 10px; border-radius: 6px; border: 1px solid #feebc8; margin-top: 5px; font-size: 14px; color: #7b341e;">${meetingDetails}</p>
        </div>
      ` : ""}

      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin-top: 30px;" />
      <p style="font-size: 12px; color: #a0aec0; text-align: center;">The MindMate Support Team</p>
    </div>
  `;

  return await sendMail({ to: studentEmail, subject, text, html });
};

/**
 * Broadcast new session notification to all registered students
 */
const broadcastNewSessionEmail = async ({ session, expertName, students }) => {
  const subject = `MindMate - New Live Group Session Scheduled: ${session.topic}`;

  // Helper for batching / throttling
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const CHUNK_SIZE = 10;
  const CHUNK_DELAY = 1000; // 1 second delay between chunks

  // Format date
  let dateStr = session.session_date;
  if (session.session_date instanceof Date) {
    dateStr = session.session_date.toLocaleDateString("en-US", {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  } else if (typeof session.session_date === "string") {
    try {
      const parsed = new Date(session.session_date);
      if (!isNaN(parsed.getTime())) {
        dateStr = parsed.toLocaleDateString("en-US", {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
      }
    } catch (e) {}
  }

  console.log(`📨 Starting session broadcast to ${students.length} students...`);

  // Split students into chunks
  for (let i = 0; i < students.length; i += CHUNK_SIZE) {
    const chunk = students.slice(i, i + CHUNK_SIZE);
    
    // Process chunk in parallel
    await Promise.all(
      chunk.map(async (student) => {
        try {
          const text = `Hello ${student.name},\n\nA new live group session "${session.topic}" hosted by ${expertName} has been scheduled.\n\nSession Details:\n- Date: ${dateStr}\n- Time: ${session.session_time}\n- Topic: ${session.topic}\n- Description: ${session.content || "No description provided."}\n\nYou can log in to your MindMate dashboard to view or book this session.\n\nBest regards,\nThe MindMate Team`;
          
          const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
              <h2 style="color: #5bb5a1; border-bottom: 2px solid #5bb5a1; padding-bottom: 10px;">New Live Group Session Scheduled</h2>
              <p>Hello ${student.name},</p>
              <p>A new live group session has been scheduled that you can participate in to support your wellness journey:</p>
              
              <div style="background-color: #f7fafc; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #5bb5a1;">
                <p style="margin: 5px 0;"><strong>Topic:</strong> ${session.topic}</p>
                <p style="margin: 5px 0;"><strong>Hosted By:</strong> ${expertName}</p>
                <p style="margin: 5px 0;"><strong>Date:</strong> ${dateStr}</p>
                <p style="margin: 5px 0;"><strong>Time:</strong> ${session.session_time}</p>
              </div>

              ${session.content ? `
                <div style="margin: 15px 0;">
                  <strong>Description:</strong>
                  <p style="margin-top: 5px; color: #4a5568; line-height: 1.5; white-space: pre-wrap;">${session.content}</p>
                </div>
              ` : ""}

              <div style="margin: 30px 0; text-align: center;">
                <a href="${process.env.CLIENT_ORIGIN || "http://localhost:5173"}/login" style="background-color: #5bb5a1; color: white; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 6px; display: inline-block;">Log In & Book Session</a>
              </div>
              <p>Take care of yourself,</p>
              <hr style="border: 0; border-top: 1px solid #e2e8f0; margin-top: 30px;" />
              <p style="font-size: 12px; color: #a0aec0; text-align: center;">The MindMate Support Team</p>
            </div>
          `;

          await sendMail({ to: student.email, subject, text, html });
        } catch (err) {
          console.error(`❌ Failed to send broadcast email to ${student.email}:`, err);
        }
      })
    );

    // Apply throttling delay between chunks
    if (i + CHUNK_SIZE < students.length) {
      await delay(CHUNK_DELAY);
    }
  }

  console.log(`📨 Completed session broadcast to all students.`);
};

module.exports = {
  sendPasswordResetEmail,
  sendExpertApplicationAdminNotification,
  sendExpertApplicationApprovedEmail,
  sendSessionBookingEmail,
  broadcastNewSessionEmail,
};
