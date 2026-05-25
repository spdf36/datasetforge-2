// src/index.js — react-scripts entry point
import React from 'react';
import ReactDOM from 'react-dom/client';
import './renderer/styles/globals.css';
import './renderer/styles/app.css';
import App from './renderer/App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);