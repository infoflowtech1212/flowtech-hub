import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="text-6xl font-extrabold tracking-tightest text-accent">404</p>
      <h1 className="mt-2 text-xl font-bold">Page not found</h1>
      <p className="mt-1 text-sm text-muted">That page doesn't exist inside FlowTech Hub.</p>
      <Link to="/" className="ft-btn-primary mt-6">
        Back to dashboard
      </Link>
    </div>
  );
}
