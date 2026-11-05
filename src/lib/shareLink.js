const crypto = require('crypto');

// One link that signs anyone who opens it in as a single guest user, so a person
// can try an account without signing up. Off unless both env vars are set:
//   SHARE_LINK_TOKEN    the secret in the link, /?share=<token>
//   SHARE_LINK_USER_ID  the user it signs in as, who must be a member
// Removing that user ends every session the link has started.
const MIN_TOKEN_LENGTH = 32;

const digest = (value) => crypto.createHash('sha256').update(String(value)).digest();

const guestUserId = () => process.env.SHARE_LINK_USER_ID || null;

// The user a link's token signs in as, or null if the token is wrong or the link is off.
function shareLinkUserId(token) {
  const secret = process.env.SHARE_LINK_TOKEN;
  if (!secret || secret.length < MIN_TOKEN_LENGTH || !guestUserId()) return null;
  return crypto.timingSafeEqual(digest(token), digest(secret)) ? guestUserId() : null;
}

const isShareLinkUser = (user) => guestUserId() !== null && String(user.id) === guestUserId();

module.exports = { shareLinkUserId, isShareLinkUser };
