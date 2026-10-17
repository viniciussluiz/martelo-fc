import '@fontsource/big-shoulders-display/700';
import '@fontsource/big-shoulders-display/800';
import '@fontsource/big-shoulders-display/900';
import '@fontsource/public-sans/400';
import '@fontsource/public-sans/600';
import '@fontsource/public-sans/700';
import '@fontsource/public-sans/400-italic';
import '@fontsource/kalam/400';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
