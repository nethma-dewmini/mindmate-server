const { createClient } = require("@supabase/supabase-js");

let supabase = null;

function getClient() {
  if (!supabase && process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  }
  return supabase;
}

function isConfigured() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_KEY);
}

/**
 * Uploads a file buffer to a specified Supabase storage bucket
 * @param {string} bucketName - Name of the bucket (e.g. 'expert-resources')
 * @param {string} filePath - Path in the bucket (e.g. 'resource-12345/file.pdf')
 * @param {Buffer} fileBuffer - The file content buffer
 * @param {string} mimeType - The file mime type
 */
async function uploadFile(bucketName, filePath, fileBuffer, mimeType) {
  const client = getClient();
  if (!client) {
    throw new Error("Supabase client is not configured");
  }

  const { data, error } = await client.storage
    .from(bucketName)
    .upload(filePath, fileBuffer, {
      contentType: mimeType,
      upsert: true,
    });

  if (error) {
    throw error;
  }
  return data;
}

/**
 * Retrieves the public URL for an asset in a public bucket
 * @param {string} bucketName - Name of the bucket
 * @param {string} filePath - Path in the bucket
 */
function getPublicUrl(bucketName, filePath) {
  const client = getClient();
  if (!client) return null;
  const { data } = client.storage.from(bucketName).getPublicUrl(filePath);
  return data?.publicUrl || null;
}

/**
 * Generates a temporary signed URL for an asset in a private bucket
 * @param {string} bucketName - Name of the bucket
 * @param {string} filePath - Path in the bucket
 * @param {number} expiresIn - Expiry in seconds
 */
async function getSignedUrl(bucketName, filePath, expiresIn = 60) {
  const client = getClient();
  if (!client) return null;
  const { data, error } = await client.storage
    .from(bucketName)
    .createSignedUrl(filePath, expiresIn);

  if (error) {
    throw error;
  }
  return data?.signedUrl || null;
}

/**
 * Deletes a file from a specified Supabase storage bucket
 * @param {string} bucketName - Name of the bucket
 * @param {string} filePath - Path in the bucket
 */
async function deleteFile(bucketName, filePath) {
  const client = getClient();
  if (!client) return null;
  const { data, error } = await client.storage
    .from(bucketName)
    .remove([filePath]);

  if (error) {
    console.error(`Error deleting file ${filePath} from Supabase bucket ${bucketName}:`, error);
  }
  return data;
}

module.exports = {
  isConfigured,
  uploadFile,
  getPublicUrl,
  getSignedUrl,
  deleteFile,
};
