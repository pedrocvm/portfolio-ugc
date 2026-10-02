import './dashboard.css';
import './content-manager.css';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="dash">{children}</div>;
}
