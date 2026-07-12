import { Navigate, Route, Routes } from 'react-router-dom';
import { useSession } from './state';
import Welcome from './pages/Welcome';
import Home from './pages/Home';
import Files from './pages/Files';
import Launch from './pages/Launch';
import Settings from './pages/Settings';
import Shell from './components/Shell';

export default function App() {
  const { user, loading } = useSession();

  if (loading) return null;

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Welcome />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/" element={<Home />} />
        <Route path="/files/*" element={<Files />} />
        <Route path="/launch" element={<Launch />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
