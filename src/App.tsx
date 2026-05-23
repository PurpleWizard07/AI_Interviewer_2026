import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import SetupPage from './pages/SetupPage'
import InterviewPage from './pages/InterviewPage'
import DebriefPage from './pages/DebriefPage'
import VoiceTestPage from './pages/VoiceTestPage'

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<SetupPage />} />
          <Route path="/interview" element={<InterviewPage />} />
          <Route path="/debrief/:sessionId" element={<DebriefPage />} />
          <Route path="/voice-test" element={<VoiceTestPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
