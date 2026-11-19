import { Component, type ReactNode } from 'react';

/** Last line of defence: an unexpected rendering error shows a way back instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    console.error(error);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="container page" style={{ maxWidth: 560 }}>
        <div className="notice" data-tone="error" role="alert">
          Something went wrong on this page. <a href="/">Go to the home page</a> or <a href={window.location.pathname}>reload this page</a>.
        </div>
      </div>
    );
  }
}
