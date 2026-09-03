import { Component, type ReactNode } from "react";

/**
 * The last line of defence against a white screen.
 *
 * Every phone renders the same live data, so a single malformed write — a course id
 * the UI doesn't know, a shape a screen doesn't expect — would otherwise crash all
 * twenty of them at once, each showing a blank page with no way back. React unmounts
 * the whole tree on an uncaught render error; this catches it and offers the one
 * remedy that always exists: reload, which also picks up any fix just deployed.
 */
interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Render crashed", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-dvh grid place-items-center px-6">
        <div className="card p-5 max-w-sm text-center">
          <h1 className="font-semibold text-slate-100">The screen hit an error</h1>
          <p className="text-sm text-slate-400 mt-2 leading-relaxed">
            Something in the app crashed. Scores live in the database, not on this
            screen, so nothing entered has been lost.
          </p>
          <p className="text-[11px] text-slate-600 mt-3 num break-words">
            {this.state.error.message}
          </p>
          <button className="btn-ghost w-full mt-4 text-sm" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
