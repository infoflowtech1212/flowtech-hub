import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorState } from './ui/states';

interface Props {
  children: ReactNode;
  /** Custom fallback; defaults to a compact retry card. */
  fallback?: ReactNode;
  /** Label used in console diagnostics (e.g. widget name). */
  label?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Reliability guard: a single failing widget renders its own fallback instead
 * of white-screening the whole app (lesson from the earlier crash). Wrap each
 * dashboard widget and each route in one of these.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary${this.props.label ? `:${this.props.label}` : ''}]`, error, info);
  }

  reset = () => this.setState({ hasError: false, error: undefined });

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <ErrorState message={this.state.error?.message} onRetry={this.reset} />
        )
      );
    }
    return this.props.children;
  }
}
