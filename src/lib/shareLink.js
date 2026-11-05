const crypto = require('crypto');

// Links that sign anyone who opens them in as a guest user, so a person can try
// an account without signing up. Each link is a secret token, /?share=<token>,
// and the user it signs in as, who must be a member. Off unless env vars set them:
//   SHARE_LINK_TOKEN, SHARE_LINK_USER_ID  one link
//   SHARE_LINKS                           more, as <token>:<userId>,<token>:<userId>
// Removing a link's user ends every session that link has started.
const MIN_TOKEN_LENGTH = 32;

const digest = (value) => crypto.createHash('sha256').update(String(value)).digest();

function links() {
  const more = (process.env.SHARE_LINKS || '').split(',').map((link) => {
    const [token, userId] = link.trim().split(':');
    return { token, userId };
  });
  return [{ token: process.env.SHARE_LINK_TOKEN, userId: process.env.SHARE_LINK_USER_ID }, ...more];
}

// The user a link's token signs in as, or null if the token is wrong or the link is off.
function shareLinkUserId(token) {
  const link = links().find(
    (candidate) =>
      candidate.userId &&
      candidate.token &&
      candidate.token.length >= MIN_TOKEN_LENGTH &&
      crypto.timingSafeEqual(digest(token), digest(candidate.token))
  );
  return link ? link.userId : null;
}

const isShareLinkUser = (user) => links().some((link) => link.userId && String(user.id) === link.userId);

module.exports = { shareLinkUserId, isShareLinkUser };
