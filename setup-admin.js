#!/usr/bin/env node

/**
 * One-time admin setup script
 * Generates secure admin credentials for initial setup
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');

async function generateAdminCredentials() {
  // Generate a strong random password
  const password = crypto.randomBytes(12).toString('base64');

  // Hash the password with bcrypt
  const hash = await bcrypt.hash(password, 10);

  console.log('='.repeat(70));
  console.log('ALTERNASSIST ADMIN CREDENTIALS - SAVE THESE IMMEDIATELY!');
  console.log('='.repeat(70));
  console.log('');
  console.log('  Username: admin');
  console.log('  Password:', password);
  console.log('');
  console.log('='.repeat(70));
  console.log('');
  console.log('IMPORTANT:');
  console.log('  - Save these credentials in a secure location (password manager)');
  console.log('  - You will need them to log in to the admin panel');
  console.log('  - This password will only be shown once');
  console.log('');
  console.log('Password hash for migration (internal use):');
  console.log(hash);
  console.log('');
  console.log('='.repeat(70));

  return hash;
}

generateAdminCredentials().catch(console.error);
