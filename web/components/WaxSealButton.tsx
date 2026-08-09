'use client';

interface WaxSealButtonProps {
  label: string;
  onClick: () => void;
  caption?: string;
}

export default function WaxSealButton({ label, onClick, caption }: WaxSealButtonProps) {
  return (
    <button type="button" className="wax-seal-btn" onClick={onClick} aria-label={label}>
      <svg viewBox="0 0 96 96" className="wax-seal-svg" aria-hidden="true">
        <defs>
          <radialGradient id="waxGrad" cx="38%" cy="30%" r="78%">
            <stop offset="0%" className="wax-stop-a" />
            <stop offset="55%" className="wax-stop-b" />
            <stop offset="100%" className="wax-stop-c" />
          </radialGradient>
        </defs>
        <path
          className="wax-blob"
          d="M47 6 C 62 4, 79 17, 84 33 C 88 48, 83 66, 73 75 C 63 84, 46 91, 31 85 C 15 79, 7 63, 9 47 C 11 31, 23 11, 42 8 Z"
          fill="url(#waxGrad)"
        />
        <circle className="wax-ring" cx="47" cy="47" r="32" />
        <circle className="wax-ring wax-ring-inner" cx="47" cy="47" r="25" />
        <text className="wax-heart" x="47" y="56" textAnchor="middle">
          ♥
        </text>
      </svg>
      {caption && <span className="hand wax-seal-caption">{caption}</span>}
    </button>
  );
}
