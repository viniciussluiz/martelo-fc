import '@fontsource/lilita-one/400';
import '@fontsource/barlow/400';
import '@fontsource/barlow/500';
import '@fontsource/barlow/600';
import '@fontsource/barlow/700';
import '@fontsource/barlow-condensed/600';
import '@fontsource/barlow-condensed/700';
import '@fontsource/barlow-condensed/800';
import '@fontsource/silkscreen/400';
import '@fontsource/silkscreen/700';
import '@fontsource/kalam/700';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
