// Ce fichier permet d'utiliser les icônes plus et moins de Bootstrap pour garantir la visibilité
import React from 'react';

export function PlusIcon({ size = 20, color = '#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="7" y="3" width="2" height="10" rx="1" fill={color}/>
      <rect x="3" y="7" width="10" height="2" rx="1" fill={color}/>
    </svg>
  );
}

export function MinusIcon({ size = 20, color = '#fff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="7" width="10" height="2" rx="1" fill={color}/>
    </svg>
  );
}
