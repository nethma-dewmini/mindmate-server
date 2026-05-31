const express = require("express");
const cors = require("cors");
const path = require("path");

const routes = require("./routes");
const notFound = require("./middleware/notFound");
const errorHandler = require("./middleware/errorHandler");

const app = express();

const fs = require("fs");
const supabaseService = require("./utils/supabaseService");

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "*",
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Redirection proxy for uploads
app.get("/api/uploads/:bucket/:folder/:filename", async (req, res, next) => {
  try {
    const { bucket, folder, filename } = req.params;
    
    // Check if the file exists locally (backward compatibility)
    const localPath = path.join(__dirname, "../uploads", bucket, folder, filename);
    if (fs.existsSync(localPath)) {
      return res.sendFile(localPath);
    }

    // If not local, and Supabase is configured, redirect to Supabase
    if (supabaseService.isConfigured()) {
      let supabaseBucket = bucket;
      if (bucket === "resources") {
        supabaseBucket = "expert-resources";
      }

      const filePathInBucket = `${folder}/${filename}`;

      if (supabaseBucket === "expert-applications") {
        // Secure temporary signed URL for private applications
        const signedUrl = await supabaseService.getSignedUrl(supabaseBucket, filePathInBucket, 60);
        if (signedUrl) {
          return res.redirect(302, signedUrl);
        }
      } else {
        // Public URL for clinical resources
        const publicUrl = supabaseService.getPublicUrl(supabaseBucket, filePathInBucket);
        if (publicUrl) {
          return res.redirect(302, publicUrl);
        }
      }
    }

    return res.status(404).json({
      status: "error",
      message: "File not found",
    });
  } catch (err) {
    console.error("Error serving uploaded file:", err);
    next(err);
  }
});

// Serve uploaded files
app.use("/api/uploads", express.static(path.join(__dirname, "../uploads")));

app.use("/api", routes);

app.get("/", (req, res) => {
  res.status(200).json({
    message: "MindMate server is running",
    docs: "/api/health",
  });
});

app.use(notFound);
app.use(errorHandler);

module.exports = app;
