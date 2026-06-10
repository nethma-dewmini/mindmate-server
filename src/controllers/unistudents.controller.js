const User = require("../models/User");
const AssessmentResult = require("../models/AssessmentResult");
const GroupSessionBooking = require("../models/GroupSessionBooking");
const MoodEntry = require("../models/MoodEntry");

exports.getProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const user = await User.getProfile(userId);

    if (!user) {
      return res.status(404).json({ status: "error", message: "User not found" });
    }

    const daysActive = await User.getDaysActive(userId);
    const assessmentsCount = await AssessmentResult.countByUserId(userId);
    const bookingsCount = await GroupSessionBooking.countByStudentId(userId);
    const moodLogsCount = await MoodEntry.countDistinctDays(userId);

    let moodStreak = 0;
    try {
      const loggedDates = await MoodEntry.getLoggedDates(userId);
      if (loggedDates.length > 0) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const latestDate = new Date(loggedDates[0]);
        latestDate.setHours(0, 0, 0, 0);

        const diffDays = Math.ceil(Math.abs(today - latestDate) / (1000 * 60 * 60 * 24));

        if (diffDays <= 1) {
          moodStreak = 1;
          for (let i = 0; i < loggedDates.length - 1; i++) {
            const current = new Date(loggedDates[i]);
            current.setHours(0, 0, 0, 0);
            const prev = new Date(loggedDates[i + 1]);
            prev.setHours(0, 0, 0, 0);

            const dayDiff = Math.ceil(Math.abs(current - prev) / (1000 * 60 * 60 * 24));
            if (dayDiff === 1) {
              moodStreak++;
            } else if (dayDiff > 1) {
              break;
            }
          }
        }
      }
    } catch (e) {
      console.error("Failed to calculate streak in profile endpoint:", e);
    }

    return res.status(200).json({
      status: "ok",
      user,
      stats: {
        daysActive,
        assessmentsCount,
        bookingsCount,
        moodLogsCount,
        moodStreak,
      }
    });
  } catch (err) {
    next(err);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { name, bio, phone } = req.body || {};

    if (!name) {
      return res.status(400).json({ status: "error", message: "Name is a required field" });
    }

    const success = await User.updateProfile(userId, { name: name.trim(), bio: bio ? bio.trim() : null, phone: phone ? phone.trim() : null });

    if (!success) {
      return res.status(404).json({ status: "error", message: "User not found" });
    }

    const user = await User.getProfile(userId);

    return res.status(200).json({
      status: "ok",
      message: "Profile updated successfully",
      user,
    });
  } catch (err) {
    next(err);
  }
};

exports.getStudents = async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const offset = Number(req.query.offset) || 0;
    const q = (req.query.q || "").trim();

    const data = await User.getAllStudents(limit, offset, q);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

exports.getStudentById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findByIdWithDetails(id);
    if (!user) {
      return res.status(404).json({ message: "Student not found" });
    }
    res.json(user);
  } catch (err) {
    next(err);
  }
};
