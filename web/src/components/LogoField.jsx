import { useState } from 'react';

const LOGO_SIZE = 128;

// Downsizes the picked image to fit LOGO_SIZE and returns it as a PNG data URL,
// so logos stay small enough to store on the team or account row.
function readLogo(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, LOGO_SIZE / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as an image.'));
    };
    image.src = url;
  });
}

// A logo preview with upload / change / remove. Without a logo the preview is
// the name's initial on a badge, coloured by badgeClassName.
export default function LogoField({ logo, name, badgeClassName, onChange }) {
  const [error, setError] = useState(null);

  async function pick(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
      onChange(await readLogo(file));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="logo-field">
      Logo
      <div className="logo-row">
        {logo ? (
          <img className="logo-preview" src={logo} alt="" />
        ) : (
          <span className={`logo-preview ${badgeClassName}`}>{name.trim().charAt(0).toUpperCase() || '?'}</span>
        )}
        <label className="ghost logo-pick">
          {logo ? 'Change' : 'Upload logo'}
          <input type="file" accept="image/*" hidden onChange={pick} />
        </label>
        {logo && (
          <button type="button" className="ghost" onClick={() => onChange(null)}>
            Remove
          </button>
        )}
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
