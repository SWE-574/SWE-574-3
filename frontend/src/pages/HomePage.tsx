import { Navigate } from 'react-router-dom'

// `/` always shows the dashboard — anonymous users browse the same feed
// (with sign-in prompts in the sidebar/navbar), authenticated users get
// the regular experience. There is no separate marketing landing page.
const HomePage = () => <Navigate to="/dashboard" replace />

export default HomePage
