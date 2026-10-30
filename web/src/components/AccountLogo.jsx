// The account's logo, or its name's initial on a badge when it has none.
// size is in pixels; the CSS sizes the badge's initial to match.
export default function AccountLogo({ account, size = 24, className = '' }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.5) };
  return account.logo ? (
    <img className={`account-logo ${className}`} src={account.logo} alt="" style={style} />
  ) : (
    <span className={`account-logo account-initial-badge ${className}`} style={style} aria-hidden="true">
      {account.name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}
