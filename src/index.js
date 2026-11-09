// src/index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import AppWrapper from './App'; // Renommé pour plus de clarté
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min';
import 'iconify-icon'; // Active les balises <iconify-icon>
import './App.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <AppWrapper />
  </React.StrictMode>
);