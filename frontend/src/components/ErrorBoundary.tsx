import { Component, type ErrorInfo, type ReactNode } from 'react'

/** Last line of defence: a render error shows a recovery screen instead of a blank page. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div className="max-w-sm space-y-3">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="text-sm text-slate-400">The page hit an unexpected error. Your data is safe on the server.</p>
          <button onClick={() => window.location.reload()} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110">
            Reload
          </button>
        </div>
      </div>
    )
  }
}
