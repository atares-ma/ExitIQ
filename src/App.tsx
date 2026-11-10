import { useEffect, useState } from 'react';
import Landing from './views/Landing';
import AssessmentApp from './views/assessment/AssessmentApp';

/** Two routes only: the landing page and the assessment. Vercel rewrites every path to index.html. */
export function navigate(path: string) {
  history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo(0, 0);
}

export default function App() {
  const [path, setPath] = useState(() => location.pathname);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  return path.startsWith('/assessment') ? <AssessmentApp /> : <Landing />;
}
