import { BrowserRouter as Router, Route, Routes, useNavigation } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthRole } from './lib/auth';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Profit from './pages/Profit';
import Inventory from './pages/Inventory';
import Review from './pages/Review';
import Recommendations from './pages/Recommendations';
import Audit from './pages/Audit';
import Settings from './pages/Settings';

function App() {
  const role = useAuthRole();
  const navigation = useNavigation();

  useEffect(() => {
    // optional: block navigation if not logged in
  }, [role, navigation]);

  return (
    <BrowserRouter>
      <Sidebar role={role} />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/profit" element={<Profit />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/review" element={<Review />} />
        <Route path="/recommend" element={<Recommendations />} />
        <Route path="/audit" element={<Audit />} />
        <Route path="/setting" element={<Settings />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
