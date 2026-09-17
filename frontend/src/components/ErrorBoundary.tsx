"use client";

/**
 * Error Boundary — catches a render-time crash in any child component
 * (e.g. the map or waterfall canvas throwing on bad data) so the rest
 * of the operator console keeps working instead of going blank
 * mid-demo. Shows a clear, calm message and a retry button that
 * remounts the subtree.
 */

import React from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  label: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error(`[${this.props.label}] render error:`, error, info.componentStack);
  }

  private reset = () => this.setState({ hasError: false });

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="h-full w-full flex flex-col items-center justify-center gap-3 p-6 text-center bg-[var(--bg-secondary)]"
        >
          <div className="text-sm font-bold text-[var(--threat-high)]">
            {this.props.label} failed to render
          </div>
          <p className="text-xs text-[var(--text-muted)] max-w-xs">
            This panel hit an unexpected error. The rest of the dashboard is unaffected.
          </p>
          <button onClick={this.reset} className="btn-secondary">
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
