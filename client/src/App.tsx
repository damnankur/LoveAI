import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Chat from './components/Chat';
import Login from './components/Login';
import PersonaEvaluation from './components/PersonaEvaluation';
import Profile from './components/Profile';
import Landing from './components/Landing';
import { initTheme } from './theme';

function App() {
  useEffect(() => {
    initTheme();
  }, []);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/evaluate" element={<PersonaEvaluation />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/login" element={<Login />} />
        <Route path="/profile" element={<Profile />} />
      </Routes>
    </Router>
  );
}

export default App;
