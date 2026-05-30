# MindMate Backend Server

This directory contains the Express.js backend server and PostgreSQL database configurations for MindMate, a mental health support platform for university students.

---

## Technical Stack

- **Runtime**: Node.js (v18+ recommended)
- **Framework**: Express.js
- **Database**: PostgreSQL (via `pgAdmin 4`)
- **Email Delivery**: Nodemailer
- **Authentication**: JSON Web Tokens (JWT) & bcryptjs hashing

---

## Prerequisites

- Node.js installed locally.
- PostgreSQL database service running.

---

## Getting Started

### 1. Configure Environment Variables

Create a `.env` file in the root of the `mindmate-server/` directory. Use the template below (or copy `.env.example`):

```ini
PORT=
DB_HOST=localhost
DB_PORT=
DB_NAME=mindmate
DB_USER=
DB_PASSWORD=your_db_password
CLIENT_ORIGIN=http://localhost:5173

# Mail server config (for verification and password resets)
MAIL_HOST=smtp.gmail.com
MAIL_PORT=
MAIL_SECURE=
MAIL_USER=
MAIL_PASS=
MAIL_FROM="MindMate" <your_email@gmail.com>

PASSWORD_RESET_EXPIRES_MIN=60
ALLOW_EMAIL_VERIFICATION_BYPASS=true
ADMIN_EMAIL=

# MindMate AI Chatbot key (optional, falls back to a simulated engine if omitted)
GEMINI_API_KEY=your_gemini_api_key
```

### 2. Install Dependencies

Run the package installation command inside the `mindmate-server/` folder:

```bash
npm install
```

## Core API Routing Index

- **`/api/auth`**: Student registration, expert applications setup, logins, password reset triggers.
- **`/api/experts`**: Expert directories, ratings retrieval, and dashboard profiles fetching.
- **`/api/expert-applications`**: Verifying and reviewing applications (Admin authorization required).
- **`/api/student-registry`**: University student registries lookup (Admin validation required).
- **`/api/unistudents`**: Student profile information updates and status queries.
- **`/api/moods`**: Mood tracking logs insertion, history limits, and streak statistics summary.
- **`/api/peer-groups`**: Peer support group rooms, messages postings, and user reactions.
- **`/api/assessments`**: Interactive mental health questionnaire taking and scores grading.
- **`/api/sessions`**: Expert-led group video schedule management and student bookings.
- **`/api/resources`**: Clinical articles, audios, and video guides uploading/libraries.
- **`/api/chatbot`**: AI-driven student messaging companion endpoints (Student role restricted).
