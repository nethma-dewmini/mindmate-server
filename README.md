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
