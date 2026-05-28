ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS key TEXT;

UPDATE assessments
SET key = COALESCE(key, lower(regexp_replace(title, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(id::text, 1, 8))
WHERE key IS NULL OR key = '';

ALTER TABLE assessments
  ALTER COLUMN key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_assessments_key ON assessments (key);

ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES unistudents(id) ON DELETE SET NULL;

ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS icon TEXT NOT NULL DEFAULT '🧠';

ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS duration INTEGER NOT NULL DEFAULT 5;

ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private';

ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS questions JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

INSERT INTO assessments (key, title, description, icon, duration, visibility, questions)
VALUES
  (
    'stress',
    'Stress Level Assessment',
    'Evaluate your current stress load, common triggers, and how much it is affecting your routine.',
    '😰',
    6,
    'public',
    $$[{"prompt":"How often have deadlines or workload felt overwhelming recently?","options":["Never","Rarely","Sometimes","Often","Very often"]},{"prompt":"How much tension do you feel in your body during a typical day?","options":["None","A little","Moderate","A lot","Extreme"]},{"prompt":"How easy is it for you to switch off from academic or personal worries?","options":["Very easy","Easy","Mixed","Hard","Very hard"]},{"prompt":"How often do you feel your energy is drained by stress?","options":["Never","Rarely","Sometimes","Often","Always"]},{"prompt":"How confident do you feel in managing pressure right now?","options":["Very confident","Confident","Somewhat","Not much","Not at all"]}]$$::jsonb
  ),
  (
    'anxiety',
    'Anxiety Screening',
    'Check for recurring worry, nervousness, and body symptoms linked with anxiety.',
    '😟',
    7,
    'public',
    $$[{"prompt":"How often have you felt nervous or on edge in the last two weeks?","options":["Never","Several days","More than half the days","Nearly every day","Constantly"]},{"prompt":"How often do you struggle to stop worrying once it starts?","options":["Never","Rarely","Sometimes","Often","Always"]},{"prompt":"How much has anxiety affected your concentration?","options":["Not at all","A little","Moderately","A lot","Severely"]},{"prompt":"How often do you notice physical symptoms like a racing heart or restlessness?","options":["Never","Rarely","Sometimes","Often","Very often"]},{"prompt":"How much does fear of future events affect your day-to-day mood?","options":["Not at all","A little","Somewhat","Quite a bit","Extremely"]}]$$::jsonb
  ),
  (
    'depression',
    'Depression Screening (PHQ-9 style)',
    'Review mood, interest, motivation, and energy patterns associated with low mood.',
    '😔',
    8,
    'public',
    $$[{"prompt":"How often have you had little interest or pleasure in doing things?","options":["Not at all","Several days","More than half the days","Nearly every day","Almost always"]},{"prompt":"How often have you felt down, depressed, or hopeless?","options":["Not at all","Several days","More than half the days","Nearly every day","Almost always"]},{"prompt":"How often have you felt low energy or struggled to get started?","options":["Not at all","Several days","More than half the days","Nearly every day","Almost always"]},{"prompt":"How often have you had trouble sleeping or sleeping too much?","options":["Not at all","Several days","More than half the days","Nearly every day","Almost always"]},{"prompt":"How difficult has it been to handle daily tasks because of your mood?","options":["Not difficult","A little difficult","Moderately difficult","Very difficult","Extremely difficult"]}]$$::jsonb
  ),
  (
    'sleep',
    'Sleep Quality Assessment',
    'Measure sleep duration, sleep quality, and how refreshed you feel during the day.',
    '😴',
    5,
    'public',
    $$[{"prompt":"How would you describe your sleep quality over the last week?","options":["Excellent","Good","Fair","Poor","Very poor"]},{"prompt":"How often do you have trouble falling asleep?","options":["Never","Rarely","Sometimes","Often","Very often"]},{"prompt":"How often do you wake up during the night and struggle to sleep again?","options":["Never","Rarely","Sometimes","Often","Very often"]},{"prompt":"How refreshed do you feel when you wake up?","options":["Very refreshed","Refreshed","Neutral","Tired","Exhausted"]},{"prompt":"How much does poor sleep affect your concentration in the daytime?","options":["Not at all","A little","Somewhat","A lot","Extremely"]}]$$::jsonb
  )
ON CONFLICT (key) DO UPDATE
SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  duration = EXCLUDED.duration,
  visibility = EXCLUDED.visibility,
  questions = EXCLUDED.questions,
  updated_at = now();
