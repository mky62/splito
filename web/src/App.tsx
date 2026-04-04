import { Navigate, Route, Routes } from 'react-router-dom'
import './App.css'
import CreatorPage from './pages/CreatorPage'
import SharedBillPage from './pages/SharedBillPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<CreatorPage />} />
      <Route path="/bill/:billId" element={<SharedBillPage />} />
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  )
}

export default App
