const MoodEntry = require("../models/MoodEntry");

exports.getSummary = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const avgMood = await MoodEntry.getTodayAverage(userId);
    const avgMoodYesterday = await MoodEntry.getYesterdayAverage(userId);
    const count = await MoodEntry.countDistinctDays(userId);

    const loggedDates = await MoodEntry.getLoggedDates(userId);
    let streak = 0;

    if (loggedDates.length > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const firstEntryDate = new Date(loggedDates[0]);
      firstEntryDate.setHours(0, 0, 0, 0);

      const diffDaysFirst = Math.floor((today - firstEntryDate) / (1000 * 60 * 60 * 24));

      if (diffDaysFirst <= 1) {
        streak = 1;
        let expectedDate = new Date(firstEntryDate);
        for (let i = 1; i < loggedDates.length; i++) {
          expectedDate.setDate(expectedDate.getDate() - 1);
          const currentDate = new Date(loggedDates[i]);
          currentDate.setHours(0, 0, 0, 0);
          if (currentDate.getTime() === expectedDate.getTime()) {
            streak++;
          } else {
            break;
          }
        }
      }
    }

    res.json({
      count,
      avg_mood: avgMood,
      avg_mood_yesterday: avgMoodYesterday,
      streak
    });
  } catch (err) {
    next(err);
  }
};

exports.getMoods = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const offset = Number(req.query.offset) || 0;

    const moods = await MoodEntry.getAll(userId, limit, offset);
    res.json(moods);
  } catch (err) {
    next(err);
  }
};

exports.getMoodById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const mood = await MoodEntry.findById(id, userId);
    if (!mood) {
      return res.status(404).json({ error: "entry not found" });
    }
    res.json(mood);
  } catch (err) {
    next(err);
  }
};

exports.createMood = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { mood, note = null } = req.body;

    if (typeof mood === "undefined" || mood === null) {
      return res.status(400).json({ error: "mood is required" });
    }

    const moodInt = Number(mood);
    if (isNaN(moodInt) || moodInt < 1 || moodInt > 5) {
      return res.status(400).json({ error: "mood must be an integer between 1 and 5" });
    }

    const newMood = await MoodEntry.create(userId, moodInt, note);
    res.status(201).json(newMood);
  } catch (err) {
    next(err);
  }
};

exports.updateMood = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { mood, note } = req.body;

    let moodInt;
    if (typeof mood !== "undefined" && mood !== null) {
      moodInt = Number(mood);
      if (isNaN(moodInt) || moodInt < 1 || moodInt > 5) {
        return res.status(400).json({ error: "mood must be an integer between 1 and 5" });
      }
    }

    const updatedMood = await MoodEntry.update(id, userId, moodInt, note);
    if (!updatedMood) {
      return res.status(404).json({ error: "entry not found or no fields to update" });
    }
    res.json(updatedMood);
  } catch (err) {
    next(err);
  }
};

exports.deleteMood = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const success = await MoodEntry.delete(id, userId);
    if (!success) {
      return res.status(404).json({ error: "entry not found" });
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
