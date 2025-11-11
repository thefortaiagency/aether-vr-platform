import VRTraining from './VRTraining'
import CoachBroadcast from './CoachBroadcast'
import './index.css'

function App() {
  // Simple routing based on URL path
  const isCoachView = window.location.pathname === '/coach' || window.location.pathname === '/coach.html';

  return isCoachView ? <CoachBroadcast /> : <VRTraining />;
}

export default App
