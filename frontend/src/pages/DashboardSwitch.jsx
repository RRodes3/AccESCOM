import AdminDashboard from './dashboards/AdminDashboard';
import UserDashboard from './dashboards/UserDashboard';
import GuardDashboard from './dashboards/GuardDashboard';

export default function DashboardSwitch() {
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  if (!user) return null;

  if (user.role === 'ADMIN') return <AdminDashboard />;
  if (user.role === 'GUARD')  return <GuardDashboard />;
  return <UserDashboard />;
}
