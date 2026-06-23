const db = require('../db');

class RegistrationOtp {
  /**
   * Creates a new OTP code for registration, after deleting any previous pending ones.
   */
  static async createOtp(email, registrationNo, otpCode, expiresAt) {
    // 1. Delete previous OTP entries for this email and registration number to keep the DB clean
    await db.query(
      `DELETE FROM registration_otps 
       WHERE LOWER(email) = LOWER($1) OR registration_no = $2`,
      [email, registrationNo]
    );

    // 2. Insert new OTP
    const result = await db.query(
      `INSERT INTO registration_otps (email, registration_no, otp_code, expires_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING id, email, registration_no, created_at`,
      [email, registrationNo, otpCode, expiresAt]
    );

    return result.rows[0];
  }

  /**
   * Verifies the OTP code. If valid, marks it as verified.
   */
  static async verifyOtp(email, registrationNo, otpCode) {
    const result = await db.query(
      `UPDATE registration_otps
       SET verified = true, updated_at = NOW()
       WHERE LOWER(email) = LOWER($1)
         AND registration_no = $2
         AND otp_code = $3
         AND expires_at > NOW()
         AND verified = false
       RETURNING id`,
      [email, registrationNo, otpCode]
    );

    return result.rowCount > 0;
  }

  /**
   * Checks if the email and registration number have been verified via OTP in the last 15 minutes.
   */
  static async isEmailVerified(email, registrationNo) {
    const result = await db.query(
      `SELECT id 
       FROM registration_otps
       WHERE LOWER(email) = LOWER($1)
         AND registration_no = $2
         AND verified = true
         AND updated_at > NOW() - INTERVAL '15 minutes'
       LIMIT 1`,
      [email, registrationNo]
    );

    return result.rowCount > 0;
  }
}

module.exports = RegistrationOtp;
