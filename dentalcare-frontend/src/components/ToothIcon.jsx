const SHAPES = {
  incisor: 'M6 22 C6 10 9 4 14 3 L18 3 C23 4 26 10 26 22 C26 27 20 29 16 29 C12 29 6 27 6 22 Z',
  canine: 'M8 22 C8 11 11 5 16 3 C21 5 24 11 24 22 C24 27 19 29 16 29 C13 29 8 27 8 22 Z',
  premolar: 'M4 22 C4 9 8 3 16 2 C24 3 28 9 28 22 C28 27 22 29 16 29 C10 29 4 27 4 22 Z M10 12 C12 14 20 14 22 12',
  molar: 'M3 22 C3 8 7 2 16 1 C25 2 29 8 29 22 C29 27 23 30 16 30 C9 30 3 27 3 22 Z M8 11 C11 14 21 14 24 11 M9 17 C12 19 20 19 23 17',
};

export default function ToothIcon({ type = 'molar', size = 'lg', className = '' }) {
  const dim = size === 'sm' ? 22 : 30;
  return (
    <svg
      className={`dc-tooth-icon ${className}`.trim()}
      viewBox="0 0 32 32"
      width={dim}
      height={dim}
      aria-hidden="true"
    >
      <path d={SHAPES[type] || SHAPES.molar} fill="currentColor" />
    </svg>
  );
}
