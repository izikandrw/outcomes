// Logos are small image data URLs the web client downsizes before upload, kept
// on the row they belong to (teams.logo, accounts.logo).
const MAX_LOGO_LENGTH = 100000;

const validLogo = (logo) =>
  logo == null || (typeof logo === 'string' && logo.length <= MAX_LOGO_LENGTH && /^data:image\/(png|jpeg|webp|gif);base64,/.test(logo));

const LOGO_ERROR = 'logo must be a small png, jpeg, webp or gif data URL';

module.exports = { validLogo, LOGO_ERROR };
