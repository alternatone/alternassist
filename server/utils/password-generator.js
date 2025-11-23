const crypto = require('crypto');

/**
 * Generate a secure, memorable password in format: "Word-Word-####"
 * Example: "Blue-Horse-7234"
 *
 * @returns {string} Generated password
 */
function generateSecurePassword() {
    const adjectives = [
        'Azure', 'Blue', 'Crimson', 'Golden', 'Silver', 'Emerald', 'Purple', 'Scarlet',
        'Amber', 'Jade', 'Ruby', 'Copper', 'Bronze', 'Violet', 'Indigo', 'Cyan',
        'Bright', 'Dark', 'Swift', 'Bold', 'Quiet', 'Loud', 'Warm', 'Cool'
    ];

    const nouns = [
        'Tiger', 'Eagle', 'Dragon', 'Phoenix', 'Wolf', 'Bear', 'Hawk', 'Lion',
        'Falcon', 'Raven', 'Lynx', 'Cobra', 'Puma', 'Shark', 'Whale', 'Dolphin',
        'Mountain', 'River', 'Ocean', 'Forest', 'Storm', 'Thunder', 'Lightning', 'Wind'
    ];

    // Randomly select adjective and noun
    const adjective = adjectives[crypto.randomInt(0, adjectives.length)];
    const noun = nouns[crypto.randomInt(0, nouns.length)];

    // Generate 4-digit number
    const number = crypto.randomInt(1000, 9999);

    return `${adjective}-${noun}-${number}`;
}

/**
 * Generate a simple numeric password
 * Example: "8472-3951"
 *
 * @returns {string} Generated password
 */
function generateNumericPassword() {
    const part1 = crypto.randomInt(1000, 9999);
    const part2 = crypto.randomInt(1000, 9999);
    return `${part1}-${part2}`;
}

/**
 * Generate a random alphanumeric password
 * Example: "aB9kL2mP"
 *
 * @param {number} length - Length of password (default: 12)
 * @returns {string} Generated password
 */
function generateAlphanumericPassword(length = 12) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let password = '';
    const randomBytes = crypto.randomBytes(length);

    for (let i = 0; i < length; i++) {
        password += chars[randomBytes[i] % chars.length];
    }

    return password;
}

module.exports = {
    generateSecurePassword,
    generateNumericPassword,
    generateAlphanumericPassword
};
