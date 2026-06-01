const app = require("./src/app");

const PORT = process.env.PORT || 5000;

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`MindMate API listening on port ${PORT}`);
  });
}

module.exports = app;
